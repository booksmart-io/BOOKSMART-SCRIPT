import express, { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { getStripeClient } from "../lib/stripe-client";
import { SUBSCRIPTION_PLANS, type PlanKey } from "../lib/stripe-catalog";
import { enforceConnectedAccountLimit } from "../lib/plan-limits";

const router = Router();

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  "https://pvppwmkswnluidlwnnck.supabase.co";

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function planProductIdForPrice(priceId: string | null): string | null {
  if (!priceId) return null;
  const plan = Object.values(SUBSCRIPTION_PLANS).find((item) => item.priceId === priceId);
  return plan?.productId ?? null;
}

function planKeyForPrice(priceId: string | null): PlanKey | null {
  if (!priceId) return null;
  const entry = Object.entries(SUBSCRIPTION_PLANS).find(([, item]) => item.priceId === priceId);
  return entry?.[0] as PlanKey | undefined ?? null;
}

function stripeTimestampToIso(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

async function resolveUserIdForSubscription(
  admin: ReturnType<typeof getAdminClient>,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const metadataUserId = subscription.metadata?.user_id;
  if (metadataUserId) return metadataUserId;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId) return null;

  const { data, error } = await admin
    .from("users")
    .select("auth_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return (data as { auth_id?: string | null } | null)?.auth_id ?? null;
}

async function upsertSubscriptionFromStripe(subscription: Stripe.Subscription) {
  const admin = getAdminClient();
  const userId = await resolveUserIdForSubscription(admin, subscription);
  if (!userId) throw new Error(`Could not resolve user for subscription ${subscription.id}`);

  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;
  const planKey = planKeyForPrice(priceId);
  const productId =
    planKey ? SUBSCRIPTION_PLANS[planKey].productId : planProductIdForPrice(priceId);

  const currentPeriodStart =
    stripeTimestampToIso((item as unknown as { current_period_start?: number }).current_period_start) ??
    stripeTimestampToIso((subscription as unknown as { current_period_start?: number }).current_period_start);
  const currentPeriodEnd =
    stripeTimestampToIso((item as unknown as { current_period_end?: number }).current_period_end) ??
    stripeTimestampToIso((subscription as unknown as { current_period_end?: number }).current_period_end);

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const payload = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    stripe_product_id: productId,
    status: subscription.status,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: lookupError } = await admin
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await admin
      .from("subscriptions")
      .update(payload)
      .eq("id", (existing as { id: number }).id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("subscriptions").insert(payload);
    if (error) throw error;
  }

  await enforceConnectedAccountLimit(admin, userId);
}

async function updateSubscriptionFromInvoice(invoice: Stripe.Invoice) {
  const invoiceWithSubscription = invoice as Stripe.Invoice & {
    subscription?: string | { id?: string } | null;
  };
  const subscriptionId =
    typeof invoiceWithSubscription.subscription === "string"
      ? invoiceWithSubscription.subscription
      : invoiceWithSubscription.subscription?.id;
  if (!subscriptionId) return;

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await upsertSubscriptionFromStripe(subscription);
}

router.post(
  "/stripe/webhook",
  express.raw({ type: "application/json", limit: "2mb" }),
  async (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(500).json({ error: "missing_stripe_webhook_secret" });
      return;
    }

    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") {
      res.status(400).json({ error: "missing_stripe_signature" });
      return;
    }

    let event: Stripe.Event;
    try {
      const stripe = getStripeClient();
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (error) {
      res.status(400).json({
        error: "invalid_stripe_signature",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          await upsertSubscriptionFromStripe(event.data.object as Stripe.Subscription);
          break;
        case "invoice.payment_succeeded":
        case "invoice.payment_failed":
          await updateSubscriptionFromInvoice(event.data.object as Stripe.Invoice);
          break;
        default:
          break;
      }
      res.json({ received: true });
    } catch (error) {
      console.error("[stripe/webhook]", error);
      res.status(500).json({
        error: "stripe_webhook_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

export default router;
