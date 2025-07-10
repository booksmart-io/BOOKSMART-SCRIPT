import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import {
  PLAN_LIMITS,
  getUserTier,
  countAiQuestionsThisMonth,
  countAiStrategiesThisMonth,
  countDocumentUploadsThisMonth,
  countOrganizations,
  countTransactionsThisMonth,
  logAiStrategyUsage,
} from "../lib/plan-limits";

const router = Router();
const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";

function getAdminClient() {
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, serviceRoleKey, { auth: { persistSession: false } });
}

// Returns the caller's tier, plan limits, and current month-to-date usage —
// used by the frontend to show real progress bars and gate export/CPA buttons.
router.get("/plan-limits/usage", requireAuth, async (req, res) => {
  const authUserId = req.supabaseUserId!;
  const admin = getAdminClient();

  try {
    const { data: userRow } = await admin
      .from("users")
      .select("id")
      .eq("auth_id", authUserId)
      .maybeSingle();

    if (!userRow) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    const tier = await getUserTier(admin, authUserId);
    const limits = PLAN_LIMITS[tier];

    const [aiQuestions, aiStrategies, receiptUploads, statementUploads, businesses, transactions] = await Promise.all([
      countAiQuestionsThisMonth(admin, authUserId),
      countAiStrategiesThisMonth(admin, authUserId),
      countDocumentUploadsThisMonth(admin, userRow.id as number, "receipt"),
      countDocumentUploadsThisMonth(admin, userRow.id as number, "statement"),
      countOrganizations(admin, userRow.id as number),
      countTransactionsThisMonth(admin, userRow.id as number),
    ]);

    res.json({
      tier,
      limits,
      usage: { aiQuestions, aiStrategies, receiptUploads, statementUploads, businesses, transactions },
    });
  } catch (e) {
    res.status(502).json({ error: "plan_limits_error", message: String(e) });
  }
});

// Called before generating an AI tax strategy so the frontend can block the
// action with a clear upgrade prompt instead of letting the insert happen
// and only then discovering the limit was exceeded.
router.post("/plan-limits/check-ai-strategy", requireAuth, async (req, res) => {
  const authUserId = req.supabaseUserId!;
  const admin = getAdminClient();

  try {
    const tier = await getUserTier(admin, authUserId);
    const limit = PLAN_LIMITS[tier].aiStrategiesPerMonth;
    const used = await countAiStrategiesThisMonth(admin, authUserId);

    if (used >= limit) {
      res.status(403).json({
        error: "limit_reached",
        tier,
        limit,
        used,
        message: `You've reached your ${tier} plan's monthly AI tax strategy limit (${limit}). Upgrade your plan for more.`,
      });
      return;
    }
    // A passing check is the usage event itself — the frontend always proceeds
    // to generate strategies immediately after getting `allowed: true`.
    const { data: userRow } = await admin
      .from("users")
      .select("token_balance")
      .eq("auth_id", authUserId)
      .maybeSingle();
    await logAiStrategyUsage(admin, authUserId, userRow?.token_balance ?? 0);

    res.json({ allowed: true, tier, limit, used });
  } catch (e) {
    res.status(502).json({ error: "plan_limits_error", message: String(e) });
  }
});

// Called before creating a new business/organization.
router.post("/plan-limits/check-add-business", requireAuth, async (req, res) => {
  const authUserId = req.supabaseUserId!;
  const admin = getAdminClient();

  try {
    const { data: userRow } = await admin
      .from("users")
      .select("id")
      .eq("auth_id", authUserId)
      .maybeSingle();
    if (!userRow) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    const tier = await getUserTier(admin, authUserId);
    const limit = PLAN_LIMITS[tier].businessesLimit;
    const used = await countOrganizations(admin, userRow.id as number);

    if (used >= limit) {
      res.status(403).json({
        error: "limit_reached",
        tier,
        limit,
        used,
        message: `Your ${tier} plan allows up to ${limit} business${limit === 1 ? "" : "es"}. Upgrade your plan to add more.`,
      });
      return;
    }

    res.json({ allowed: true, tier, limit, used });
  } catch (e) {
    res.status(502).json({ error: "plan_limits_error", message: String(e) });
  }
});

// Called before creating a new transaction (manual entry or bulk-review approval).
router.post("/plan-limits/check-add-transaction", requireAuth, async (req, res) => {
  const authUserId = req.supabaseUserId!;
  const admin = getAdminClient();

  try {
    const { data: userRow } = await admin
      .from("users")
      .select("id")
      .eq("auth_id", authUserId)
      .maybeSingle();
    if (!userRow) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    const tier = await getUserTier(admin, authUserId);
    const limit = PLAN_LIMITS[tier].transactionsPerMonth;
    const used = await countTransactionsThisMonth(admin, userRow.id as number);
    const count = Number(req.body?.count) > 0 ? Number(req.body.count) : 1;

    if (used + count > limit) {
      res.status(403).json({
        error: "limit_reached",
        tier,
        limit,
        used,
        message: `You've reached your ${tier} plan's monthly transaction limit (${limit}). Upgrade your plan for more.`,
      });
      return;
    }

    res.json({ allowed: true, tier, limit, used });
  } catch (e) {
    res.status(502).json({ error: "plan_limits_error", message: String(e) });
  }
});

export default router;
