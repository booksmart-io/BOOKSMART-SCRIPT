import { Router } from "express";
import { scheduleMonitoringEvaluation } from "../lib/monitoring-runner";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { createOAuthState, decryptToken, encryptToken, hashOAuthState, verifyOAuthState } from "../lib/quickbooks-oauth";
import { quickBooksSyncEnabled, syncQuickBooksToStaging } from "../lib/quickbooks-client";

const router = Router();
type AdminClient = SupabaseClient<any, any, any>;

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
};

type CompanyInfoResponse = {
  CompanyInfo?: { CompanyName?: string; LegalName?: string; Country?: string };
  Fault?: { Error?: Array<{ Message?: string; Detail?: string }> };
};

function adminClient(): AdminClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin client is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

function config() {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("QuickBooks OAuth environment variables are not configured");
  }
  const production = (process.env.QUICKBOOKS_ENVIRONMENT ?? "sandbox").toLowerCase() === "production";
  return {
    clientId,
    clientSecret,
    redirectUri,
    apiBase: production ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com",
  };
}

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:5173").replace(/\/+$/, "");
}

function callbackRedirect(result: "connected" | "error", reason?: string): string {
  const url = new URL("/user/settings", appUrl());
  url.searchParams.set("quickbooks", result);
  if (reason) url.searchParams.set("reason", reason);
  return url.toString();
}

async function ownedOrganization(admin: AdminClient, authUserId: string, requestedOrganizationId: unknown) {
  const organizationId = Number(requestedOrganizationId);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) throw new Error("Invalid organization_id");
  const { data: user, error: userError } = await admin.from("users").select("id").eq("auth_id", authUserId).maybeSingle();
  if (userError) throw userError;
  if (!user) throw new Error("User profile not found");
  const { data: organization, error: organizationError } = await admin
    .from("organizations").select("id,name").eq("id", organizationId).eq("owner_id", user.id).maybeSingle();
  if (organizationError) throw organizationError;
  if (!organization) throw new Error("Organization not found");
  return organization;
}

async function exchangeCode(code: string): Promise<TokenResponse> {
  const qb = config();
  const response = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${qb.clientId}:${qb.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: qb.redirectUri }),
  });
  const body = await response.json().catch(() => ({})) as Partial<TokenResponse> & { error_description?: string };
  if (!response.ok || !body.access_token || !body.refresh_token || !body.expires_in) {
    throw new Error(body.error_description || "QuickBooks token exchange failed");
  }
  return body as TokenResponse;
}

async function companyInfo(accessToken: string, realmId: string) {
  const response = await fetch(`${config().apiBase}/v3/company/${encodeURIComponent(realmId)}/companyinfo/${encodeURIComponent(realmId)}?minorversion=75`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const body = await response.json().catch(() => ({})) as CompanyInfoResponse;
  if (!response.ok || !body.CompanyInfo) {
    const fault = body.Fault?.Error?.[0];
    throw new Error(fault?.Detail || fault?.Message || "QuickBooks CompanyInfo verification failed");
  }
  return body.CompanyInfo;
}

async function revokeToken(token: string): Promise<void> {
  const qb = config();
  const response = await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${qb.clientId}:${qb.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw new Error("QuickBooks token revocation failed");
}

router.get("/integrations/quickbooks/connect", requireAuth, async (req, res) => {
  try {
    const authUserId = req.supabaseUserId!;
    const organization = await ownedOrganization(adminClient(), authUserId, req.query.organization_id);
    const qb = config();
    const state = createOAuthState(authUserId, Number(organization.id));
    const { error: stateError } = await adminClient().from("quickbooks_oauth_states").insert({
      state_hash: hashOAuthState(state),
      organization_id: organization.id,
      auth_user_id: authUserId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateError) throw stateError;
    const authorizationUrl = new URL("https://appcenter.intuit.com/connect/oauth2");
    authorizationUrl.search = new URLSearchParams({
      client_id: qb.clientId,
      response_type: "code",
      scope: "com.intuit.quickbooks.accounting",
      redirect_uri: qb.redirectUri,
      state,
    }).toString();
    res.json({ authorization_url: authorizationUrl.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start QuickBooks connection";
    const status = message.includes("not found") || message.startsWith("Invalid") ? 404 : 500;
    req.log?.error({ err: error }, "QuickBooks connect failed");
    res.status(status).json({ error: "quickbooks_connect_failed", message });
  }
});

router.get("/integrations/quickbooks/callback", async (req, res) => {
  try {
    if (req.query.error) throw new Error("authorization_denied");
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const realmId = typeof req.query.realmId === "string" ? req.query.realmId : "";
    const stateValue = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !realmId || !stateValue || !/^\d+$/.test(realmId)) throw new Error("invalid_callback");

    const state = verifyOAuthState(stateValue);
    const admin = adminClient();
    await ownedOrganization(admin, state.userId, state.organizationId);
    const { data: consumedState, error: stateError } = await admin.from("quickbooks_oauth_states")
      .delete().eq("state_hash", hashOAuthState(stateValue)).eq("organization_id", state.organizationId)
      .eq("auth_user_id", state.userId).gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
    if (stateError) throw stateError;
    if (!consumedState) throw new Error("invalid_callback");
    const tokens = await exchangeCode(code);
    const company = await companyInfo(tokens.access_token, realmId);
    const now = Date.now();
    const { error } = await admin.from("quickbooks_connections").upsert({
      organization_id: state.organizationId,
      realm_id: realmId,
      access_token_encrypted: encryptToken(tokens.access_token),
      refresh_token_encrypted: encryptToken(tokens.refresh_token),
      access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
      refresh_token_expires_at: tokens.x_refresh_token_expires_in
        ? new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString() : null,
      company_name: company.CompanyName ?? company.LegalName ?? null,
      country: company.Country ?? null,
      status: "active",
      verified_at: new Date(now).toISOString(),
      disconnected_at: null,
      updated_at: new Date(now).toISOString(),
    }, { onConflict: "organization_id" });
    if (error) throw error;
    res.redirect(303, callbackRedirect("connected"));
  } catch (error) {
    req.log?.error({ err: error }, "QuickBooks callback failed");
    const reason = error instanceof Error && ["authorization_denied", "invalid_callback"].includes(error.message)
      ? error.message : "connection_failed";
    res.redirect(303, callbackRedirect("error", reason));
  }
});

router.get("/integrations/quickbooks/status", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.supabaseUserId!, req.query.organization_id);
    const { data, error } = await admin.from("quickbooks_connections")
      .select("realm_id,company_name,country,status,verified_at,connected_at,updated_at")
      .eq("organization_id", organization.id).maybeSingle();
    if (error) throw error;
    res.json({ connected: data?.status === "active", connection: data ?? null });
  } catch (error) {
    req.log?.error({ err: error }, "QuickBooks status failed");
    res.status(500).json({ error: "quickbooks_status_failed", message: "Could not read QuickBooks status" });
  }
});

router.get("/integrations/quickbooks/sync-status", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.supabaseUserId!, req.query.organization_id);
    if (!quickBooksSyncEnabled()) {
      const { data: connection, error } = await admin.from("quickbooks_connections")
        .select("status")
        .eq("organization_id", organization.id).maybeSingle();
      if (error) throw error;
      res.json({
        enabled: false,
        connected: connection?.status === "active",
        last_synced_at: null,
        last_sync_status: null,
        last_sync_error: null,
        staged_total: 0,
        counts: {},
      });
      return;
    }
    const [{ data: connection, error: connectionError }, { data: staged, error: stagedError }] = await Promise.all([
      admin.from("quickbooks_connections")
        .select("status,last_synced_at,last_sync_status,last_sync_error")
        .eq("organization_id", organization.id).maybeSingle(),
      admin.from("quickbooks_staged_entities")
        .select("entity_type")
        .eq("organization_id", organization.id)
        .eq("import_status", "staged")
        .limit(10000),
    ]);
    if (connectionError) throw connectionError;
    if (stagedError) throw stagedError;
    const counts: Record<string, number> = {};
    for (const row of staged ?? []) {
      const entityType = String((row as { entity_type: string }).entity_type);
      counts[entityType] = (counts[entityType] ?? 0) + 1;
    }
    res.json({
      enabled: quickBooksSyncEnabled(),
      connected: connection?.status === "active",
      last_synced_at: connection?.last_synced_at ?? null,
      last_sync_status: connection?.last_sync_status ?? null,
      last_sync_error: connection?.last_sync_error ?? null,
      staged_total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      counts,
    });
  } catch (error) {
    req.log?.error({ err: error }, "QuickBooks sync status failed");
    res.status(500).json({ error: "quickbooks_sync_status_failed", message: "Could not read QuickBooks sync status" });
  }
});

router.post("/integrations/quickbooks/sync", requireAuth, async (req, res) => {
  try {
    if (!quickBooksSyncEnabled()) {
      res.status(503).json({ error: "quickbooks_sync_disabled", message: "QuickBooks synchronization is disabled" });
      return;
    }
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.supabaseUserId!, req.body?.organization_id);
    const result = await syncQuickBooksToStaging(admin, Number(organization.id));
    scheduleMonitoringEvaluation(admin, Number(organization.id), "quickbooks_sync");
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not synchronize QuickBooks";
    req.log?.error({ err: error }, "QuickBooks sync failed");
    res.status(500).json({ error: "quickbooks_sync_failed", message });
  }
});

router.get("/integrations/quickbooks/staged", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.supabaseUserId!, req.query.organization_id);
    const entityType = typeof req.query.entity_type === "string" ? req.query.entity_type : null;
    const status = typeof req.query.status === "string" ? req.query.status : "staged";
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    let query = admin.from("quickbooks_staged_entities")
      .select("id,entity_type,external_id,display_name,transaction_date,total_amount,source_updated_at,staged_at,import_status,deposit_classification")
      .eq("organization_id", organization.id)
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (entityType) query = query.eq("entity_type", entityType);
    if (["staged", "approved", "rejected", "imported"].includes(status)) query = query.eq("import_status", status);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ rows: data ?? [] });
  } catch (error) {
    req.log?.error({ err: error }, "QuickBooks staged preview failed");
    res.status(500).json({ error: "quickbooks_staged_failed", message: "Could not read staged QuickBooks data" });
  }
});

router.post("/integrations/quickbooks/staged/decision", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.supabaseUserId!, req.body?.organization_id);
    const decision = req.body?.decision;
    const ids = Array.isArray(req.body?.ids)
      ? [...new Set(req.body.ids.map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0))]
      : [];
    if (decision !== "approved" && decision !== "rejected") {
      res.status(400).json({ error: "invalid_quickbooks_decision", message: "Decision must be approved or rejected" });
      return;
    }
    if (!ids.length || ids.length > 100) {
      res.status(400).json({ error: "invalid_quickbooks_ids", message: "Select between 1 and 100 staged records" });
      return;
    }
    if (decision === "approved") {
      const { data: candidates, error: candidatesError } = await admin.from("quickbooks_staged_entities")
        .select("id,entity_type,deposit_classification")
        .eq("organization_id", organization.id).eq("import_status", "staged").in("id", ids);
      if (candidatesError) throw candidatesError;
      const importableDepositTypes = new Set(["business_income", "bank_transfer", "loan_proceeds", "owner_contribution"]);
      const blocked = (candidates ?? []).filter((row: { entity_type: string; deposit_classification: string | null }) =>
        row.entity_type !== "Purchase" && !(row.entity_type === "Deposit" && importableDepositTypes.has(row.deposit_classification ?? "")));
      if ((candidates?.length ?? 0) !== ids.length || blocked.length) {
        res.status(409).json({
          error: "quickbooks_records_not_importable",
          message: "Only purchases and fully classified deposits can be approved",
        });
        return;
      }
    }
    const { data, error } = await admin.from("quickbooks_staged_entities")
      .update({ import_status: decision })
      .eq("organization_id", organization.id)
      .eq("import_status", "staged")
      .in("id", ids)
      .select("id");
    if (error) throw error;
    res.json({ ok: true, decision, updated: data?.length ?? 0, imported_transactions: 0 });
  } catch (error) {
    req.log?.error({ err: error }, "QuickBooks staged decision failed");
    res.status(500).json({ error: "quickbooks_decision_failed", message: "Could not save QuickBooks review decision" });
  }
});

router.post("/integrations/quickbooks/staged/classification", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.supabaseUserId!, req.body?.organization_id);
    const id = Number(req.body?.id);
    const classification = req.body?.classification;
    const allowed = ["business_income", "bank_transfer", "loan_proceeds", "owner_contribution", "customer_payment", "refund", "non_business"];
    if (!Number.isSafeInteger(id) || id <= 0 || !allowed.includes(classification)) {
      res.status(400).json({ error: "invalid_deposit_classification", message: "Choose a valid deposit classification" });
      return;
    }
    const { data, error } = await admin.from("quickbooks_staged_entities")
      .update({ deposit_classification: classification })
      .eq("id", id).eq("organization_id", organization.id).eq("entity_type", "Deposit").eq("import_status", "staged")
      .select("id,deposit_classification").maybeSingle();
    if (error) throw error;
    if (!data) { res.status(409).json({ error: "deposit_not_reviewable", message: "This deposit is no longer awaiting review" }); return; }
    res.json({ ok: true, row: data });
  } catch (error) {
    req.log?.error({ err: error }, "QuickBooks deposit classification failed");
    res.status(500).json({ error: "deposit_classification_failed", message: "Could not save deposit classification" });
  }
});

router.post("/integrations/quickbooks/staged/import", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.supabaseUserId!, req.body?.organization_id);
    const ids = Array.isArray(req.body?.ids)
      ? [...new Set(req.body.ids.map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0))]
      : [];
    if (!ids.length || ids.length > 100) {
      res.status(400).json({ error: "invalid_quickbooks_ids", message: "Select between 1 and 100 approved records" });
      return;
    }

    const { data, error } = await admin.rpc("import_approved_quickbooks_transactions", {
      requested_organization_id: organization.id,
      requested_auth_user_id: req.supabaseUserId!,
      requested_staged_ids: ids,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    const { data: importedRows, error: importedRowsError } = await admin
      .from("quickbooks_staged_entities")
      .select("imported_transaction_id")
      .eq("organization_id", organization.id)
      .in("id", ids)
      .eq("import_status", "imported")
      .not("imported_transaction_id", "is", null);
    if (importedRowsError) throw importedRowsError;
    const transactionIds = [...new Set((importedRows ?? [])
      .map((row: { imported_transaction_id: number | null }) => Number(row.imported_transaction_id))
      .filter((id: number) => Number.isSafeInteger(id) && id > 0))];
    if (transactionIds.length > 0) scheduleMonitoringEvaluation(admin, Number(organization.id), "quickbooks_import");
    res.json({
      ok: true,
      imported: Number(result?.imported_count ?? 0),
      skipped: Number(result?.skipped_count ?? 0),
      transaction_ids: transactionIds,
    });
  } catch (error) {
    req.log?.error({ err: error }, "QuickBooks staged import failed");
    res.status(500).json({ error: "quickbooks_import_failed", message: "Could not process approved QuickBooks records" });
  }
});

router.get("/integrations/quickbooks/account-mappings", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.supabaseUserId!, req.query.organization_id);
    const [{ data: accounts, error: accountsError }, { data: mappings, error: mappingsError }] = await Promise.all([
      admin.from("quickbooks_staged_entities").select("external_id,display_name,payload")
        .eq("organization_id", organization.id).eq("entity_type", "Account").order("display_name"),
      admin.from("quickbooks_account_mappings")
        .select("quickbooks_account_id,mapping_kind,category_id,sub_category_id,account_role,updated_at")
        .eq("organization_id", organization.id),
    ]);
    if (accountsError) throw accountsError;
    if (mappingsError) throw mappingsError;
    const mappingByAccount = new Map((mappings ?? []).map((mapping: any) => [String(mapping.quickbooks_account_id), mapping]));
    res.json({
      rows: (accounts ?? []).map((account: any) => ({
        quickbooks_account_id: String(account.external_id),
        quickbooks_account_name: account.display_name || account.payload?.Name || `Account ${account.external_id}`,
        quickbooks_account_type: account.payload?.AccountType ?? null,
        quickbooks_account_subtype: account.payload?.AccountSubType ?? null,
        mapping: mappingByAccount.get(String(account.external_id)) ?? null,
      })),
    });
  } catch (error) {
    req.log?.error({ err: error }, "QuickBooks account mappings read failed");
    res.status(500).json({ error: "quickbooks_account_mappings_failed", message: "Could not read QuickBooks account mappings" });
  }
});

router.post("/integrations/quickbooks/account-mappings", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.supabaseUserId!, req.body?.organization_id);
    const accountId = String(req.body?.quickbooks_account_id ?? "").trim();
    const mappingKind = req.body?.mapping_kind;
    const categoryId = req.body?.category_id == null ? null : Number(req.body.category_id);
    const subCategoryId = req.body?.sub_category_id == null ? null : Number(req.body.sub_category_id);
    const accountRole = req.body?.account_role ?? null;
    if (!accountId || !["category", "role", "ignored"].includes(mappingKind)) {
      res.status(400).json({ error: "invalid_account_mapping", message: "Choose a valid account mapping" }); return;
    }
    const { data: account, error: accountError } = await admin.from("quickbooks_staged_entities")
      .select("display_name,payload").eq("organization_id", organization.id).eq("entity_type", "Account")
      .eq("external_id", accountId).maybeSingle();
    if (accountError) throw accountError;
    if (!account) { res.status(404).json({ error: "quickbooks_account_not_found", message: "QuickBooks account not found" }); return; }

    if (mappingKind === "category") {
      if (!Number.isSafeInteger(categoryId) || categoryId! <= 0) {
        res.status(400).json({ error: "invalid_category_mapping", message: "Choose a BookSmart category" }); return;
      }
      const { data: category, error: categoryError } = await admin.from("category").select("id").eq("id", categoryId).maybeSingle();
      if (categoryError) throw categoryError;
      if (!category) { res.status(400).json({ error: "invalid_category_mapping", message: "BookSmart category not found" }); return; }
      if (subCategoryId != null) {
        const { data: subCategory, error: subError } = await admin.from("sub_category").select("id")
          .eq("id", subCategoryId).eq("category_id", categoryId).eq("is_deleted", false).maybeSingle();
        if (subError) throw subError;
        if (!subCategory) { res.status(400).json({ error: "invalid_subcategory_mapping", message: "Subcategory does not belong to this category" }); return; }
      }
    }
    const allowedRoles = ["bank", "credit_card", "loan", "accounts_receivable", "accounts_payable", "equity"];
    if (mappingKind === "role" && !allowedRoles.includes(accountRole)) {
      res.status(400).json({ error: "invalid_account_role", message: "Choose a valid accounting role" }); return;
    }

    const { data: previous, error: previousError } = await admin.from("quickbooks_account_mappings")
      .select("*").eq("organization_id", organization.id).eq("quickbooks_account_id", accountId).maybeSingle();
    if (previousError) throw previousError;
    const next = {
      organization_id: organization.id,
      quickbooks_account_id: accountId,
      quickbooks_account_name: account.display_name || account.payload?.Name || `Account ${accountId}`,
      quickbooks_account_type: account.payload?.AccountType ?? null,
      mapping_kind: mappingKind,
      category_id: mappingKind === "category" ? categoryId : null,
      sub_category_id: mappingKind === "category" ? subCategoryId : null,
      account_role: mappingKind === "role" ? accountRole : null,
      created_by: req.supabaseUserId!, updated_at: new Date().toISOString(),
    };
    const { data: saved, error: saveError } = await admin.from("quickbooks_account_mappings")
      .upsert(next, { onConflict: "organization_id,quickbooks_account_id" }).select("*").single();
    if (saveError) throw saveError;
    const { error: historyError } = await admin.from("quickbooks_account_mapping_history").insert({
      organization_id: organization.id, quickbooks_account_id: accountId,
      previous_mapping: previous, new_mapping: saved, changed_by: req.supabaseUserId!,
    });
    if (historyError) throw historyError;
    res.json({ ok: true, mapping: saved });
  } catch (error) {
    req.log?.error({ err: error }, "QuickBooks account mapping save failed");
    res.status(500).json({ error: "quickbooks_account_mapping_failed", message: "Could not save QuickBooks account mapping" });
  }
});

router.post("/integrations/quickbooks/disconnect", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await ownedOrganization(admin, req.supabaseUserId!, req.body?.organization_id);
    const { data, error } = await admin.from("quickbooks_connections")
      .select("refresh_token_encrypted").eq("organization_id", organization.id).eq("status", "active").maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: "quickbooks_connection_not_found" }); return; }
    let revoked = false;
    let revocationWarning: string | null = null;
    try {
      if (!data.refresh_token_encrypted) throw new Error("Stored QuickBooks refresh token is unavailable");
      await revokeToken(decryptToken(data.refresh_token_encrypted));
      revoked = true;
    } catch (revocationError) {
      revocationWarning = "Intuit token revocation could not be confirmed. Local credentials were removed.";
      req.log?.warn({ err: revocationError, organizationId: organization.id }, "QuickBooks remote revocation failed; continuing local disconnect");
    }
    const { error: updateError } = await admin.from("quickbooks_connections").update({
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      access_token_expires_at: null,
      refresh_token_expires_at: null,
      status: "disconnected",
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("organization_id", organization.id);
    if (updateError) throw updateError;
    res.json({ ok: true, connected: false, revoked, warning: revocationWarning });
  } catch (error) {
    req.log?.error({ err: error }, "QuickBooks disconnect failed");
    const message = error instanceof Error ? error.message : "";
    const status = /organization|profile/i.test(message) ? 403 : 500;
    res.status(status).json({ error: status === 403 ? "forbidden" : "quickbooks_disconnect_failed", message: "Could not disconnect QuickBooks" });
  }
});

export default router;
