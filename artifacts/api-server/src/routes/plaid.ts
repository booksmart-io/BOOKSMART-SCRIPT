import { Router } from "express";
import { scheduleMonitoringEvaluation } from "../lib/monitoring-runner";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { getUserTier, PLAN_LIMITS, enforceConnectedAccountLimit } from "../lib/plan-limits";
import { decryptPlaidToken, encryptPlaidToken, plaidTokenNeedsEncryption } from "../lib/plaid-token-security";
import { fetchWithProviderRetry } from "../lib/provider-retry";

const router = Router();

const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";

type SupabaseAdmin = SupabaseClient<any, any, any>;

type PlaidAccount = {
  id?: string;
  account_id: string;
  name?: string;
  official_name?: string | null;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
};

type PlaidBalanceAccount = PlaidAccount & {
  balances?: { available?: number | null; current?: number | null; limit?: number | null; iso_currency_code?: string | null };
};

type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  datetime?: string | null;
  name?: string | null;
  merchant_name?: string | null;
  pending?: boolean;
  personal_finance_category?: {
    primary?: string | null;
    detailed?: string | null;
    confidence_level?: string | null;
  } | null;
  category?: string[] | null;
};

type PlaidErrorResponse = {
  error_message?: string;
  error_code?: string;
  display_message?: string | null;
  request_id?: string;
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const obj = err as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      error_message?: unknown;
      error_code?: unknown;
    };
    const parts = [obj.message, obj.details, obj.hint, obj.code, obj.error_message, obj.error_code]
      .filter((part): part is string | number => typeof part === "string" || typeof part === "number")
      .map(String)
      .filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");
  }
  if (typeof err === "string") return err;
  return fallback;
}

function adminClient(): SupabaseAdmin {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, key);
}

async function usablePlaidToken(admin: SupabaseAdmin, item: { id: number; access_token: string }): Promise<string> {
  const token = decryptPlaidToken(item.access_token);
  if (plaidTokenNeedsEncryption(item.access_token)) {
    const { error } = await admin
      .from("plaid_items")
      .update({ access_token: encryptPlaidToken(token), updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) throw error;
  }
  return token;
}

function plaidBaseUrl(): string {
  const env = (process.env.PLAID_ENV ?? "sandbox").toLowerCase();
  if (env === "production") return "https://production.plaid.com";
  if (env === "development") return "https://development.plaid.com";
  return "https://sandbox.plaid.com";
}

function envList(name: string, fallback: string): string[] {
  return (process.env[name] ?? fallback)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function plaidProducts(): string[] {
  const products = envList("PLAID_PRODUCTS", "transactions");
  if (products.length === 0) throw new Error("PLAID_PRODUCTS must include transactions");
  return products;
}

function plaidCountryCodes(): string[] {
  const countryCodes = envList("PLAID_COUNTRY_CODES", "US").map((code) => code.toUpperCase());
  if (countryCodes.length === 0 || countryCodes.some((code) => !/^[A-Z]{2}$/.test(code))) {
    throw new Error("PLAID_COUNTRY_CODES must be comma-separated two-letter country codes, for example US");
  }
  return countryCodes;
}

function plaidDaysRequested(): number {
  const days = Number(process.env.PLAID_DAYS_REQUESTED ?? 730);
  return Number.isFinite(days) && days > 0 ? Math.round(days) : 730;
}

async function plaidFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) throw new Error("Missing PLAID_CLIENT_ID or PLAID_SECRET");

  const request = { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }) };
  const response = path === "/transactions/sync"
    ? await fetchWithProviderRetry(`${plaidBaseUrl()}${path}`, request)
    : await fetch(`${plaidBaseUrl()}${path}`, request);
  const json = await response.json().catch(() => ({})) as PlaidErrorResponse;
  if (!response.ok) {
    const message = [
      json?.error_message,
      json?.display_message,
      json?.error_code,
      json?.request_id ? `request_id=${json.request_id}` : null,
    ].filter(Boolean).join(" | ") || "Plaid request failed";
    throw new Error(String(message));
  }
  return json as T;
}

async function getUserAndOrg(admin: SupabaseAdmin, authUserId: string, requestedOrgId?: unknown) {
  const { data: userRow, error: userError } = await admin
    .from("users")
    .select("id,email")
    .eq("auth_id", authUserId)
    .maybeSingle();
  if (userError) throw userError;
  if (!userRow) throw new Error("User profile not found");

  let orgQuery = admin
    .from("organizations")
    .select("id,name")
    .eq("owner_id", userRow.id);

  const parsedOrgId = Number(requestedOrgId);
  if (Number.isFinite(parsedOrgId) && parsedOrgId > 0) {
    orgQuery = orgQuery.eq("id", parsedOrgId);
  } else {
    orgQuery = orgQuery.order("id", { ascending: true }).limit(1);
  }

  const { data: orgRow, error: orgError } = await orgQuery.maybeSingle();
  if (orgError) throw orgError;
  if (!orgRow) throw new Error("Organization not found");

  return { userRow, orgRow };
}

function plaidCategory(tx: PlaidTransaction) {
  const pfc = tx.personal_finance_category;
  return {
    primary: pfc?.primary ?? null,
    detailed: pfc?.detailed ?? null,
    confidence_level: pfc?.confidence_level ?? null,
    legacy: tx.category ?? null,
  };
}

function transactionAmount(tx: PlaidTransaction): number {
  // Plaid returns positive amounts for money leaving the account. BookSmart uses
  // negative expenses and positive income, so flip Plaid's sign.
  return -Number(tx.amount ?? 0);
}

router.post("/plaid/link-token", requireAuth, async (req, res) => {
  try {
    const authUserId = req.supabaseUserId;
    if (!authUserId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const admin = adminClient();
    await enforceConnectedAccountLimit(admin, authUserId);
    const { userRow } = await getUserAndOrg(admin, authUserId, req.body?.org_id);
    const tier = await getUserTier(admin, authUserId);
    const limit = PLAN_LIMITS[tier].connectedAccountsLimit;

    if (Number.isFinite(limit)) {
      const { count } = await admin
        .from("plaid_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userRow.id)
        .eq("status", "active");
      if ((count ?? 0) >= limit) {
        res.status(403).json({
          error: "connected_account_limit",
          message: `Your ${tier} plan allows ${limit} connected account${limit === 1 ? "" : "s"}. Upgrade to connect more banks.`,
        });
        return;
      }
    }

    const data = await plaidFetch<{
      link_token: string;
      expiration: string;
      request_id: string;
    }>("/link/token/create", {
      user: { client_user_id: String(userRow.id) },
      client_name: "BookSmart",
      products: plaidProducts(),
      country_codes: plaidCountryCodes(),
      language: "en",
      transactions: { days_requested: plaidDaysRequested() },
    });

    res.json(data);
  } catch (err) {
    const message = errorMessage(err, "Plaid Link token failed");
    console.error("[plaid/link-token]", message, err);
    const status = message.includes("not found") || message.startsWith("Invalid") ? 404 : 500;
    res.status(status).json({ error: "plaid_link_token_failed", message });
  }
});

router.post("/plaid/exchange-public-token", requireAuth, async (req, res) => {
  try {
    const authUserId = req.supabaseUserId;
    if (!authUserId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const publicToken = String(req.body?.public_token ?? "");
    if (!publicToken) {
      res.status(400).json({ error: "missing_public_token" });
      return;
    }

    const admin = adminClient();
    await enforceConnectedAccountLimit(admin, authUserId);
    const { userRow, orgRow } = await getUserAndOrg(admin, authUserId, req.body?.org_id);
    const exchange = await plaidFetch<{
      access_token: string;
      item_id: string;
      request_id: string;
    }>("/item/public_token/exchange", { public_token: publicToken });

    const institution = req.body?.metadata?.institution ?? {};
    const { data: itemRow, error: itemError } = await admin
      .from("plaid_items")
      .upsert({
        user_id: userRow.id,
        org_id: orgRow.id,
        plaid_item_id: exchange.item_id,
        access_token: encryptPlaidToken(exchange.access_token),
        institution_id: institution.institution_id ?? null,
        institution_name: institution.name ?? null,
        status: "active",
        updated_at: new Date().toISOString(),
      }, { onConflict: "plaid_item_id" })
      .select("id,institution_name")
      .single();
    if (itemError) throw itemError;

    const accounts = (req.body?.metadata?.accounts ?? []) as PlaidAccount[];
    if (accounts.length > 0) {
      const accountRows = accounts.map((account) => ({
        plaid_item_id: itemRow.id,
        plaid_account_id: account.account_id ?? account.id,
        name: account.name ?? "Account",
        official_name: account.official_name ?? null,
        mask: account.mask ?? null,
        type: account.type ?? null,
        subtype: account.subtype ?? null,
        updated_at: new Date().toISOString(),
      })).filter((account) => account.plaid_account_id);
      const { error: accountsError } = await admin
        .from("plaid_accounts")
        .upsert(accountRows, { onConflict: "plaid_item_id,plaid_account_id" });
      if (accountsError) throw accountsError;
    }

    res.json({ ok: true, item_id: itemRow.id, institution_name: itemRow.institution_name });
  } catch (err) {
    const message = errorMessage(err, "Plaid exchange failed");
    console.error("[plaid/exchange-public-token]", message, err);
    const status = message.includes("not found") || message.startsWith("Invalid") ? 404 : 500;
    res.status(status).json({ error: "plaid_exchange_failed", message });
  }
});

router.post("/plaid/sync", requireAuth, async (req, res) => {
  try {
    const authUserId = req.supabaseUserId;
    if (!authUserId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const admin = adminClient();
    await enforceConnectedAccountLimit(admin, authUserId);
    const { userRow, orgRow } = await getUserAndOrg(admin, authUserId, req.body?.org_id);
    let itemsQuery = admin
      .from("plaid_items")
      .select("id,org_id,access_token,transactions_cursor")
      .eq("user_id", userRow.id)
      .eq("org_id", orgRow.id)
      .eq("status", "active");

    const itemId = req.body?.item_id;
    if (itemId) itemsQuery = itemsQuery.eq("id", itemId);

    const { data: items, error: itemsError } = await itemsQuery;
    if (itemsError) throw itemsError;

    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;

    for (const item of items ?? []) {
      const syncStartedAt = new Date().toISOString();
      const { error: runningStatusError } = await admin
        .from("plaid_items")
        .update({ last_sync_status: "running", last_sync_error: null, updated_at: syncStartedAt })
        .eq("id", item.id)
        .eq("org_id", orgRow.id);
      if (runningStatusError) throw runningStatusError;

      try {
        let cursor = item.transactions_cursor as string | null;
        let hasMore = true;
        const accessToken = await usablePlaidToken(admin, item);

        while (hasMore) {
          const sync = await plaidFetch<{
            added: PlaidTransaction[];
            modified: PlaidTransaction[];
            removed: Array<{ transaction_id: string }>;
            next_cursor: string;
            has_more: boolean;
          }>("/transactions/sync", {
            access_token: accessToken,
            cursor: cursor || undefined,
            count: 500,
          });

          const rows = [...(sync.added ?? []), ...(sync.modified ?? [])].map((tx) => {
            const amount = transactionAmount(tx);
            return {
              user_id: userRow.id,
              org_id: item.org_id,
              title: tx.merchant_name || tx.name || "Plaid transaction",
              amount,
              type: "Business",
              date_time: new Date(tx.datetime || tx.date).toISOString(),
              description: tx.name || tx.merchant_name || "",
              deductible: amount < 0,
              plaid_transaction_id: tx.transaction_id,
              plaid_account_id: tx.account_id,
              plaid_category: plaidCategory(tx),
              pending: tx.pending ?? false,
            };
          });

          if (rows.length > 0) {
            const { error: txError } = await admin
              .from("transactions")
              .upsert(rows, { onConflict: "org_id,plaid_transaction_id" });
            if (txError) throw txError;
          }

          const removedIds = (sync.removed ?? []).map((tx) => tx.transaction_id).filter(Boolean);
          if (removedIds.length > 0) {
            const { error: removeError } = await admin
              .from("transactions")
              .delete()
              .eq("org_id", item.org_id)
              .in("plaid_transaction_id", removedIds);
            if (removeError) throw removeError;
          }

          addedCount += sync.added?.length ?? 0;
          modifiedCount += sync.modified?.length ?? 0;
          removedCount += removedIds.length;
          cursor = sync.next_cursor;
          hasMore = sync.has_more;
        }

        const completedAt = new Date().toISOString();
        const { error: cursorError } = await admin
          .from("plaid_items")
          .update({
            transactions_cursor: cursor,
            last_synced_at: completedAt,
            last_sync_status: "completed",
            last_sync_error: null,
            updated_at: completedAt,
          })
          .eq("id", item.id)
          .eq("org_id", orgRow.id);
        if (cursorError) throw cursorError;
      } catch (error) {
        const message = errorMessage(error, "Plaid sync failed").slice(0, 500);
        await admin
          .from("plaid_items")
          .update({ last_sync_status: "failed", last_sync_error: message, updated_at: new Date().toISOString() })
          .eq("id", item.id)
          .eq("org_id", orgRow.id);
        throw error;
      }
    }

    if (addedCount + modifiedCount + removedCount > 0) scheduleMonitoringEvaluation(admin, Number(orgRow.id), "plaid_sync");

    res.json({
      ok: true,
      added: addedCount,
      modified: modifiedCount,
      removed: removedCount,
    });
  } catch (err) {
    const message = errorMessage(err, "Plaid sync failed");
    console.error("[plaid/sync]", message, err);
    res.status(500).json({ error: "plaid_sync_failed", message });
  }
});

router.get("/plaid/balances", requireAuth, async (req, res) => {
  try {
    const authUserId = req.supabaseUserId;
    if (!authUserId) { res.status(401).json({ error: "unauthorized" }); return; }
    const admin = adminClient();
    const { orgRow } = await getUserAndOrg(admin, authUserId, req.query?.org_id);
    const { data: items, error } = await admin.from("plaid_items")
      .select("id,access_token,institution_name,status").eq("org_id", orgRow.id).eq("status", "active");
    if (error) throw error;
    const accounts: Array<Record<string, unknown>> = [];
    for (const item of items ?? []) {
      const result = await plaidFetch<{ accounts?: PlaidBalanceAccount[] }>("/accounts/balance/get", { access_token: await usablePlaidToken(admin, item) });
      for (const account of result.accounts ?? []) accounts.push({
        account_id: account.account_id, name: account.name ?? account.official_name ?? "Account",
        official_name: account.official_name ?? null, mask: account.mask ?? null, type: account.type ?? null,
        subtype: account.subtype ?? null, institution_name: item.institution_name ?? null,
        current: account.balances?.current ?? null, available: account.balances?.available ?? null,
        limit: account.balances?.limit ?? null, currency: account.balances?.iso_currency_code ?? "USD",
      });
    }
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data: recentTransactions, error: transactionError } = await admin.from("transactions")
      .select("plaid_account_id,amount")
      .eq("org_id", orgRow.id)
      .gte("date_time", since.toISOString())
      .not("plaid_account_id", "is", null);
    if (transactionError) throw transactionError;
    const movementByAccount = new Map<string, number>();
    for (const transaction of recentTransactions ?? []) {
      const accountId = String(transaction.plaid_account_id ?? "");
      movementByAccount.set(accountId, (movementByAccount.get(accountId) ?? 0) + Number(transaction.amount ?? 0));
    }
    const accountsWithTrends: Array<Record<string, unknown> & { change_amount: number; change_percent: number | null }> = accounts.map((account) => {
      const accountId = String(account.account_id ?? "");
      const movement = movementByAccount.get(accountId) ?? 0;
      const isDebt = ["credit", "loan"].includes(String(account.type ?? ""));
      const signedCurrent = (isDebt ? -1 : 1) * Number(account.current ?? account.available ?? 0);
      const signedPrevious = signedCurrent - movement;
      return {
        ...account,
        change_amount: movement,
        change_percent: signedPrevious === 0 ? null : (movement / Math.abs(signedPrevious)) * 100,
      };
    });
    const refreshedAt = new Date().toISOString();
    if (accountsWithTrends.length > 0) {
      const { error: snapshotError } = await admin.from("account_balance_snapshots").upsert(accountsWithTrends.map(account => ({
        organization_id: orgRow.id, provider: "plaid", external_account_id: String(account.account_id),
        account_name: String(account.name), account_type: account.type, account_subtype: account.subtype,
        current_balance: account.current, available_balance: account.available, credit_limit: account.limit,
        currency: account.currency, balance_timestamp: refreshedAt,
        metadata: { institution_name: account.institution_name, change_amount: account.change_amount, change_percent: account.change_percent },
      })), { onConflict: "organization_id,provider,external_account_id,balance_timestamp" });
      if (snapshotError && snapshotError.code !== "42P01") console.warn("[plaid/balances] snapshot warning:", snapshotError.message);
    }
    res.json({ accounts: accountsWithTrends, refreshed_at: refreshedAt, source: "live_provider_balance" });
  } catch (err) {
    const message = errorMessage(err, "Plaid balances failed");
    console.error("[plaid/balances]", message, err);
    res.status(500).json({ error: "plaid_balances_failed", message });
  }
});

router.delete("/plaid/items/:itemId", requireAuth, async (req, res) => {
  try {
    const authUserId = req.supabaseUserId;
    if (!authUserId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const itemId = Number(req.params.itemId);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      res.status(400).json({ error: "invalid_item_id" });
      return;
    }

    const admin = adminClient();
    const { userRow, orgRow } = await getUserAndOrg(admin, authUserId, req.query?.org_id ?? req.body?.org_id);

    const { data: item, error: itemError } = await admin
      .from("plaid_items")
      .select("id,user_id,org_id,access_token,institution_name")
      .eq("id", itemId)
      .eq("user_id", userRow.id)
      .eq("org_id", orgRow.id)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) {
      res.status(404).json({ error: "plaid_item_not_found", message: "Connected bank not found." });
      return;
    }

    const { data: accounts, error: accountsError } = await admin
      .from("plaid_accounts")
      .select("plaid_account_id")
      .eq("plaid_item_id", item.id);
    if (accountsError) throw accountsError;

    let plaidRemoveWarning: string | null = null;
    try {
      await plaidFetch<{ request_id?: string }>("/item/remove", { access_token: await usablePlaidToken(admin, item) });
    } catch (err) {
      plaidRemoveWarning = errorMessage(err, "Plaid item removal failed");
      console.warn("[plaid/delete-item] Plaid removal warning:", plaidRemoveWarning);
    }

    const plaidAccountIds = (accounts ?? [])
      .map((account) => String(account.plaid_account_id ?? ""))
      .filter(Boolean);

    let deletedTransactions = 0;
    if (plaidAccountIds.length > 0) {
      const { count, error: txDeleteError } = await admin
        .from("transactions")
        .delete({ count: "exact" })
        .eq("org_id", orgRow.id)
        .in("plaid_account_id", plaidAccountIds);
      if (txDeleteError) throw txDeleteError;
      deletedTransactions = count ?? 0;
    }

    const { error: itemDeleteError } = await admin
      .from("plaid_items")
      .delete()
      .eq("id", item.id)
      .eq("user_id", userRow.id)
      .eq("org_id", orgRow.id);
    if (itemDeleteError) throw itemDeleteError;

    scheduleMonitoringEvaluation(admin, Number(orgRow.id), "plaid_disconnect");

    res.json({
      ok: true,
      deleted_transactions: deletedTransactions,
      plaid_remove_warning: plaidRemoveWarning,
    });
  } catch (err) {
    const message = errorMessage(err, "Plaid account delete failed");
    console.error("[plaid/delete-item]", message, err);
    const status = /organization|profile|item not found/i.test(message) ? 404 : 500;
    res.status(status).json({ error: status === 404 ? "plaid_item_not_found" : "plaid_delete_failed", message: status === 404 ? "Connected bank not found." : message });
  }
});

export default router;
