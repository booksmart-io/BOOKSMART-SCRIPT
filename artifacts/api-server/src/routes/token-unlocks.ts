import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { TOKEN_UNLOCKS, tokenUpgradeMessage, type TokenUnlockKey } from "../lib/token-unlocks";

const router = Router();
const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";

type SupabaseAdmin = SupabaseClient<any, any, any>;

function getAdminClient(): SupabaseAdmin {
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, serviceRoleKey, { auth: { persistSession: false } });
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function expiresAt(days?: number): string | null {
  if (!days) return null;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

async function monthlyTokenSpend(admin: SupabaseAdmin, authUserId: string): Promise<number> {
  const { data } = await admin
    .from("token_transactions")
    .select("amount")
    .eq("user_id", authUserId)
    .eq("type", "spend")
    .lt("amount", 0)
    .gte("created_at", startOfMonthIso());

  return (data ?? []).reduce((sum: number, row: { amount: number }) => sum + Math.abs(Number(row.amount) || 0), 0);
}

async function activeUnlock(admin: SupabaseAdmin, authUserId: string, featureKey: string, scopeKey: string | null) {
  let query = admin
    .from("feature_unlocks")
    .select("id,expires_at")
    .eq("user_id", authUserId)
    .eq("feature_key", featureKey)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1);

  query = scopeKey ? query.eq("scope_key", scopeKey) : query.is("scope_key", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ?? null;
}

router.get("/token-unlocks/catalog", (_req, res) => {
  res.json({ unlocks: TOKEN_UNLOCKS });
});

router.get("/token-unlocks/summary", requireAuth, async (req, res) => {
  try {
    const authUserId = req.supabaseUserId!;
    const admin = getAdminClient();
    const { data: userRow, error } = await admin
      .from("users")
      .select("token_balance")
      .eq("auth_id", authUserId)
      .maybeSingle();
    if (error) throw error;

    const monthlySpend = await monthlyTokenSpend(admin, authUserId);
    res.json({
      tokenBalance: userRow?.token_balance ?? 0,
      monthlyTokenSpend: monthlySpend,
      upgradeMessage: tokenUpgradeMessage(monthlySpend),
    });
  } catch (e) {
    res.status(502).json({ error: "token_unlock_summary_error", message: String(e) });
  }
});

router.get("/token-unlocks/status", requireAuth, async (req, res) => {
  try {
    const authUserId = req.supabaseUserId!;
    const featureKey = String(req.query.featureKey ?? "");
    const scopeKey = req.query.scopeKey ? String(req.query.scopeKey) : null;
    if (!(featureKey in TOKEN_UNLOCKS)) {
      res.status(400).json({ error: "invalid_feature_key" });
      return;
    }

    const admin = getAdminClient();
    const config = TOKEN_UNLOCKS[featureKey as TokenUnlockKey];
    const unlock = config.durationDays ? await activeUnlock(admin, authUserId, featureKey, scopeKey) : null;
    res.json({ unlocked: Boolean(unlock), unlock, config });
  } catch (e) {
    res.status(502).json({ error: "token_unlock_status_error", message: String(e) });
  }
});

router.post("/token-unlocks/spend", requireAuth, async (req, res) => {
  try {
    const authUserId = req.supabaseUserId!;
    const featureKey = String(req.body?.featureKey ?? "");
    const scopeKey = req.body?.scopeKey ? String(req.body.scopeKey) : null;

    if (!(featureKey in TOKEN_UNLOCKS)) {
      res.status(400).json({ error: "invalid_feature_key" });
      return;
    }

    const config = TOKEN_UNLOCKS[featureKey as TokenUnlockKey];
    const admin = getAdminClient();

    if (config.durationDays) {
      const existing = await activeUnlock(admin, authUserId, featureKey, scopeKey);
      if (existing) {
        const monthlySpend = await monthlyTokenSpend(admin, authUserId);
        res.json({
          status: "already_unlocked",
          unlock: existing,
          tokenBalance: null,
          monthlyTokenSpend: monthlySpend,
          upgradeMessage: tokenUpgradeMessage(monthlySpend),
        });
        return;
      }
    }

    const { data: userRow, error: userError } = await admin
      .from("users")
      .select("token_balance")
      .eq("auth_id", authUserId)
      .maybeSingle();
    if (userError) throw userError;
    if (!userRow) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    const currentBalance = Number(userRow.token_balance ?? 0);
    if (currentBalance < config.tokens) {
      res.status(402).json({
        error: "insufficient_tokens",
        required: config.tokens,
        tokenBalance: currentBalance,
        message: `You need ${config.tokens} tokens to unlock ${config.label}.`,
      });
      return;
    }

    const newBalance = currentBalance - config.tokens;
    const { error: balanceError } = await admin
      .from("users")
      .update({ token_balance: newBalance })
      .eq("auth_id", authUserId);
    if (balanceError) throw balanceError;

    const { error: txError } = await admin.from("token_transactions").insert({
      user_id: authUserId,
      amount: -config.tokens,
      balance_after: newBalance,
      type: "spend",
      status: "posted",
      use_case: `unlock:${featureKey}`,
    });
    if (txError) throw txError;

    let unlock = null;
    const expiry = expiresAt(config.durationDays);
    if (expiry) {
      const { data: unlockRow, error: unlockError } = await admin
        .from("feature_unlocks")
        .insert({
          user_id: authUserId,
          feature_key: featureKey,
          scope_key: scopeKey,
          tokens_spent: config.tokens,
          expires_at: expiry,
        })
        .select("id,feature_key,scope_key,expires_at")
        .single();
      if (unlockError) throw unlockError;
      unlock = unlockRow;
    }

    const monthlySpend = await monthlyTokenSpend(admin, authUserId);
    res.json({
      status: "unlocked",
      config,
      unlock,
      tokenBalance: newBalance,
      monthlyTokenSpend: monthlySpend,
      upgradeMessage: tokenUpgradeMessage(monthlySpend),
    });
  } catch (e) {
    res.status(502).json({ error: "token_unlock_spend_error", message: String(e) });
  }
});

export default router;
