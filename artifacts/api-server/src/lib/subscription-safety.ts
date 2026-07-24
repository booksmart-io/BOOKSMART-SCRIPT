import type Stripe from "stripe";

const TERMINAL_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "canceled",
  "incomplete_expired",
]);

export function findBlockingSubscription(
  subscriptions: Stripe.Subscription[],
): Stripe.Subscription | undefined {
  return subscriptions.find(
    (subscription) =>
      !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status),
  );
}
