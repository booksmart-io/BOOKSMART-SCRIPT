import type { QueryClient } from "@tanstack/react-query";

const PAYMENT_QUERY_KEYS = [
  "stripe_status",
  "dashboard_subscription_status",
  "token_balance",
  "token_transactions",
  "token_unlock_summary",
  "plan_limits_usage",
] as const;

export function invalidatePaymentQueries(queryClient: QueryClient) {
  for (const key of PAYMENT_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}
