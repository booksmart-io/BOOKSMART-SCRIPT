import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { findBlockingSubscription } from "./subscription-safety";

function subscription(
  status: Stripe.Subscription.Status,
): Stripe.Subscription {
  return {
    id: `sub_${status}`,
    status,
  } as Stripe.Subscription;
}

test("Free to paid checkout is allowed when no Stripe subscription exists", () => {
  assert.equal(findBlockingSubscription([]), undefined);
});

test("active, trialing, delinquent, and incomplete subscriptions block parallel checkout", () => {
  for (const status of [
    "active",
    "trialing",
    "past_due",
    "unpaid",
    "paused",
    "incomplete",
  ] as Stripe.Subscription.Status[]) {
    assert.equal(
      findBlockingSubscription([subscription(status)])?.status,
      status,
    );
  }
});

test("terminal subscriptions do not block a new hosted Checkout", () => {
  assert.equal(
    findBlockingSubscription([
      subscription("canceled"),
      subscription("incomplete_expired"),
    ]),
    undefined,
  );
});
