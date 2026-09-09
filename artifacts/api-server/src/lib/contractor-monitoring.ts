import type { SignalCandidate } from "./monitoring";
import { reconcileEconomicEvents, type EconomicEventEvidence } from "./contractor-economic-event-reconciler";

export const CONTRACTOR_MONITORING_VERSION = "contractor-monitoring-v1" as const;

export function contractorMonitoringEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.CONTRACTOR_INTELLIGENCE_MONITORING_ENABLED === "true";
}

type ContractorMonitoringInput = {
  targetGrossMargin: number | null;
  jobs: Array<{ id: string; title: string | null; status: string | null; value: number; invoiced: number; trackedCosts: number; costCount: number; costSourceIds?: string[]; estimatedCost?: number }>;
  invoices: Array<{ id: string; number: string | null; total?: number; balance: number; dueDate: string | null; jobId: string | null; clientId: string | null; provider?: "jobber" | "quickbooks" }>;
  confirmationMatches: Array<{ id: string; sourceId: string }>;
  receiptReviewTransactionIds: string[];
  unassignedExpenseTransactionIds: string[];
  upcomingObligations?: Array<{ id: string; kind: "payroll" | "vendor_bill"; amount: number; dueDate: string; confidence: "high" | "medium"; provider?: "gmail" | "quickbooks" }>;
  availableCash?: number | null;
  economicEventEvidence?: EconomicEventEvidence[];
  accountingConfirmationUnavailable?: boolean;
  bankActivity?: { customerPayments: Array<{ id: string; amount: number }>; transactionCount: number; supportedEmailCount: number; startingCash?: number | null };
  bankEmailMatches?: Array<{ id: string; bankRecordId: string; emailRecordId: string; amount: number; label: string }>;
  splitPaymentGroups?: Array<{ id: string; label: string; total: number; recordIds: string[] }>;
  ambiguousJobMatches?: Array<{ id: string; amount: number; transactionId: string; emailId: string; jobIds: string[]; label: string }>;
  staleSyncCandidates?: Array<{ id: string; amount: number; transactionId: string; invoiceId: string; jobId: string; lastRefresh: string | null }>;
  now?: Date;
};

const base = (sourceIds: string[]) => ({ comparisonValue: null, percentage: null, ctaLabel: "Review",
  ctaRoute: "/user/tasks", requiresCpaReview: false, cpaReviewLevel: "none" as const, sourceIds,
  confidence: 1, provider: "contractor_intelligence" as const, calculationVersion: CONTRACTOR_MONITORING_VERSION });

export type UpcomingObligation = NonNullable<ContractorMonitoringInput["upcomingObligations"]>[number];

export function mergeUpcomingObligations(gmail: UpcomingObligation[], quickbooks: UpcomingObligation[]) {
  const key = (row: UpcomingObligation) => `${row.kind}|${row.dueDate.slice(0, 10)}|${Math.round(row.amount * 100)}`;
  const merged = new Map<string, UpcomingObligation>();
  for (const row of gmail) merged.set(key(row), row);
  // An explicit open QuickBooks Bill is authoritative over a matching Gmail reminder.
  for (const row of quickbooks) merged.set(key(row), row);
  return [...merged.values()].sort((left, right) => left.dueDate.localeCompare(right.dueDate));
}

export function evaluateContractorSignals(input: ContractorMonitoringInput): SignalCandidate[] {
  const signals: SignalCandidate[] = [];
  const now = input.now ?? new Date();
  if (input.accountingConfirmationUnavailable) signals.push({ ...base(["quickbooks:unavailable"]),
    signalKey: "contractor:accounting-confirmation-unavailable", signalType: "connection", category: "bookkeeping", severity: "high",
    title: "Accounting confirmation is limited",
    description: "QuickBooks is disconnected or unhealthy. BookSmart can continue with available bank, Jobber, and Gmail evidence, but accounting confirmation is limited and no QuickBooks values are invented.",
    currentValue: 0, recommendedAction: "Reconnect QuickBooks before relying on accounting-confirmed totals.", ctaLabel: "Review connection", ctaRoute: "/user/settings",
    confidence: .5, evidence: [{ provider: "quickbooks", recordType: "connection", recordId: "unavailable", label: "QuickBooks accounting confirmation",
      state: "missing", route: "/user/settings", reason: "The accounting connection is disconnected, stale, or unhealthy" }],
    calculation: { summary: "Available-source intelligence is qualified because accounting confirmation is unavailable.", operands: [] } });
  const bankActivity = input.bankActivity;
  if (bankActivity?.customerPayments.length) {
    const total = bankActivity.customerPayments.reduce((sum, row) => sum + row.amount, 0);
    signals.push({ ...base(bankActivity.customerPayments.map(row => row.id)), signalKey: "contractor:classified-customer-payments", signalType: "cash_flow", category: "revenue", severity: "info",
      title: `${total.toLocaleString("en-US", { style: "currency", currency: "USD" })} of bank activity is explicitly classified as customer payments`,
      description: "Only bank records explicitly classified as customer payments are included. Internal and personal transfers are excluded rather than treated as revenue.",
      currentValue: total, recommendedAction: "Review customer-payment classifications and supporting evidence.", ctaLabel: "Review bank activity", ctaRoute: "/user/reports",
      evidence: bankActivity.customerPayments.map(row => ({ provider: "plaid", recordType: "transaction", recordId: row.id, label: "Explicit customer payment", state: "confirmed" as const, route: "/user/reports", reason: "Provider-normalized customer_payment classification" })),
      exclusions: ["internal_transfers", "personal_transfers"], calculation: { summary: "Add explicit customer-payment bank records without counting transfers.", operands: [
        ...bankActivity.customerPayments.map(row => ({ label: `Customer payment ${row.id}`, value: row.amount, format: "currency" as const, operation: "add" as const })),
        ...(bankActivity.startingCash == null ? [] : [{ label: "Starting cash", value: bankActivity.startingCash, format: "currency" as const, operation: "compare" as const }]),
      ] } });
  }
  if (bankActivity && bankActivity.transactionCount > 0 && bankActivity.supportedEmailCount < bankActivity.transactionCount) {
    signals.push({ ...base([]), signalKey: "contractor:sparse-evidence", signalType: "bookkeeping", category: "bookkeeping", severity: "medium",
      title: "Unsupported classifications have low confidence",
      description: `${bankActivity.supportedEmailCount} of ${bankActivity.transactionCount} bank transactions have supporting email evidence. Known, likely, and unknown activity must remain separate; unsupported classifications have low confidence.`,
      currentValue: bankActivity.supportedEmailCount, comparisonValue: bankActivity.transactionCount, recommendedAction: "Review unsupported transactions before assigning customers, jobs, or accounting treatment.",
      ctaLabel: "Review evidence", ctaRoute: "/user/tasks", confidence: bankActivity.supportedEmailCount / bankActivity.transactionCount,
      calculation: { summary: "Compare supporting email evidence with the number of observed bank transactions.", operands: [
        { label: "Bank transactions", value: bankActivity.transactionCount, format: "number", operation: "compare" },
        { label: "Supported transactions", value: bankActivity.supportedEmailCount, format: "number", operation: "compare" },
      ] } });
  }
  for (const match of input.bankEmailMatches ?? []) {
    signals.push({ ...base([match.bankRecordId, match.emailRecordId]), signalKey: `contractor:bank-email-match:${match.id}`, signalType: "bookkeeping", category: "bookkeeping", severity: "info",
      title: `${match.label} bank activity has supporting email evidence`,
      description: "BookSmart matched the bank record to email evidence using an exact amount and a distinctive shared counterparty reference. The email supports the event but does not create a second financial transaction.",
      currentValue: match.amount, recommendedAction: "Review the connected bank and email records.", ctaLabel: "Review match", ctaRoute: "/user/tasks",
      evidence: [
        { provider: "plaid", recordType: "transaction", recordId: match.bankRecordId, label: `${match.label} bank record`, state: "confirmed", route: "/user/reports", reason: "Exact amount and shared counterparty reference" },
        { provider: "gmail", recordType: "email", recordId: match.emailRecordId, label: `${match.label} email evidence`, state: "confirmed", route: "/user/tasks", reason: "Exact amount and shared counterparty reference" },
      ], calculation: { summary: "One economic event supported by bank and email evidence; count the financial value once.", operands: [{ label: "Matched amount", value: match.amount, format: "currency", operation: "compare" }] } });
  }
  for (const group of input.splitPaymentGroups ?? []) {
    signals.push({ ...base(group.recordIds), signalKey: `contractor:split-payment-group:${group.id}`, signalType: "bookkeeping", category: "bookkeeping", severity: "info",
      title: `${group.label} split payments are linked without duplicate counting`,
      description: `Multiple payment records and their supporting bank and contract evidence describe the same economic contract total of ${group.total.toLocaleString("en-US", { style: "currency", currency: "USD" })}. Each actual payment is counted once; duplicate source evidence is not added again.`,
      currentValue: group.total, recommendedAction: "Review the linked contract and split-payment evidence.", ctaLabel: "Review payment group", ctaRoute: "/user/tasks",
      evidence: group.recordIds.map(recordId => ({ provider: "booksmart" as const, recordType: "payment_evidence", recordId, label: recordId, state: "confirmed" as const, route: "/user/tasks", reason: "Exact component amount, shared counterparty reference, and matching contract total" })),
      calculation: { summary: "Group explicitly corroborated split payments under one contract while counting each payment once.", operands: [{ label: "Contract and collected total", value: group.total, format: "currency", operation: "compare" }] } });
  }
  for (const match of input.ambiguousJobMatches ?? []) {
    signals.push({ ...base([match.transactionId, match.emailId, ...match.jobIds]), signalKey: `contractor:ambiguous-job-match:${match.id}`, signalType: "bookkeeping", category: "bookkeeping", severity: "medium",
      title: `${match.label} cost needs job confirmation`,
      description: `${match.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} is supported by matching bank and receipt evidence, but ${match.jobIds.length} active jobs are equally plausible. The cost remains unassigned until a user confirms the job.`,
      currentValue: match.amount, recommendedAction: "Choose the correct job or leave this cost unassigned.", ctaLabel: "Confirm job", ctaRoute: "/user/tasks", confidence: .5,
      evidence: [
        { provider: "plaid", recordType: "transaction", recordId: match.transactionId, label: "Unassigned bank expense", state: "confirmed", route: "/user/reports", reason: "Exact amount and shared project reference with receipt" },
        { provider: "gmail", recordType: "receipt", recordId: match.emailId, label: "Supporting receipt", state: "confirmed", route: "/user/tasks", reason: "Exact amount and shared project reference with bank record" },
        ...match.jobIds.map(recordId => ({ provider: "jobber" as const, recordType: "job", recordId, label: `Possible job ${recordId}`, state: "estimated" as const, route: "/user/jobber-records", reason: "Equally plausible shared customer or project reference; manual review required" })),
      ], calculation: { summary: "Keep the expense unassigned because multiple jobs have equal supporting evidence.", operands: [{ label: "Unassigned expense", value: match.amount, format: "currency", operation: "compare" }] } });
  }
  for (const candidate of input.staleSyncCandidates ?? []) {
    signals.push({ ...base([candidate.transactionId, candidate.invoiceId, candidate.jobId]), signalKey: `contractor:possible-sync-delay:${candidate.id}`, signalType: "connection", category: "bookkeeping", severity: "medium",
      title: "A fresh bank payment may be waiting on stale QuickBooks data",
      description: `The bank shows a ${candidate.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} customer payment while the linked QuickBooks invoice remains unpaid and QuickBooks freshness is stale${candidate.lastRefresh ? ` since ${candidate.lastRefresh}` : ""}. This is a possible synchronization delay, not a confirmed invoice payment.`,
      currentValue: candidate.amount, recommendedAction: "Refresh QuickBooks, then confirm whether the invoice payment status updates.", ctaLabel: "Review connection", ctaRoute: "/user/settings", confidence: .7,
      evidence: [
        { provider: "plaid", recordType: "transaction", recordId: candidate.transactionId, label: "Fresh bank customer payment", state: "confirmed", route: "/user/reports", reason: "Explicit bank customer-payment classification" },
        { provider: "quickbooks", recordType: "invoice", recordId: candidate.invoiceId, label: "QuickBooks invoice still unpaid", state: "stale", route: "/user/money", reason: "Accounting connection freshness requires attention" },
        { provider: "jobber", recordType: "job", recordId: candidate.jobId, label: "Linked job", state: "confirmed", route: "/user/jobber-records", reason: "Invoice carries this explicit project reference" },
      ], calculation: { summary: "Surface the payment-status freshness conflict for review; do not mark the invoice paid.", operands: [{ label: "Bank payment", value: candidate.amount, format: "currency", operation: "compare" }, { label: "QuickBooks unpaid balance", value: candidate.amount, format: "currency", operation: "compare" }] } });
  }
  const economicEvents = reconcileEconomicEvents(input.economicEventEvidence ?? []);
  const evidenceProvider = (source: EconomicEventEvidence["source"]) => source === "manual_statement" ? "booksmart" as const : source;
  for (const event of economicEvents) {
    if (!event.conflicts.length && !event.refundIds.length && event.evidence.length > 1) {
      signals.push({ ...base(event.evidence.map(row => row.id)), signalKey: `contractor:deduplicated-economic-event:${event.id}`,
        signalType: "bookkeeping", category: "bookkeeping", severity: "info", title: "Duplicate source records represent the same economic event",
        description: `${event.evidence.length} connected records support one ${event.kind.replaceAll("_", " ")} of ${event.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}. The economic value is counted once, while every source remains visible.`,
        currentValue: event.amount, recommendedAction: "Review the consolidated source evidence.", ctaLabel: "Review evidence", ctaRoute: "/user/tasks",
        evidence: event.evidence.map(row => ({ provider: evidenceProvider(row.source), recordType: row.kind, recordId: row.id, label: `${row.source} evidence`, state: "confirmed" as const,
          route: row.source === "quickbooks" ? "/user/money" : row.source === "gmail" ? "/user/tasks" : "/user/reports", reason: `Explicit or corroborated correlation reference ${row.correlationKey}` })),
        calculation: { summary: "Deduplicate source evidence and count the economic event once.", operands: [{ label: "Economic event value", value: event.amount, format: "currency", operation: "compare" }] } });
    }
    if (event.conflicts.length) {
      const conflict = event.conflicts[0]!;
      signals.push({ ...base(event.evidence.map(row => row.id)), signalKey: `contractor:economic-event-conflict:${event.id}`,
        signalType: "bookkeeping", category: "bookkeeping", severity: "high", title: "Conflicting amounts need reconciliation",
        description: `Connected records for one ${event.kind.replaceAll("_", " ")} report ${conflict.observedAmounts.map(value => value.toLocaleString("en-US", { style: "currency", currency: "USD" })).join(" and ")}. QuickBooks precedence is preserved, but no source record was overwritten.`,
        currentValue: event.amount, comparisonValue: conflict.observedAmounts.find(value => value !== event.amount) ?? null, percentage: null,
        recommendedAction: "Review the connected records and confirm the correct economic amount.", ctaLabel: "Review conflict", ctaRoute: "/user/tasks", confidence: .5,
        evidence: event.evidence.map(row => ({ provider: evidenceProvider(row.source), recordType: row.kind, recordId: row.id,
          label: `${row.source} ${Math.abs(row.amount).toLocaleString("en-US", { style: "currency", currency: "USD" })}`,
          state: "conflicting" as const, route: row.source === "quickbooks" ? "/user/money" : "/user/reports", reason: `Explicit correlation reference ${row.correlationKey}` })),
        calculation: { summary: "Keep conflicting source amounts separate until reviewed.", operands: [
          ...conflict.observedAmounts.map((value, index) => ({ label: `Observed amount ${index + 1}`, value, format: "currency" as const, operation: "compare" as const })),
          { label: "Discrepancy", value: Math.max(...conflict.observedAmounts) - Math.min(...conflict.observedAmounts), format: "currency" as const, operation: "compare" as const },
        ] } });
    }
    if (event.refundIds.length) signals.push({ ...base(event.evidence.map(row => row.id)), signalKey: `contractor:refund-adjustment:${event.id}`,
      signalType: "bookkeeping", category: "cash_flow", severity: "info", title: "Customer payment includes a linked refund",
      description: `${event.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} was collected and linked refund evidence reduces net collected cash to ${event.netAmount.toLocaleString("en-US", { style: "currency", currency: "USD" })}. The refund is not treated as an operating expense.`,
      currentValue: event.netAmount, comparisonValue: event.amount, percentage: null,
      recommendedAction: "Confirm the linked payment and refund records.", ctaLabel: "Review refund", ctaRoute: "/user/money",
      evidence: event.evidence.map(row => ({ provider: evidenceProvider(row.source), recordType: row.kind, recordId: row.id,
        label: row.kind === "refund" ? "Refund or credit" : "Original customer payment", state: "confirmed" as const,
        route: row.source === "quickbooks" ? "/user/money" : "/user/reports", reason: row.kind === "refund" ? `Explicitly reverses ${row.reverses}` : `Explicit correlation reference ${row.correlationKey}` })),
      calculation: { summary: "Subtract one consolidated refund event from the original collected payment.", operands: [
        { label: "Original payment", value: event.amount, format: "currency", operation: "add" },
        { label: "Consolidated refund", value: event.amount - event.netAmount, format: "currency", operation: "subtract" },
        { label: "Net collected cash", value: event.netAmount, format: "currency", operation: "compare" },
      ] } });
  }
  const obligations = input.upcomingObligations ?? [];
  if (obligations.length) {
    const total = obligations.reduce((sum, item) => sum + item.amount, 0);
    const projectedCash = input.availableCash == null ? null : input.availableCash - total;
    const earliest = obligations[0]!.dueDate;
    const shortfall = projectedCash != null && projectedCash < 0;
    signals.push({ ...base(obligations.map(item => item.id)), signalKey: "contractor:upcoming-cash-obligations", signalType: "cash_flow", category: "cash_flow",
      severity: shortfall ? "critical" : projectedCash != null && projectedCash < total * .25 ? "high" : "medium",
      title: shortfall ? "Upcoming obligations exceed available cash" : `${obligations.length} upcoming cash obligation${obligations.length === 1 ? " is" : "s are"} due soon`,
      description: `${total.toLocaleString("en-US", { style: "currency", currency: "USD" })} is explicitly scheduled beginning ${earliest}. ${projectedCash == null ? "Available cash could not be verified." : `After these obligations, projected available cash is ${projectedCash.toLocaleString("en-US", { style: "currency", currency: "USD" })}.`} These are source-backed obligations, not additional accounting expenses.`,
      currentValue: total, comparisonValue: input.availableCash ?? null, percentage: null,
      recommendedAction: shortfall ? "Review payment timing and secure enough cash before the earliest due date." : "Confirm the obligations and preserve enough cash for their due dates.",
      ctaLabel: "Review cash plan", ctaRoute: "/user/reports", confidence: obligations.every(item => item.confidence === "high") ? 1 : .8,
      evidence: [
        ...(input.availableCash == null ? [{ provider: "plaid" as const, recordType: "balance", recordId: "available-cash", label: "Available bank cash", state: "missing" as const, reason: "No verified Plaid balance was available" }] : [{ provider: "plaid" as const, recordType: "balance", recordId: "available-cash", label: "Available bank cash", state: "confirmed" as const, route: "/user/reports", reason: "Latest verified available balance" }]),
        ...obligations.map(item => ({ provider: item.provider ?? "gmail", recordType: item.kind, recordId: item.id, label: item.kind === "payroll" ? "Payroll obligation" : "Vendor bill obligation", state: item.confidence === "high" ? "confirmed" as const : "estimated" as const, route: item.provider === "quickbooks" ? "/user/money" : "/user/tasks", reason: `Explicit amount and due date in ${item.provider === "quickbooks" ? "QuickBooks" : "Gmail"} evidence` })),
      ], calculation: { summary: "Subtract explicitly scheduled obligations from verified available cash.", operands: [
        ...(input.availableCash == null ? [] : [{ label: "Available cash", value: input.availableCash, format: "currency" as const, operation: "add" as const }]),
        ...obligations.map(item => ({ label: item.kind === "payroll" ? "Payroll" : "Vendor bill", value: item.amount, format: "currency" as const, operation: "subtract" as const })),
        ...(projectedCash == null ? [] : [{ label: "Projected available cash", value: projectedCash, format: "currency" as const, operation: "compare" as const }]),
        ...(shortfall ? [{ label: "Cash shortfall", value: Math.abs(projectedCash!), format: "currency" as const, operation: "compare" as const }] : []),
      ] } });
  }
  for (const job of input.jobs) {
    const activeMargin = job.invoiced > 0 ? (job.invoiced - job.trackedCosts) / job.invoiced : null;
    const activeNeedsMarginWarning = activeMargin != null && (activeMargin <= .1 || (input.targetGrossMargin != null && activeMargin < input.targetGrossMargin));
    if (!/completed|closed|finished/i.test(job.status ?? "") && job.costCount > 0 && !activeNeedsMarginWarning) {
      signals.push({ ...base([job.id, ...(job.costSourceIds ?? [])]), signalKey: `contractor:active-job-progress:${job.id}`, signalType: "trend", category: "expenses", severity: "info",
        title: `${job.title || "Active job"} has tracked costs in progress`,
        description: `${job.trackedCosts.toLocaleString("en-US", { style: "currency", currency: "USD" })} of confirmed costs are associated with active work. Invoiced-to-date and job value are shown separately; this is not completed-job profit or fully realized revenue.`,
        currentValue: job.trackedCosts, comparisonValue: job.invoiced, percentage: null,
        recommendedAction: "Review current billing and confirmed costs as the job progresses.", ctaLabel: "Review active job", ctaRoute: "/user/jobber-records",
        evidence: [{ provider: "jobber", recordType: "job", recordId: job.id, label: job.title || job.id, state: "confirmed", route: `/user/jobber-records?object_type=jobs&record_id=${encodeURIComponent(job.id)}`, reason: "Jobber marks this job active" },
          ...(job.costSourceIds ?? []).map(id => ({ provider: "booksmart" as const, recordType: "transaction", recordId: id, label: `Confirmed assigned cost ${id}`, state: "confirmed" as const, route: "/user/reports", reason: "Confirmed job-cost assignment" }))],
        calculation: { summary: "Keep active-job value, invoiced-to-date, and confirmed costs separate.", operands: [
          { label: "Job value", value: job.value, format: "currency", operation: "compare" },
          { label: "Invoiced to date", value: job.invoiced, format: "currency", operation: "compare" },
          { label: "Confirmed costs", value: job.trackedCosts, format: "currency", operation: "compare" },
        ] } });
    }
    if (job.invoiced <= 0 || job.costCount <= 0) continue;
    const margin = (job.invoiced - job.trackedCosts) / job.invoiced;
    const approachingBreakEven = margin <= .1;
    const belowTarget = input.targetGrossMargin != null && margin < input.targetGrossMargin;
    const completedProfitability = (job.status === "completed" || job.status === "closed") && !approachingBreakEven && !belowTarget;
    if (!approachingBreakEven && !belowTarget && !completedProfitability) continue;
    const gapPoints = input.targetGrossMargin == null ? null : Math.round((input.targetGrossMargin - margin) * 1000) / 10;
    const title = margin <= 0 ? `${job.title || "Job"} has reached a tracked loss`
      : approachingBreakEven ? `${job.title || "Job"} is approaching tracked break-even`
      : belowTarget ? `${job.title || "Job"} is below its tracked margin target`
      : `${job.title || "Job"} completed with tracked profitability`;
    const description = input.targetGrossMargin == null
      ? `Current tracked margin is ${(margin * 100).toFixed(1)}% using explicit invoicing and confirmed assigned costs. This is not a final profit forecast.`
      : `Current tracked margin is ${(margin * 100).toFixed(1)}%, ${gapPoints} percentage points below the configured target. This is not a final profit forecast.`;
    signals.push({ ...base([job.id, ...(job.costSourceIds ?? [])]), signalKey: `contractor:job-margin:${job.id}`, signalType: "trend", category: "expenses",
      severity: margin <= 0 ? "critical" : approachingBreakEven ? "high" : belowTarget ? gapPoints! >= 10 ? "high" : "medium" : "positive", title, description,
      currentValue: margin, comparisonValue: input.targetGrossMargin, percentage: margin * 100,
      recommendedAction: "Review confirmed assigned costs and billing progress for this job.", ctaLabel: "Review job", ctaRoute: "/user/money",
      evidence: [
        { provider: "jobber", recordType: "job", recordId: job.id, label: job.title || `Job ${job.id}`, state: "confirmed", route: `/user/jobber-records?object_type=jobs&record_id=${encodeURIComponent(job.id)}`, reason: "Job and invoiced value" },
        ...(job.costSourceIds ?? []).map(id => ({ provider: "booksmart" as const, recordType: "transaction", recordId: id, label: `Confirmed assigned cost ${id}`, state: "confirmed" as const, route: "/user/reports", reason: "Confirmed job-cost assignment" })),
      ], calculation: { summary: "Compare explicit invoicing with confirmed costs assigned to this job.", operands: [
        { label: "Invoiced", value: job.invoiced, format: "currency", operation: "add" },
        { label: "Confirmed costs", value: job.trackedCosts, format: "currency", operation: "subtract" },
        { label: "Gross job margin", value: job.invoiced - job.trackedCosts, format: "currency", operation: "compare" },
        ...(job.estimatedCost == null ? [] : [{ label: "Original estimated cost", value: job.estimatedCost, format: "currency" as const, operation: "compare" as const }]),
        { label: "Tracked margin", value: margin * 100, format: "percent", operation: "compare" },
      ] } });
  }
  const overdue = input.invoices.filter(invoice => invoice.balance > 0 && !!invoice.dueDate && new Date(invoice.dueDate).getTime() < now.getTime());
  if (overdue.length) {
    const total = overdue.reduce((sum, invoice) => sum + invoice.balance, 0);
    const providerLabel = overdue.every(invoice => invoice.provider === "quickbooks") ? "QuickBooks" : overdue.every(invoice => invoice.provider !== "quickbooks") ? "Jobber" : "connected";
    signals.push({ ...base(overdue.map(invoice => invoice.id)), signalKey: "contractor:overdue-receivables", signalType: "bookkeeping", category: "cash_flow",
      severity: total >= 10_000 || overdue.length >= 5 ? "high" : "medium", title: `${overdue.length} ${providerLabel} invoice${overdue.length === 1 ? " is" : "s are"} overdue`,
      description: `${total.toLocaleString("en-US", { style: "currency", currency: "USD" })} is explicitly past due in ${providerLabel}. It is not added to accounting revenue.`,
      currentValue: total, recommendedAction: "Review collection status and follow up on the overdue invoices.", ctaLabel: "Review receivables", ctaRoute: providerLabel === "Jobber" ? "/user/jobber-records" : "/user/money" });
    const ageDays = (dueDate: string) => (now.getTime() - new Date(`${dueDate.slice(0, 10)}T23:59:59.999Z`).getTime()) / 86_400_000;
    const aged = overdue.filter(invoice => invoice.dueDate && ageDays(invoice.dueDate) > 30);
    if (aged.length) {
      const bucket = (minimum: number, maximum?: number) => aged.filter(invoice => {
        const days = ageDays(invoice.dueDate!); return days > minimum && (maximum == null || days <= maximum);
      }).reduce((sum, invoice) => sum + invoice.balance, 0);
      const days31To60 = bucket(30, 60); const days61To90 = bucket(60, 90); const over90 = bucket(90);
      const agedTotal = days31To60 + days61To90 + over90;
      signals.push({ ...base(aged.map(invoice => invoice.id)), signalKey: "contractor:receivables-aging", signalType: "bookkeeping", category: "cash_flow",
        severity: over90 > 0 || agedTotal >= 25_000 ? "high" : "medium", title: `${agedTotal.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} is over 30 days past due`,
        description: `31–60 days: ${days31To60.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} · 61–90 days: ${days61To90.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} · Over 90 days: ${over90.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`,
        currentValue: agedTotal, recommendedAction: "Prioritize the oldest balances and document customer follow-up.", ctaLabel: "Review aging", ctaRoute: providerLabel === "Jobber" ? "/user/jobber-records" : "/user/money" });
    }
  }
  const completedJobIds = new Set(input.jobs.filter(job => /completed|closed|finished/i.test(job.status ?? "")).map(job => job.id));
  const invoicedJobIds = new Set(input.invoices.map(invoice => invoice.jobId).filter((jobId): jobId is string => !!jobId));
  const completedUnbilled = input.jobs.filter(job => completedJobIds.has(job.id) && job.value > 0 && job.invoiced <= 0 && !invoicedJobIds.has(job.id));
  if (completedUnbilled.length) {
    const total = completedUnbilled.reduce((sum, job) => sum + job.value, 0);
    signals.push({ ...base(completedUnbilled.flatMap(job => [job.id, ...(job.costSourceIds ?? [])])), signalKey: "contractor:completed-work-unbilled", signalType: "bookkeeping", category: "cash_flow",
      severity: total >= 10_000 || completedUnbilled.length >= 5 ? "high" : "medium",
      title: `${completedUnbilled.length} completed job${completedUnbilled.length === 1 ? " has" : "s have"} not been invoiced`,
      description: `${total.toLocaleString("en-US", { style: "currency", currency: "USD" })} of explicit completed Jobber work has no linked Jobber invoice. This is potential unbilled work, not accounting revenue.`,
      currentValue: total, recommendedAction: "Confirm billing status and create or link invoices for the completed jobs.",
      ctaLabel: "Review completed jobs", ctaRoute: "/user/jobber-records",
      evidence: [
        ...completedUnbilled.map(job => ({ provider: "jobber" as const, recordType: "job", recordId: job.id, label: job.title || `Completed job ${job.id}`, state: "confirmed" as const, route: `/user/jobber-records?object_type=jobs&record_id=${encodeURIComponent(job.id)}`, reason: "Jobber marks this work completed" })),
        ...completedUnbilled.flatMap(job => (job.costSourceIds ?? []).map(id => ({ provider: "booksmart" as const, recordType: "transaction", recordId: id, label: `Confirmed assigned cost ${id}`, state: "confirmed" as const, route: "/user/reports", reason: "Confirmed cost associated with this completed job" }))),
        { provider: "quickbooks", recordType: "invoice", recordId: "missing", label: "Matching accounting invoice", state: "missing", route: "/user/money", reason: "No linked invoice was found" },
      ], calculation: { summary: "Add completed Jobber job values that have no linked invoice and show separately confirmed associated costs.", operands: [
        ...completedUnbilled.map(job => ({ label: job.title || job.id, value: job.value, format: "currency" as const, operation: "add" as const })),
        ...completedUnbilled.filter(job => job.costCount > 0).map(job => ({ label: `${job.title || job.id} associated costs`, value: job.trackedCosts, format: "currency" as const, operation: "compare" as const })),
      ] } });
  }
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
  const invoicedByClient = new Map<string, { total: number; invoiceIds: string[] }>();
  const concentrationProvider = input.invoices.some(row => row.provider === "jobber" && Number(row.total ?? 0) > 0) ? "jobber" : "quickbooks";
  for (const invoice of input.invoices.filter(row => row.provider === concentrationProvider && row.clientId && Number(row.total ?? 0) > 0)) {
    const current = invoicedByClient.get(invoice.clientId!) ?? { total: 0, invoiceIds: [] };
    current.total += Number(invoice.total); current.invoiceIds.push(invoice.id); invoicedByClient.set(invoice.clientId!, current);
  }
  const totalInvoiced = [...invoicedByClient.values()].reduce((sum, row) => sum + row.total, 0);
  const largestInvoiced = [...invoicedByClient.entries()].sort((left, right) => right[1].total - left[1].total)[0];
  if (largestInvoiced && totalInvoiced >= 1_000 && largestInvoiced[1].total / totalInvoiced >= .45) {
    const share = largestInvoiced[1].total / totalInvoiced;
    signals.push({ ...base(largestInvoiced[1].invoiceIds), signalKey: "contractor:customer-concentration", signalType: "trend", category: "revenue",
      severity: share >= .6 ? "high" : "medium", title: `One customer represents ${(share * 100).toFixed(0)}% of tracked invoiced activity`,
      description: `${largestInvoiced[1].total.toLocaleString("en-US", { style: "currency", currency: "USD" })} of ${totalInvoiced.toLocaleString("en-US", { style: "currency", currency: "USD" })} in explicit ${concentrationProvider === "jobber" ? "Jobber" : "QuickBooks"} invoices is tied to one customer. This is concentration evidence, not additional accounting revenue.`,
      currentValue: largestInvoiced[1].total, comparisonValue: totalInvoiced, percentage: share * 100,
      recommendedAction: "Review pipeline diversity and the cash impact of reliance on this customer.", ctaLabel: "Review customers", ctaRoute: "/user/jobber-records",
      evidence: largestInvoiced[1].invoiceIds.map(id => ({ provider: concentrationProvider, recordType: "invoice", recordId: id,
        label: `${concentrationProvider === "jobber" ? "Jobber" : "QuickBooks"} customer invoice`, state: "confirmed" as const,
        route: concentrationProvider === "jobber" ? "/user/jobber-records?object_type=invoices" : "/user/money", reason: "Included in the largest customer's invoiced activity" })),
      calculation: { summary: "Divide the largest customer's invoiced activity by total invoiced activity from one authoritative source.", operands: [
        { label: "Largest customer", value: largestInvoiced[1].total, format: "currency", operation: "compare" },
        { label: "Total invoiced activity", value: totalInvoiced, format: "currency", operation: "compare" },
        { label: "Customer share", value: share * 100, format: "percent", operation: "compare" },
      ] } });
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
