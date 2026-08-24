import type { SignalCandidate } from "./monitoring";

export const CONTRACTOR_MONITORING_VERSION = "contractor-monitoring-v1" as const;

export function contractorMonitoringEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.CONTRACTOR_INTELLIGENCE_MONITORING_ENABLED === "true";
}

type ContractorMonitoringInput = {
  targetGrossMargin: number | null;
  jobs: Array<{ id: string; title: string | null; status: string | null; invoiced: number; trackedCosts: number; costCount: number }>;
  invoices: Array<{ id: string; number: string | null; balance: number; dueDate: string | null; jobId: string | null; clientId: string | null }>;
  confirmationMatches: Array<{ id: string; sourceId: string }>;
  receiptReviewTransactionIds: string[];
  unassignedExpenseTransactionIds: string[];
  now?: Date;
};

const base = (sourceIds: string[]) => ({ comparisonValue: null, percentage: null, ctaLabel: "Review",
  ctaRoute: "/user/tasks", requiresCpaReview: false, cpaReviewLevel: "none" as const, sourceIds,
  confidence: 1, provider: "contractor_intelligence" as const, calculationVersion: CONTRACTOR_MONITORING_VERSION });

export function evaluateContractorSignals(input: ContractorMonitoringInput): SignalCandidate[] {
  const signals: SignalCandidate[] = [];
  const now = input.now ?? new Date();
  for (const job of input.jobs) {
    if (job.invoiced <= 0 || job.costCount <= 0) continue;
    const margin = (job.invoiced - job.trackedCosts) / job.invoiced;
    const approachingBreakEven = margin <= .1;
    const belowTarget = input.targetGrossMargin != null && margin < input.targetGrossMargin;
    if (!approachingBreakEven && !belowTarget) continue;
    const gapPoints = input.targetGrossMargin == null ? null : Math.round((input.targetGrossMargin - margin) * 1000) / 10;
    const title = margin <= 0 ? `${job.title || "Job"} has reached a tracked loss`
      : approachingBreakEven ? `${job.title || "Job"} is approaching tracked break-even`
      : `${job.title || "Job"} is below its tracked margin target`;
    const description = input.targetGrossMargin == null
      ? `Current tracked margin is ${(margin * 100).toFixed(1)}% using explicit invoicing and confirmed assigned costs. This is not a final profit forecast.`
      : `Current tracked margin is ${(margin * 100).toFixed(1)}%, ${gapPoints} percentage points below the configured target. This is not a final profit forecast.`;
    signals.push({ ...base([job.id]), signalKey: `contractor:job-margin:${job.id}`, signalType: "trend", category: "expenses",
      severity: margin <= 0 ? "critical" : approachingBreakEven ? "high" : gapPoints! >= 10 ? "high" : "medium", title, description,
      currentValue: margin, comparisonValue: input.targetGrossMargin, percentage: margin * 100,
      recommendedAction: "Review confirmed assigned costs and billing progress for this job.", ctaLabel: "Review job", ctaRoute: "/user/money" });
  }
  const overdue = input.invoices.filter(invoice => invoice.balance > 0 && !!invoice.dueDate && new Date(invoice.dueDate).getTime() < now.getTime());
  if (overdue.length) {
    const total = overdue.reduce((sum, invoice) => sum + invoice.balance, 0);
    signals.push({ ...base(overdue.map(invoice => invoice.id)), signalKey: "contractor:overdue-receivables", signalType: "bookkeeping", category: "cash_flow",
      severity: total >= 10_000 || overdue.length >= 5 ? "high" : "medium", title: `${overdue.length} Jobber invoice${overdue.length === 1 ? " is" : "s are"} overdue`,
      description: `${total.toLocaleString("en-US", { style: "currency", currency: "USD" })} is explicitly past due in Jobber. It is not added to accounting revenue.`,
      currentValue: total, recommendedAction: "Review collection status and follow up on the overdue invoices.", ctaLabel: "Review receivables", ctaRoute: "/user/jobber-records" });
  }
  const completedJobIds = new Set(input.jobs.filter(job => /completed|closed|finished/i.test(job.status ?? "")).map(job => job.id));
  const completedOutstanding = input.invoices.filter(invoice => invoice.balance > 0 && !!invoice.jobId && completedJobIds.has(invoice.jobId));
  if (completedOutstanding.length) {
    const total = completedOutstanding.reduce((sum, invoice) => sum + invoice.balance, 0);
    signals.push({ ...base(completedOutstanding.map(invoice => invoice.id)), signalKey: "contractor:completed-jobs-outstanding", signalType: "bookkeeping", category: "cash_flow",
      severity: total >= 10_000 ? "high" : "medium", title: `${completedOutstanding.length} completed-job invoice${completedOutstanding.length === 1 ? " has" : "s have"} an outstanding balance`,
      description: `${total.toLocaleString("en-US", { style: "currency", currency: "USD" })} remains explicitly outstanding on completed Jobber work.`, currentValue: total,
      recommendedAction: "Confirm collection status and follow up with the affected customers.", ctaLabel: "Review receivables", ctaRoute: "/user/jobber-records" });
  }
  const outstandingByClient = new Map<string, { total: number; invoiceIds: string[] }>();
  for (const invoice of input.invoices.filter(row => row.balance > 0 && row.clientId)) {
    const current = outstandingByClient.get(invoice.clientId!) ?? { total: 0, invoiceIds: [] };
    current.total += invoice.balance; current.invoiceIds.push(invoice.id); outstandingByClient.set(invoice.clientId!, current);
  }
  const totalOutstanding = [...outstandingByClient.values()].reduce((sum, row) => sum + row.total, 0);
  const largestClient = [...outstandingByClient.entries()].sort((left, right) => right[1].total - left[1].total)[0];
  if (largestClient && totalOutstanding >= 1_000 && largestClient[1].total / totalOutstanding >= .5) {
    const share = largestClient[1].total / totalOutstanding;
    signals.push({ ...base(largestClient[1].invoiceIds), signalKey: "contractor:receivable-concentration", signalType: "trend", category: "cash_flow",
      severity: share >= .75 ? "high" : "medium", title: `One customer represents ${(share * 100).toFixed(0)}% of outstanding receivables`,
      description: `${largestClient[1].total.toLocaleString("en-US", { style: "currency", currency: "USD" })} of ${totalOutstanding.toLocaleString("en-US", { style: "currency", currency: "USD" })} outstanding is tied to one explicit Jobber customer.`,
      currentValue: largestClient[1].total, comparisonValue: totalOutstanding, percentage: share * 100,
      recommendedAction: "Review collection timing and cash exposure for the concentrated customer balance.", ctaLabel: "Review customers", ctaRoute: "/user/money" });
  }
  if (input.confirmationMatches.length) signals.push({ ...base(input.confirmationMatches.map(match => match.id)),
    signalKey: "contractor:matches-needing-confirmation", signalType: "bookkeeping", category: "bookkeeping",
    severity: input.confirmationMatches.length >= 10 ? "high" : "medium", title: `${input.confirmationMatches.length} financial match${input.confirmationMatches.length === 1 ? " needs" : "es need"} confirmation`,
    description: "BookSmart found possible receipt, transaction, or job links that are not reliable enough to assign silently.", currentValue: input.confirmationMatches.length,
    recommendedAction: "Confirm or reject the suggested financial matches.", ctaLabel: "Review matches", ctaRoute: "/user/tasks" });
  if (input.receiptReviewTransactionIds.length) signals.push({ ...base(input.receiptReviewTransactionIds),
    signalKey: "contractor:expenses-needing-receipt-review", signalType: "bookkeeping", category: "bookkeeping",
    severity: input.receiptReviewTransactionIds.length >= 10 ? "high" : "medium", title: `${input.receiptReviewTransactionIds.length} large purchase${input.receiptReviewTransactionIds.length === 1 ? " needs" : "s need"} receipt review`,
    description: "These approved purchases are at least $500 and have no confirmed receipt link. A receipt may not be required in every case.", currentValue: input.receiptReviewTransactionIds.length,
    recommendedAction: "Attach a receipt where available or mark the purchase as reviewed.", ctaLabel: "Review purchases", ctaRoute: "/user/reports" });
  if (input.unassignedExpenseTransactionIds.length) signals.push({ ...base(input.unassignedExpenseTransactionIds),
    signalKey: "contractor:unassigned-job-expenses", signalType: "bookkeeping", category: "bookkeeping",
    severity: input.unassignedExpenseTransactionIds.length >= 10 ? "high" : "medium", title: `${input.unassignedExpenseTransactionIds.length} approved expense${input.unassignedExpenseTransactionIds.length === 1 ? " is" : "s are"} not assigned to a job`,
    description: "These are canonical approved expenses without a confirmed contractor job-cost assignment. Some may be overhead and require no job.", currentValue: input.unassignedExpenseTransactionIds.length,
    recommendedAction: "Assign direct job costs where supported or leave legitimate overhead unassigned.", ctaLabel: "Review job costs", ctaRoute: "/user/tasks" });
  return signals;
}

export function isContractorLifecycleKey(key: string) { return key.startsWith("contractor:"); }
