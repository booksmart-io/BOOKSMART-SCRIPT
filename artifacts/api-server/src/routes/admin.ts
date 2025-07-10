import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { requireAdmin } from "../middlewares/require-admin";
import { PLAN_LIMITS, getUserTier, type PlanTier } from "../lib/plan-limits";

const router = Router();
const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";

function getAdminClient() {
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, serviceRoleKey, { auth: { persistSession: false } });
}

// All routes below require a verified Supabase session AND users.role === "admin".
router.use("/admin/accounts", requireAuth, requireAdmin);
router.use("/admin/set-token-balance", requireAuth, requireAdmin);
router.use("/admin/set-plan", requireAuth, requireAdmin);

// Lists every platform account with its resolved plan tier, live usage limits,
// and token balance — the full picture the admin needs to manage accounts.
router.get("/admin/accounts", async (_req, res) => {
  const admin = getAdminClient();
  try {
    const { data: users, error: usersErr } = await admin
      .from("users")
      .select("id,auth_id,email,first_name,last_name,role,created_at,token_balance,verification_status")
      .order("created_at", { ascending: false });
    if (usersErr) throw usersErr;

    const { data: subs, error: subsErr } = await admin
      .from("subscriptions")
      .select("user_id,status,stripe_price_id,current_period_end")
      .order("created_at", { ascending: false });
    if (subsErr) throw subsErr;

    // Most-recent subscription row per auth user id (subs already ordered desc).
    const subByAuthId = new Map<string, { status: string; stripe_price_id: string | null; current_period_end: string | null }>();
    for (const s of subs ?? []) {
      if (!subByAuthId.has(s.user_id as string)) {
        subByAuthId.set(s.user_id as string, {
          status: s.status as string,
          stripe_price_id: s.stripe_price_id as string | null,
          current_period_end: s.current_period_end as string | null,
        });
      }
    }

    const { SUBSCRIPTION_PLANS } = await import("../lib/stripe-catalog");

    const accounts = await Promise.all(
      (users ?? []).map(async (u) => {
        const authId = u.auth_id as string;
        const tier = await getUserTier(admin, authId);
        const sub = subByAuthId.get(authId) ?? null;
        return {
          id: u.id,
          email: u.email,
          firstName: u.first_name,
          lastName: u.last_name,
          role: u.role,
          createdAt: u.created_at,
          tokenBalance: u.token_balance ?? 0,
          verificationStatus: u.verification_status,
          tier,
          subscriptionStatus: sub?.status ?? "none",
          currentPeriodEnd: sub?.current_period_end ?? null,
        };
      })
    );

    res.json({ accounts, planLimits: PLAN_LIMITS, planPrices: SUBSCRIPTION_PLANS });
  } catch (e) {
    res.status(502).json({ error: "admin_accounts_error", message: String(e) });
  }
});

// Directly sets a user's token_balance and logs the adjustment for audit trail.
router.post("/admin/set-token-balance", async (req, res) => {
  const admin = getAdminClient();
  const { userId, tokenBalance } = req.body ?? {};

  if (typeof userId !== "number" || typeof tokenBalance !== "number" || tokenBalance < 0) {
    res.status(400).json({ error: "invalid_request", message: "userId (number) and tokenBalance (number >= 0) are required" });
    return;
  }

  try {
    const { data: userRow, error: fetchErr } = await admin
      .from("users")
      .select("auth_id, token_balance")
      .eq("id", userId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!userRow) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    const { error: updateErr } = await admin
      .from("users")
      .update({ token_balance: tokenBalance })
      .eq("id", userId);
    if (updateErr) throw updateErr;

    const delta = tokenBalance - (userRow.token_balance ?? 0);
    await admin.from("token_transactions").insert({
      user_id: userRow.auth_id,
      amount: delta,
      balance_after: tokenBalance,
      type: delta >= 0 ? "bonus" : "spend",
      status: "posted",
      use_case: "Admin balance adjustment",
    });

    res.json({ ok: true, tokenBalance });
  } catch (e) {
    res.status(502).json({ error: "admin_set_tokens_error", message: String(e) });
  }
});

// Sets a user's plan tier by upserting their subscriptions row with the
// matching Stripe price/product id (or canceling it for "free"). This is an
// admin override — it does not create, modify, or charge a real Stripe subscription.
router.post("/admin/set-plan", async (req, res) => {
  const admin = getAdminClient();
  const { userId, tier } = req.body ?? {};

  if (typeof userId !== "number" || !["free", "plus", "pro"].includes(tier)) {
    res.status(400).json({ error: "invalid_request", message: "userId (number) and tier ('free'|'plus'|'pro') are required" });
    return;
  }

  try {
    const { data: userRow, error: fetchErr } = await admin
      .from("users")
      .select("auth_id")
      .eq("id", userId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!userRow) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    const authId = userRow.auth_id as string;

    const { SUBSCRIPTION_PLANS } = await import("../lib/stripe-catalog");

    const { data: existingSub } = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", authId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    if ((tier as PlanTier) === "free") {
      if (existingSub) {
        const { error } = await admin
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("id", existingSub.id as number);
        if (error) throw error;
      }
      res.json({ ok: true, tier: "free" });
      return;
    }

    const plan = SUBSCRIPTION_PLANS[tier as "plus" | "pro"];
    const fields = {
      status: "active",
      stripe_price_id: plan.priceId,
      stripe_product_id: plan.productId,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
    };

    if (existingSub) {
      const { error } = await admin.from("subscriptions").update(fields).eq("id", existingSub.id as number);
      if (error) throw error;
    } else {
      const { error } = await admin.from("subscriptions").insert({ user_id: authId, ...fields });
      if (error) throw error;
    }

    res.json({ ok: true, tier });
  } catch (e) {
    res.status(502).json({ error: "admin_set_plan_error", message: String(e) });
  }
});

export default router;
