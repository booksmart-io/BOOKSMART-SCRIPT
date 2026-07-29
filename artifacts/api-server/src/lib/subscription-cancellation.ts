import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import {
  SUBSCRIPTION_PLANS,
  type PlanKey,
} from "./stripe-catalog";

type SupabaseAdmin = SupabaseClient<any, any, any>;

type UserRow = {
  stripe_customer_id?: string | null;
};

type LocalSubscriptionRow = {
  id: number;
  stripe_subscription_id: string;
  stripe_price_id: string;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
};

const ADMIN_OVERRIDE_SUBSCRIPTION_PREFIX = "admin_override_subscription_";

function planKeyForPriceId(priceId: string): PlanKey | null {
  if (priceId === SUBSCRIPTION_PLANS.plus.priceId) return "plus";
  if (priceId === SUBSCRIPTION_PLANS.pro.priceId) return "pro";
  return null;
}

export type SubscriptionCancellationResult = {
  status: Stripe.Subscription.Status;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  tier: PlanKey;
  alreadyInRequestedState: boolean;
};

export class SubscriptionActionError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "SubscriptionActionError";
  }
}

function timestampToIso(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

function customerId(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
}

export function planKeyForSubscription(
  subscription: Stripe.Subscription,
): PlanKey | null {
  const priceId = subscription.items.data[0]?.price.id;
  return priceId ? planKeyForPriceId(priceId) : null;
}

async function setAdminOverrideCancellation(
  admin: SupabaseAdmin,
  local: LocalSubscriptionRow,
  userId: string,
  cancelAtPeriodEnd: boolean,
): Promise<SubscriptionCancellationResult> {
  const tier = planKeyForPriceId(local.stripe_price_id);
  if (!tier) {
    throw new SubscriptionActionError(
      "unsupported_subscription_price",
      409,
      "The admin override does not match a BookSmart paid plan.",
    );
  }

  const alreadyInRequestedState =
    local.cancel_at_period_end === cancelAtPeriodEnd;
  if (!alreadyInRequestedState) {
    const { error } = await admin
      .from("subscriptions")
      .update({
        cancel_at_period_end: cancelAtPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", local.id)
      .eq("user_id", userId);

    if (error) {
      throw new SubscriptionActionError(
        "subscription_sync_failed",
        502,
        `BookSmart could not update the admin override: ${error.message}`,
      );
    }
  }

  return {
    status: "active",
    cancelAtPeriodEnd,
    currentPeriodEnd: local.current_period_end,
    tier,
    alreadyInRequestedState,
  };
}

export function assertSubscriptionOwnership(
  subscription: Stripe.Subscription,
  expectedUserId: string,
  expectedCustomerId: string,
) {
  if (customerId(subscription) !== expectedCustomerId) {
    throw new SubscriptionActionError(
      "subscription_customer_mismatch",
      403,
      "The Stripe subscription does not belong to this customer.",
    );
  }

  const metadataUserId = subscription.metadata?.user_id;
  if (metadataUserId && metadataUserId !== expectedUserId) {
    throw new SubscriptionActionError(
      "subscription_user_mismatch",
      403,
      "The Stripe subscription does not belong to this user.",
    );
  }
}

async function syncLocalSubscription(
  admin: SupabaseAdmin,
  localSubscriptionId: number,
  userId: string,
  subscription: Stripe.Subscription,
): Promise<SubscriptionCancellationResult> {
  const item = subscription.items.data[0];
  const tier = planKeyForSubscription(subscription);
  if (!item || !tier) {
    throw new SubscriptionActionError(
      "unsupported_subscription_price",
      409,
      "The active Stripe subscription does not match a BookSmart paid plan.",
    );
  }

  const periodStart =
    timestampToIso(
      (item as unknown as { current_period_start?: number })
        .current_period_start,
    ) ??
    timestampToIso(
      (subscription as unknown as { current_period_start?: number })
        .current_period_start,
    ) ??
    timestampToIso(subscription.start_date);
  const periodEnd =
    timestampToIso(
      (item as unknown as { current_period_end?: number })
        .current_period_end,
    ) ??
    timestampToIso(
      (subscription as unknown as { current_period_end?: number })
        .current_period_end,
    );

  if (!periodStart || !periodEnd) {
    throw new SubscriptionActionError(
      "subscription_period_missing",
      502,
      "Stripe did not return a valid subscription billing period.",
    );
  }

  const { error } = await admin
    .from("subscriptions")
    .update({
      user_id: userId,
      stripe_customer_id: customerId(subscription),
      stripe_subscription_id: subscription.id,
      stripe_price_id: item.price.id,
      stripe_product_id: SUBSCRIPTION_PLANS[tier].productId,
      status: subscription.status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq("id", localSubscriptionId)
    .eq("user_id", userId);

  if (error) {
    throw new SubscriptionActionError(
      "subscription_sync_failed",
      502,
      `Stripe was updated, but BookSmart synchronization failed: ${error.message}`,
    );
  }

  return {
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: periodEnd,
    tier,
    alreadyInRequestedState: false,
  };
}

export async function setSubscriptionCancellation(
  stripe: Stripe,
  admin: SupabaseAdmin,
  userId: string,
  cancelAtPeriodEnd: boolean,
): Promise<SubscriptionCancellationResult> {
  const { data: localRow, error: subscriptionError } = await admin
    .from("subscriptions")
    .select(
      "id, stripe_subscription_id, stripe_price_id, status, current_period_end, cancel_at_period_end",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) {
    throw new SubscriptionActionError(
      "subscription_lookup_failed",
      500,
      subscriptionError.message,
    );
  }

  if (!localRow) {
    throw new SubscriptionActionError(
      "active_subscription_not_found",
      404,
      "No active paid subscription was found.",
    );
  }

  const local = localRow as LocalSubscriptionRow;
  if (local.stripe_subscription_id.startsWith(ADMIN_OVERRIDE_SUBSCRIPTION_PREFIX)) {
    return setAdminOverrideCancellation(
      admin,
      local,
      userId,
      cancelAtPeriodEnd,
    );
  }

  const { data: userRow, error: userError } = await admin
    .from("users")
    .select("stripe_customer_id")
    .eq("auth_id", userId)
    .maybeSingle();

  if (userError) {
    throw new SubscriptionActionError(
      "user_lookup_failed",
      500,
      userError.message,
    );
  }

  const expectedCustomerId =
    (userRow as UserRow | null)?.stripe_customer_id;
  if (!expectedCustomerId) {
    throw new SubscriptionActionError(
      "stripe_customer_missing",
      404,
      "No Stripe customer exists for this account.",
    );
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(
      local.stripe_subscription_id,
    );
  } catch (error) {
    throw new SubscriptionActionError(
      "stripe_subscription_missing",
      404,
      error instanceof Error
        ? error.message
        : "The Stripe subscription could not be retrieved.",
    );
  }

  assertSubscriptionOwnership(
    subscription,
    userId,
    expectedCustomerId,
  );

  if (subscription.status !== "active") {
    throw new SubscriptionActionError(
      "stripe_subscription_not_active",
      409,
      `Stripe subscription is ${subscription.status}, not active.`,
    );
  }

  const alreadyInRequestedState =
    subscription.cancel_at_period_end === cancelAtPeriodEnd;
  if (!alreadyInRequestedState) {
    subscription = await stripe.subscriptions.update(
      subscription.id,
      { cancel_at_period_end: cancelAtPeriodEnd },
    );
  }

  const result = await syncLocalSubscription(
    admin,
    local.id,
    userId,
    subscription,
  );

  return {
    ...result,
    alreadyInRequestedState,
  };
}
