import { authenticatedApi, apiErrorMessage } from "@/lib/authenticated-api";

export type TrustedMetric = { value: number | null; confidence: "high" | "medium" | "low" | "unavailable"; sources: string[]; missingInputs: string[] };
export type ProvenanceReference = { source: "booksmart" | "quickbooks" | "plaid" | "jobber" | "receipt" | "gmail"; recordType: string; recordId: string };
export type ContractorJobSummary = {
  id: string; jobNumber: string | null; title: string | null; status: string | null;
  jobValue: TrustedMetric; amountInvoiced: TrustedMetric; amountCollected: TrustedMetric; amountOutstanding: TrustedMetric;
  trackedCosts: TrustedMetric; currentTrackedProfit: TrustedMetric; currentTrackedMargin: TrustedMetric;
  targetGrossMargin: number | null; attentionScore: number; attentionStatus: "needs_attention" | "watch" | "healthy" | "insufficient_data"; attentionReasons: string[];
  provenance: ProvenanceReference[];
};
export type ContractorIntelligence = {
  dataConfidence: TrustedMetric["confidence"]; dataFreshness: Record<string, string | null>; dataSources: string[]; missingInputs: string[];
  revenue: TrustedMetric; expenses: TrustedMetric; netIncome: TrustedMetric; netCashMovement: TrustedMetric;
  yearToDate: { revenue: TrustedMetric; expenses: TrustedMetric; netIncome: TrustedMetric };
  comparisons: { previousPeriod: { revenueChangePercent: TrustedMetric; expenseChangePercent: TrustedMetric; netIncomeChangePercent: TrustedMetric };
    samePeriodLastYear: { revenueChangePercent: TrustedMetric; expenseChangePercent: TrustedMetric; netIncomeChangePercent: TrustedMetric } };
  cashPosition: { currentBalance: TrustedMetric; availableBalance: TrustedMetric };
  accountsReceivable: { totalOutstanding: TrustedMetric; overdueAmount: TrustedMetric; overdueInvoiceCount: number;
    averageInvoiceAgeDays: TrustedMetric; largestCustomerBalances: Array<{ customerId: string; customerName: string | null; outstanding: number; overdue: number }> };
  jobs: ContractorJobSummary[]; bookkeepingIssues: Array<{ type: string; count: number }>;
  expenseCategoryChanges: Array<{ key: string; label: string; current: number; previous: number; changePercent: number | null }>;
  unusualTransactions: Array<{ transactionId: string; title: string | null; amount: number; date: string; reasons: string[]; provenance: ProvenanceReference[] }>;
};

export async function loadContractorIntelligence(organizationId: number, start: Date, end: Date) {
  const params = new URLSearchParams({ startInstant: start.toISOString(), endInstant: end.toISOString() });
  const response = await authenticatedApi(`/api/organizations/${organizationId}/contractor-financial-intelligence?${params}`);
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Contractor intelligence is unavailable."));
  return response.json() as Promise<ContractorIntelligence>;
}
