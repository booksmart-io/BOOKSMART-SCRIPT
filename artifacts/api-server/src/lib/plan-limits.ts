import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanTier = "free" | "plus" | "pro";

export interface PlanLimits {
  aiQuestionsPerMonth: number;
  aiStrategiesPerMonth: number;
  receiptUploadsPerMonth: number;
  statementUploadsPerMonth: number;
  connectedAccountsLimit: number;
  transactionsPerMonth: number;
  businessesLimit: number;
  pdfExport: boolean;
  excelExport: boolean;
  contactCpa: boolean;
  directCpaMessaging: boolean;
}

const UNLIMITED = Number.POSITIVE_INFINITY;

// Source of truth: pricing table screenshot (Free / Plus / Pro cards) shared by the user.
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    aiQuestionsPerMonth: 10,
    aiStrategiesPerMonth: 1,
    receiptUploadsPerMonth: 5,
    statementUploadsPerMonth: 1,
    connectedAccountsLimit: 1,
    transactionsPerMonth: 50,
    businessesLimit: 1,
    pdfExport: false,
    excelExport: false,
    contactCpa: false,
    directCpaMessaging: false,
  },
  plus: {
    aiQuestionsPerMonth: 100,
    aiStrategiesPerMonth: 20,
    receiptUploadsPerMonth: 50,
    statementUploadsPerMonth: 10,
    connectedAccountsLimit: 5,
    transactionsPerMonth: 1000,
    businessesLimit: 1,
    pdfExport: true,
    excelExport: false,
    contactCpa: true,
    directCpaMessaging: false,
  },
  pro: {
    aiQuestionsPerMonth: UNLIMITED,
    aiStrategiesPerMonth: UNLIMITED,
    receiptUploadsPerMonth: UNLIMITED,
    statementUploadsPerMonth: UNLIMITED,
    connectedAccountsLimit: UNLIMITED,
    transactionsPerMonth: UNLIMITED,
    businessesLimit: 5,
    pdfExport: true,
    excelExport: true,
    contactCpa: true,
    directCpaMessaging: true,
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = SupabaseClient<any, any, any>;

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Resolves the caller's plan tier from their most recent active subscription. */
export async function getUserTier(admin: SupabaseAdmin, authUserId: string): Promise<PlanTier> {
  const { data: subRow } = await admin
    .from("subscriptions")
    .select("status, stripe_price_id")
    .eq("user_id", authUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subRow || subRow.status !== "active") return "free";

  // Lazily imported to avoid a circular import with stripe-catalog at module load time.
  const { SUBSCRIPTION_PLANS } = await import("./stripe-catalog");
  if (subRow.stripe_price_id === SUBSCRIPTION_PLANS.pro.priceId) return "pro";
  if (subRow.stripe_price_id === SUBSCRIPTION_PLANS.plus.priceId) return "plus";
  return "free";
}

/** Counts this-user's-this-month AI question usage, logged as zero-amount token_transactions rows. */
// NOTE: `token_transactions.type` has a DB check constraint that only allows
// "purchase" | "spend" | "refund" | "bonus" — there is no "ai_question_usage"/
// "ai_strategy_usage" enum value, and no exec_sql access to alter the constraint.
// So usage events are logged with type="spend" (amount=0, no real balance impact)
// and disambiguated via the `use_case` string instead.
const AI_QUESTION_USE_CASE = "ai_question_usage";
const AI_STRATEGY_USE_CASE = "ai_strategy_usage";

export async function countAiQuestionsThisMonth(admin: SupabaseAdmin, authUserId: string): Promise<number> {
  const { count } = await admin
    .from("token_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", authUserId)
    .eq("type", "spend")
    .eq("use_case", AI_QUESTION_USE_CASE)
    .gte("created_at", startOfMonthIso());
  return count ?? 0;
}

export async function logAiQuestionUsage(admin: SupabaseAdmin, authUserId: string, currentBalance: number): Promise<void> {
  const { error } = await admin.from("token_transactions").insert({
    user_id: authUserId,
    amount: 0,
    balance_after: currentBalance,
    type: "spend",
    status: "posted",
    use_case: AI_QUESTION_USE_CASE,
  });
  if (error) console.error("[plan-limits] failed to log AI question usage:", error.message);
}

/**
 * Counts this-user's-this-month AI strategy *unlocks* (one dashboard "Unlock &
 * View" click = one unlock, even though it saves several ai_tax_strategies rows).
 * Logged the same way as AI question usage — zero-amount token_transactions rows —
 * to avoid over-counting the limit by the number of strategies returned per unlock.
 */
export async function countAiStrategiesThisMonth(admin: SupabaseAdmin, authUserId: string): Promise<number> {
  const { count } = await admin
    .from("token_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", authUserId)
    .eq("type", "spend")
    .eq("use_case", AI_STRATEGY_USE_CASE)
    .gte("created_at", startOfMonthIso());
  return count ?? 0;
}

export async function logAiStrategyUsage(admin: SupabaseAdmin, authUserId: string, currentBalance: number): Promise<void> {
  const { error } = await admin.from("token_transactions").insert({
    user_id: authUserId,
    amount: 0,
    balance_after: currentBalance,
    type: "spend",
    status: "posted",
    use_case: AI_STRATEGY_USE_CASE,
  });
  if (error) console.error("[plan-limits] failed to log AI strategy usage:", error.message);
}

/** Receipts vs. everything else (statements/transactions/income/expenses/balance sheet uploads). */
export async function countDocumentUploadsThisMonth(
  admin: SupabaseAdmin,
  numericUserId: number,
  kind: "receipt" | "statement",
): Promise<number> {
  let query = admin
    .from("user_documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", numericUserId)
    .gte("created_at", startOfMonthIso());

  query = kind === "receipt" ? query.eq("category", "Receipts") : query.neq("category", "Receipts");

  const { count } = await query;
  return count ?? 0;
}

/** Number of businesses (organizations) the user currently owns. */
export async function countOrganizations(admin: SupabaseAdmin, numericUserId: number): Promise<number> {
  const { count } = await admin
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", numericUserId);
  return count ?? 0;
}

/** Transactions created this calendar month, across all of the user's organizations. */
export async function countTransactionsThisMonth(admin: SupabaseAdmin, numericUserId: number): Promise<number> {
  const { data: orgRows } = await admin
    .from("organizations")
    .select("id")
    .eq("owner_id", numericUserId);
  const orgIds = (orgRows ?? []).map((o: { id: number }) => o.id);
  if (orgIds.length === 0) return 0;

  const { count } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .in("org_id", orgIds)
    .gte("created_at", startOfMonthIso());
  return count ?? 0;
}
