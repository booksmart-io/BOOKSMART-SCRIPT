import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { getStripeClient } from "../lib/stripe-client";
import { SUBSCRIPTION_PLANS, TOKEN_PACKAGES, type PlanKey, type TokenPackageKey } from "../lib/stripe-catalog";

const router = Router();

const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";

function getAdminClient() {
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(SUPABASE_URL, serviceRoleKey, { auth: { persistSession: false } });
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

// Resolves a valid Stripe customer for this user, creating one if needed and
// transparently replacing any stale customer id left over from a different
// Stripe account/mode (e.g. old demo data) that no longer resolves.
async function resolveStripeCustomerId(
  admin: ReturnType<typeof getAdminClient>,
  stripe: ReturnType<typeof getStripeClient>,
  userId: string,
  userRow: { email?: string | null; stripe_customer_id?: string | null } | null | undefined,
): Promise<string> {
  const existingId = userRow?.stripe_customer_id ?? undefined;

  if (existingId) {
    try {
      const existing = await stripe.customers.retrieve(existingId);
      if (!existing.deleted) {
        return existing.id;
      }
    } catch {
      // Stale id from a different Stripe account/mode — fall through and recreate.
    }
  }

  const customer = await stripe.customers.create({
    email: userRow?.email ?? undefined,
    metadata: { user_id: userId },
  });
  await admin.from("users").update({ stripe_customer_id: customer.id }).eq("auth_id", userId);
  return customer.id;
}

// Returns pricing for the frontend to render plans/token packages without hardcoding IDs.
router.get("/stripe/catalog", (_req, res) => {
  res.json({
    plans: SUBSCRIPTION_PLANS,
    tokenPackages: TOKEN_PACKAGES,
  });
});

// Returns the current user's subscription tier + token balance.
router.get("/stripe/status", requireAuth, async (req, res) => {
  const userId = req.supabaseUserId!;
  const admin = getAdminClient();

  const { data: userRow, error: userErr } = await admin
    .from("users")
    .select("id, token_balance")
    .eq("auth_id", userId)
    .maybeSingle();

  if (userErr || !userRow) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }

  const { data: subRow } = await admin
    .from("subscriptions")
    .select("status, stripe_price_id, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let tier: "free" | "plus" | "pro" = "free";
  if (subRow && subRow.status === "active") {
    if (subRow.stripe_price_id === SUBSCRIPTION_PLANS.pro.priceId) tier = "pro";
    else if (subRow.stripe_price_id === SUBSCRIPTION_PLANS.plus.priceId) tier = "plus";
  }

  res.json({
    tier,
    tokenBalance: userRow.token_balance ?? 0,
    subscription: subRow ?? null,
  });
});

router.post("/stripe/create-checkout-session", requireAuth, async (req, res) => {
  const { planKey, successUrl, cancelUrl } = req.body as {
    planKey?: string;
    successUrl?: string;
    cancelUrl?: string;
  };

  if (!planKey || !(planKey in SUBSCRIPTION_PLANS)) {
    res.status(400).json({ error: "invalid_plan_key" });
    return;
  }
  if (!isHttpsUrl(successUrl) || !isHttpsUrl(cancelUrl)) {
    res.status(400).json({ error: "urls_must_be_https" });
    return;
  }

  const userId = req.supabaseUserId!;
  const plan = SUBSCRIPTION_PLANS[planKey as PlanKey];

  try {
    const admin = getAdminClient();
    const { data: userRow } = await admin
      .from("users")
      .select("email, stripe_customer_id")
      .eq("auth_id", userId)
      .maybeSingle();

    const stripe = getStripeClient();
    const customerId = await resolveStripeCustomerId(admin, stripe, userId, userRow);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: { user_id: userId, plan_key: planKey },
      subscription_data: { metadata: { user_id: userId, plan_key: planKey } },
    });

    res.json({ url: session.url });
  } catch (e) {
    res.status(502).json({ error: "stripe_error", message: String(e) });
  }
});

router.post("/stripe/create-token-checkout", requireAuth, async (req, res) => {
  const { packageKey, successUrl, cancelUrl } = req.body as {
    packageKey?: string;
    successUrl?: string;
    cancelUrl?: string;
  };

  if (!packageKey || !(packageKey in TOKEN_PACKAGES)) {
    res.status(400).json({ error: "invalid_package_key" });
    return;
  }
  if (!isHttpsUrl(successUrl) || !isHttpsUrl(cancelUrl)) {
    res.status(400).json({ error: "urls_must_be_https" });
    return;
  }

  const userId = req.supabaseUserId!;
  const pkg = TOKEN_PACKAGES[packageKey as TokenPackageKey];

  try {
    const admin = getAdminClient();
    const { data: userRow } = await admin
      .from("users")
      .select("email, stripe_customer_id")
      .eq("auth_id", userId)
      .maybeSingle();

    const stripe = getStripeClient();
    const customerId = await resolveStripeCustomerId(admin, stripe, userId, userRow);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: pkg.priceId, quantity: 1 }],
      success_url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: { user_id: userId, package_key: packageKey, tokens: String(pkg.tokens) },
    });

    res.json({ url: session.url });
  } catch (e) {
    res.status(502).json({ error: "stripe_error", message: String(e) });
  }
});

// Called by the frontend after Stripe redirects back to success_url. Verifies the
// session directly with Stripe (server-to-server) rather than trusting the client,
// then applies the effect (grant tokens / activate subscription) idempotently.
router.post("/stripe/confirm-checkout", requireAuth, async (req, res) => {
  const { sessionId } = req.body as { sessionId?: string };
  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "session_id_required" });
    return;
  }

  const userId = req.supabaseUserId!;
  const stripe = getStripeClient();
  const admin = getAdminClient();

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    if (session.metadata?.user_id !== userId) {
      res.status(403).json({ error: "session_user_mismatch" });
      return;
    }
    if (session.payment_status !== "paid") {
      res.status(409).json({ error: "payment_not_completed", status: session.payment_status });
      return;
    }

    const { data: userRow } = await admin
      .from("users")
      .select("id, token_balance")
      .eq("auth_id", userId)
      .maybeSingle();

    if (!userRow) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    if (session.mode === "payment") {
      const tokens = Number(session.metadata?.tokens ?? 0);
      if (tokens <= 0) {
        res.status(400).json({ error: "invalid_token_amount" });
        return;
      }

      const { data: existing } = await admin
        .from("token_transactions")
        .select("id")
        .eq("stripe_checkout_session_id", session.id)
        .maybeSingle();

      if (existing) {
        res.json({ status: "already_processed", tokenBalance: userRow.token_balance });
        return;
      }

      const newBalance = (userRow.token_balance ?? 0) + tokens;

      await admin.from("token_transactions").insert({
        user_id: userId,
        amount: tokens,
        balance_after: newBalance,
        type: "purchase",
        status: "posted",
        use_case: `${tokens} tokens`,
        stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
        stripe_checkout_session_id: session.id,
        stripe_price_id: session.metadata?.package_key ? TOKEN_PACKAGES[session.metadata.package_key as TokenPackageKey]?.priceId : null,
      });

      await admin.from("users").update({ token_balance: newBalance }).eq("auth_id", userId);

      res.json({ status: "tokens_granted", tokenBalance: newBalance, tokensAdded: tokens });
      return;
    }

    if (session.mode === "subscription") {
      const sub = session.subscription;
      if (!sub || typeof sub === "string") {
        res.status(502).json({ error: "subscription_not_expanded" });
        return;
      }

      const priceId = sub.items.data[0]?.price.id ?? null;
      const periodEnd = sub.items.data[0]?.current_period_end;

      const { data: existingSub } = await admin
        .from("subscriptions")
        .select("id")
        .eq("stripe_subscription_id", sub.id)
        .maybeSingle();

      const payload = {
        user_id: userId,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId,
        stripe_product_id: session.metadata?.plan_key ? SUBSCRIPTION_PLANS[session.metadata.plan_key as PlanKey]?.productId : null,
        status: sub.status,
        current_period_start: new Date(sub.start_date * 1000).toISOString(),
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      };

      if (existingSub) {
        await admin.from("subscriptions").update(payload).eq("id", existingSub.id);
      } else {
        await admin.from("subscriptions").insert(payload);
      }

      res.json({ status: "subscription_activated", tier: session.metadata?.plan_key ?? null });
      return;
    }

    res.status(400).json({ error: "unsupported_session_mode" });
  } catch (e) {
    res.status(502).json({ error: "stripe_error", message: String(e) });
  }
});

export default router;
