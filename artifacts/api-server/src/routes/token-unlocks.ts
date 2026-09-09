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

async function monthlyTokenSpend(admin: SupabaseAdmin, authUserId: string): Promise<number> {
  const { data, error } = await admin
    .from("token_transactions")
    .select("amount")
    .eq("user_id", authUserId)
    .eq("type", "spend")
    .lt("amount", 0)
    .gte("created_at", startOfMonthIso());

  if (error) throw error;

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
    if (!(Object.hasOwn(TOKEN_UNLOCKS, featureKey))) {
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

    if (!(Object.hasOwn(TOKEN_UNLOCKS, featureKey))) {
      res.status(400).json({ error: "invalid_feature_key" });
      return;
    }

    const config = TOKEN_UNLOCKS[featureKey as TokenUnlockKey];
    const admin = getAdminClient();

    const requestId = req.body?.requestId;
    if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      res.status(400).json({ error: "invalid_request_id" }); return;
    }
    const { data, error } = await admin.rpc("spend_tokens_atomic", {
      p_user_id: authUserId, p_request_id: requestId, p_feature_key: featureKey,
      p_scope_key: scopeKey, p_tokens: config.tokens, p_duration_days: config.durationDays ?? null,
    });
    if (error) {
      if (error.code === "22023") { res.status(409).json({ error: "retry_key_conflict" }); return; }
      if (error.code === "P0002") { res.status(404).json({ error: "user_not_found" }); return; }
      throw error;
    }
    if (data.status === "insufficient_tokens") {
      res.status(402).json({ ...data, error: "insufficient_tokens", message: "You need " + config.tokens + " tokens to unlock " + config.label }); return;
    }
    res.json({ ...data, config, upgradeMessage: tokenUpgradeMessage(data.monthlyTokenSpend) });

  } catch (e) {
    res.status(502).json({ error: "token_unlock_spend_error", message: String(e) });
  }
});

export default router;
