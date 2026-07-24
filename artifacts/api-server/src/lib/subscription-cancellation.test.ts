import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { SUBSCRIPTION_PLANS } from "./stripe-catalog";
import {
  SubscriptionActionError,
  assertSubscriptionOwnership,
  planKeyForSubscription,
  setSubscriptionCancellation,
} from "./subscription-cancellation";

function subscription(
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  return {
    id: "sub_booksmart",
    customer: "cus_booksmart",
    metadata: { user_id: "user-booksmart" },
    items: {
      data: [
        {
          price: { id: SUBSCRIPTION_PLANS.plus.priceId },
        },
      ],
    },
    ...overrides,
  } as Stripe.Subscription;
}

test("recognizes BookSmart Plus and Pro prices", () => {
  assert.equal(planKeyForSubscription(subscription()), "plus");
  assert.equal(
    planKeyForSubscription(
      subscription({
        items: {
          data: [
            {
              price: { id: SUBSCRIPTION_PLANS.pro.priceId },
            },
          ],
        } as Stripe.ApiList<Stripe.SubscriptionItem>,
      }),
    ),
    "pro",
  );
});

test("rejects a Stripe customer ownership mismatch", () => {
  assert.throws(
    () =>
      assertSubscriptionOwnership(
        subscription(),
        "user-booksmart",
        "cus_other",
      ),
    (error) =>
      error instanceof SubscriptionActionError &&
      error.code === "subscription_customer_mismatch",
  );
});

test("rejects a Stripe metadata user mismatch when metadata is present", () => {
  assert.throws(
    () =>
      assertSubscriptionOwnership(
        subscription(),
        "user-other",
        "cus_booksmart",
      ),
    (error) =>
      error instanceof SubscriptionActionError &&
      error.code === "subscription_user_mismatch",
  );
});

test("allows legacy subscriptions without user metadata when Customer matches", () => {
  assert.doesNotThrow(() =>
    assertSubscriptionOwnership(
      subscription({ metadata: {} }),
      "user-booksmart",
      "cus_booksmart",
    ),
  );
});

function actionableSubscription(
  cancelAtPeriodEnd: boolean,
): Stripe.Subscription {
  return subscription({
    status: "active",
    cancel_at_period_end: cancelAtPeriodEnd,
    start_date: 1_752_489_600,
    items: {
      data: [
        {
          price: { id: SUBSCRIPTION_PLANS.plus.priceId },
          current_period_start: 1_752_489_600,
          current_period_end: 1_755_168_000,
        } as Stripe.SubscriptionItem,
      ],
    } as Stripe.ApiList<Stripe.SubscriptionItem>,
  });
}

function fakeAdmin() {
  const updates: Record<string, unknown>[] = [];
  return {
    updates,
    from(table: string) {
      let mode: "select" | "update" = "select";
      const builder = {
        select() {
          mode = "select";
          return builder;
        },
        update(payload: Record<string, unknown>) {
          mode = "update";
          updates.push(payload);
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        async maybeSingle() {
          if (table === "users") {
            return {
              data: { stripe_customer_id: "cus_booksmart" },
              error: null,
            };
          }
          return {
            data: {
              id: 42,
              stripe_subscription_id: "sub_booksmart",
              status: "active",
              current_period_end: "2025-08-14T00:00:00.000Z",
              cancel_at_period_end: false,
            },
            error: null,
          };
        },
        then(resolve: (value: unknown) => void) {
          resolve(mode === "update" ? { error: null } : { data: null, error: null });
        },
      };
      return builder;
    },
  };
}

test("schedules period-end cancellation and synchronizes the returned Stripe state", async () => {
  const admin = fakeAdmin();
  let updateCalls = 0;
  const stripe = {
    subscriptions: {
      retrieve: async () => actionableSubscription(false),
      update: async (_id: string, params: { cancel_at_period_end: boolean }) => {
        updateCalls += 1;
        return actionableSubscription(params.cancel_at_period_end);
      },
    },
  };

  const result = await setSubscriptionCancellation(
    stripe as unknown as Stripe,
    admin as never,
    "user-booksmart",
    true,
  );

  assert.equal(updateCalls, 1);
  assert.equal(result.cancelAtPeriodEnd, true);
  assert.equal(result.tier, "plus");
  assert.equal(admin.updates.at(-1)?.cancel_at_period_end, true);
});

test("a repeated cancellation request is idempotent", async () => {
  const admin = fakeAdmin();
  let updateCalls = 0;
  const stripe = {
    subscriptions: {
      retrieve: async () => actionableSubscription(true),
      update: async () => {
        updateCalls += 1;
        return actionableSubscription(true);
      },
    },
  };

  const result = await setSubscriptionCancellation(
    stripe as unknown as Stripe,
    admin as never,
    "user-booksmart",
    true,
  );

  assert.equal(updateCalls, 0);
  assert.equal(result.alreadyInRequestedState, true);
  assert.equal(result.cancelAtPeriodEnd, true);
});

test("resumes a scheduled subscription without changing its paid tier", async () => {
  const admin = fakeAdmin();
  const stripe = {
    subscriptions: {
      retrieve: async () => actionableSubscription(true),
      update: async () => actionableSubscription(false),
    },
  };

  const result = await setSubscriptionCancellation(
    stripe as unknown as Stripe,
    admin as never,
    "user-booksmart",
    false,
  );

  assert.equal(result.cancelAtPeriodEnd, false);
  assert.equal(result.tier, "plus");
});
