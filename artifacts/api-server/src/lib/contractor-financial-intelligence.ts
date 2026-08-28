export const CONTRACTOR_FINANCIAL_INTELLIGENCE_VERSION = "contractor-financial-intelligence-v1" as const;

export type IntelligenceConfidence = "high" | "medium" | "low" | "unavailable";
export type IntelligenceSource = "booksmart" | "quickbooks" | "plaid" | "jobber" | "receipt" | "gmail";
export type ProvenanceReference = { source: IntelligenceSource; recordType: string; recordId: string };
export type TrustedMetric = { value: number | null; confidence: IntelligenceConfidence; sources: IntelligenceSource[]; missingInputs: string[] };

export type ContractorJobSnapshot = {
  id: string; jobNumber: string | null; title: string | null; status: string | null;
  jobValue: TrustedMetric; amountInvoiced: TrustedMetric; amountCollected: TrustedMetric;
  amountOutstanding: TrustedMetric; trackedCosts: TrustedMetric; currentTrackedProfit: TrustedMetric;
  currentTrackedMargin: TrustedMetric; targetGrossMargin: number | null; targetSource: "organization" | "industry" | null;
  attentionScore: number; attentionStatus: "needs_attention" | "watch" | "healthy" | "insufficient_data"; attentionReasons: string[];
  provenance: ProvenanceReference[];
};

export type ContractorFinancialIntelligence = {
  organizationId: number;
  period: { start: string; end: string };
  calculationVersion: typeof CONTRACTOR_FINANCIAL_INTELLIGENCE_VERSION;
  dataFreshness: Record<string, string | null>;
  dataSources: IntelligenceSource[];
  dataConfidence: IntelligenceConfidence;
  revenue: TrustedMetric; expenses: TrustedMetric; netIncome: TrustedMetric; netCashMovement: TrustedMetric;
  yearToDate: { revenue: TrustedMetric; expenses: TrustedMetric; netIncome: TrustedMetric };
  comparisons: {
    previousPeriod: { revenueChangePercent: TrustedMetric; expenseChangePercent: TrustedMetric; netIncomeChangePercent: TrustedMetric };
    samePeriodLastYear: { revenueChangePercent: TrustedMetric; expenseChangePercent: TrustedMetric; netIncomeChangePercent: TrustedMetric };
  };
  cashPosition: { currentBalance: TrustedMetric; availableBalance: TrustedMetric };
  accountsReceivable: { totalOutstanding: TrustedMetric; overdueAmount: TrustedMetric; overdueInvoiceCount: number;
    averageInvoiceAgeDays: TrustedMetric; overdueInvoices: Array<{ id: string; number: string | null; title: string | null; balance: number; dueDate: string | null }>;
    largestCustomerBalances: Array<{ customerId: string; customerName: string | null; outstanding: number; overdue: number }> };
  jobs: ContractorJobSnapshot[];
  confirmedJobCosts: Array<{ transactionId: string; transactionTitle: string | null; amount: number; confirmedAt: string | null;
    jobberJobId: string; jobNumber: string | null; jobTitle: string | null; receiptApproved: boolean; receiptSourceId: string | null }>;
  expenseCategoryChanges: Array<{ key: string; label: string; current: number; previous: number; changePercent: number | null }>;
  unusualTransactions: Array<{ transactionId: string; title: string | null; amount: number; date: string; reasons: string[]; provenance: ProvenanceReference[] }>;
  unmatchedTransactions: number; unmatchedReceipts: number; bookkeepingIssues: Array<{ type: string; count: number }>;
  signals: unknown[]; cpaReviewItems: unknown[]; missingInputs: string[];
};

type CanonicalSummary = { revenue: number; accountingExpenses: number; netIncome: number; netCashMovement?: number; warnings?: unknown[]; completeness?: { approvedTransactionCount?: number; uncategorizedTransactionCount?: number };
  visuals?: { spendingBreakdown?: Array<{ key: string; label: string; value: number }> } };
type JobberRecord = { external_id: string; related_client_id?: string | null; record_number?: string | null; status?: string | null; title?: string | null; amount?: number | string | null; source_created_at?: string | null; payload?: Record<string, any> | null };
type CostAssignment = { jobber_job_id: string; amount: number | string; confidence: string; source_record_id: string; created_at?: string | null };
type ReceiptTransactionLink = { left_record_id: string; right_record_id: string; status: string };
type TrustedTransactionInput = { id: number | string; amount: number | string; date_time: string; title?: string | null; pending?: boolean | null };

const metric = (value: number | null, confidence: IntelligenceConfidence, sources: IntelligenceSource[], missingInputs: string[] = []): TrustedMetric =>
  ({ value, confidence, sources, missingInputs });
const money = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };

export function buildContractorFinancialIntelligence(input: {
  organizationId: number; start: Date; end: Date; canonical: CanonicalSummary;
  jobberJobs?: JobberRecord[]; jobberInvoices?: JobberRecord[]; jobberPayments?: JobberRecord[]; jobberClients?: JobberRecord[];
  assignments?: CostAssignment[]; signals?: unknown[]; targetGrossMargin?: number | null;
  receiptTransactionLinks?: ReceiptTransactionLink[];
  targetSource?: "organization" | "industry" | null; sourceFreshness?: Record<string, string | null>;
  connectedSources?: IntelligenceSource[]; unmatchedTransactions?: number; unmatchedReceipts?: number;
  previousCanonical?: CanonicalSummary | null;
  yearToDateCanonical?: CanonicalSummary | null; priorYearCanonical?: CanonicalSummary | null;
  cash?: { current: number | null; available: number | null; confidence: IntelligenceConfidence; latestBalanceAt: string | null };
  transactions?: TrustedTransactionInput[];
}): ContractorFinancialIntelligence {
  const sources = Array.from(new Set<IntelligenceSource>(["booksmart", ...(input.connectedSources ?? [])]));
  const canonicalConfidence: IntelligenceConfidence = input.canonical.warnings?.length ? "medium" : "high";
  const invoices = input.jobberInvoices ?? [];
  const payments = input.jobberPayments ?? [];
  const outstandingInvoices = invoices.filter(row => money(row.payload?.amounts?.invoiceBalance ?? row.amount) > 0);
  const overdueInvoices = outstandingInvoices.filter(row => {
    const due = row.payload?.dueDate; return !!due && new Date(due).getTime() < input.end.getTime();
  });
  const clientNames = new Map((input.jobberClients ?? []).map(row => [row.external_id, row.title ?? row.payload?.name ?? null]));
  const balancesByClient = new Map<string, { outstanding: number; overdue: number }>();
  for (const invoice of outstandingInvoices) {
    const clientId = invoice.related_client_id ?? invoice.payload?.client?.id ?? "unknown";
    const current = balancesByClient.get(clientId) ?? { outstanding: 0, overdue: 0 };
    const balance = money(invoice.payload?.amounts?.invoiceBalance ?? invoice.amount);
    current.outstanding += balance;
    if (overdueInvoices.includes(invoice)) current.overdue += balance;
    balancesByClient.set(clientId, current);
  }
  const invoiceAges = outstandingInvoices.map(row => new Date(row.payload?.issuedDate ?? row.source_created_at ?? "").getTime())
    .filter(Number.isFinite).map(timestamp => Math.max(0, Math.floor((input.end.getTime() - timestamp) / 86_400_000)));
  const assignmentsByJob = new Map<string, CostAssignment[]>();
  for (const assignment of input.assignments ?? []) assignmentsByJob.set(assignment.jobber_job_id, [...(assignmentsByJob.get(assignment.jobber_job_id) ?? []), assignment]);
  const jobById = new Map((input.jobberJobs ?? []).map(job => [job.external_id, job]));
  const transactionById = new Map((input.transactions ?? []).map(transaction => [String(transaction.id), transaction]));
  const receiptByTransactionId = new Map((input.receiptTransactionLinks ?? []).filter(link => link.status === "confirmed")
    .map(link => [String(link.right_record_id), String(link.left_record_id)]));
  const confirmedJobCosts = (input.assignments ?? []).filter(row => row.confidence === "confirmed").map(row => {
    const transaction = transactionById.get(String(row.source_record_id));
    const job = jobById.get(row.jobber_job_id);
    return { transactionId: String(row.source_record_id), transactionTitle: transaction?.title ?? null,
      amount: money(row.amount), confirmedAt: row.created_at ?? null, jobberJobId: row.jobber_job_id,
      jobNumber: job?.record_number ?? null, jobTitle: job?.title ?? null,
      receiptApproved: receiptByTransactionId.has(String(row.source_record_id)),
      receiptSourceId: receiptByTransactionId.get(String(row.source_record_id)) ?? null };
  }).sort((left, right) => String(right.confirmedAt ?? "").localeCompare(String(left.confirmedAt ?? "")));

  const jobs = (input.jobberJobs ?? []).map<ContractorJobSnapshot>(job => {
    const payload = job.payload ?? {};
    const jobValue = money(job.amount ?? payload.total);
    const invoiced = money(payload.invoicedTotal);
    const jobInvoices = invoices.filter(row => row.payload?.job?.id === job.external_id || row.payload?.jobId === job.external_id);
    const outstanding = jobInvoices.reduce((sum, row) => sum + money(row.payload?.amounts?.invoiceBalance ?? row.amount), 0);
    const paidFromInvoices = jobInvoices.reduce((sum, row) => sum + Math.max(0, money(row.payload?.amounts?.total ?? row.amount) - money(row.payload?.amounts?.invoiceBalance)), 0);
    const paid = paidFromInvoices || payments.filter(row => row.payload?.job?.id === job.external_id || row.payload?.jobId === job.external_id).reduce((sum, row) => sum + money(row.amount), 0);
    const jobAssignments = assignmentsByJob.get(job.external_id) ?? [];
    const trackedCosts = jobAssignments.reduce((sum, row) => sum + money(row.amount), 0);
    const recognizedForMargin = invoiced || paid;
    const marginAvailable = recognizedForMargin > 0 && jobAssignments.length > 0;
    const profit = marginAvailable ? recognizedForMargin - trackedCosts : null;
    const attentionReasons: string[] = [];
    let attentionScore = 0;
    if (marginAvailable && input.targetGrossMargin != null && profit! / recognizedForMargin < input.targetGrossMargin) { attentionScore += 60; attentionReasons.push("tracked_margin_below_target"); }
    if (outstanding > 0) { attentionScore += 25; attentionReasons.push("outstanding_balance"); }
    if (!jobAssignments.length) { attentionScore += 10; attentionReasons.push("tracked_costs_unavailable"); }
    const attentionStatus = !marginAvailable && outstanding <= 0 ? "insufficient_data" as const : attentionScore >= 60 ? "needs_attention" as const : attentionScore >= 25 ? "watch" as const : "healthy" as const;
    return {
      id: job.external_id, jobNumber: job.record_number ?? null, title: job.title ?? null, status: job.status ?? null,
      jobValue: metric(jobValue, "high", ["jobber"]), amountInvoiced: metric(invoiced, "high", ["jobber"]),
      amountCollected: metric(paid, jobInvoices.length || payments.length ? "high" : "unavailable", ["jobber"], paid || jobInvoices.length ? [] : ["jobber_payment_or_invoice_link"]),
      amountOutstanding: metric(outstanding, jobInvoices.length ? "high" : "unavailable", ["jobber"], jobInvoices.length ? [] : ["jobber_invoice_link"]),
      trackedCosts: metric(jobAssignments.length ? trackedCosts : null, jobAssignments.length ? "high" : "unavailable", ["booksmart"], jobAssignments.length ? [] : ["assigned_job_costs"]),
      currentTrackedProfit: metric(profit, marginAvailable ? "high" : "unavailable", ["booksmart", "jobber"], marginAvailable ? [] : ["invoiced_or_collected_amount", "assigned_job_costs"]),
      currentTrackedMargin: metric(marginAvailable ? profit! / recognizedForMargin : null, marginAvailable ? "high" : "unavailable", ["booksmart", "jobber"], marginAvailable ? [] : ["invoiced_or_collected_amount", "assigned_job_costs"]),
      targetGrossMargin: input.targetGrossMargin ?? null, targetSource: input.targetSource ?? null,
      attentionScore, attentionStatus, attentionReasons,
      provenance: [{ source: "jobber", recordType: "job", recordId: job.external_id }, ...jobAssignments.map(row => ({ source: "booksmart" as const, recordType: "job_cost_assignment", recordId: row.source_record_id }))],
    };
  });
  const missingInputs = [!sources.includes("jobber") && "jobber", !sources.includes("plaid") && "plaid_balance", !sources.includes("quickbooks") && "quickbooks"].filter(Boolean) as string[];
  const percentChange = (current: number, previous: number | undefined, name: string) => previous == null || previous === 0
    ? metric(null, "unavailable", ["booksmart"], [`previous_${name}`])
    : metric((current - previous) / Math.abs(previous), canonicalConfidence, ["booksmart"]);
  const cash = input.cash;
  const previousBreakdown = new Map((input.previousCanonical?.visuals?.spendingBreakdown ?? []).map(row => [row.key, row]));
  const expenseCategoryChanges = (input.canonical.visuals?.spendingBreakdown ?? []).map(row => {
    const previous = previousBreakdown.get(row.key)?.value ?? 0;
    return { key: row.key, label: row.label, current: row.value, previous, changePercent: previous === 0 ? null : (row.value - previous) / Math.abs(previous) };
  }).sort((left, right) => right.current - left.current);
  const expenses = (input.transactions ?? []).filter(row => row.pending !== true && Number(row.amount) < 0);
  const sortedAmounts = expenses.map(row => Math.abs(Number(row.amount))).filter(Number.isFinite).sort((a, b) => a - b);
  const baselineAmounts = sortedAmounts.length >= 2 ? sortedAmounts.slice(0, -1) : sortedAmounts;
  const median = baselineAmounts.length ? baselineAmounts[Math.floor(baselineAmounts.length / 2)] : 0;
  const unusualThreshold = Math.max(1000, median * 3);
  const unusualTransactions = expenses.filter(row => Math.abs(Number(row.amount)) >= unusualThreshold).map(row => ({
    transactionId: String(row.id), title: row.title ?? null, amount: Math.abs(Number(row.amount)), date: row.date_time,
    reasons: [Math.abs(Number(row.amount)) >= 1000 ? "large_approved_expense" : "", median > 0 && Math.abs(Number(row.amount)) >= median * 3 ? "at_least_three_times_median" : ""].filter(Boolean),
    provenance: [{ source: "booksmart" as const, recordType: "transaction", recordId: String(row.id) }],
  })).sort((left, right) => right.amount - left.amount).slice(0, 10);
  return {
    organizationId: input.organizationId, period: { start: input.start.toISOString(), end: input.end.toISOString() },
    calculationVersion: CONTRACTOR_FINANCIAL_INTELLIGENCE_VERSION, dataFreshness: input.sourceFreshness ?? {}, dataSources: sources,
    dataConfidence: canonicalConfidence, revenue: metric(input.canonical.revenue, canonicalConfidence, ["booksmart"]),
    expenses: metric(input.canonical.accountingExpenses, canonicalConfidence, ["booksmart"]), netIncome: metric(input.canonical.netIncome, canonicalConfidence, ["booksmart"]),
    netCashMovement: input.canonical.netCashMovement == null ? metric(null, "unavailable", [], ["canonical_cash_flow"]) : metric(input.canonical.netCashMovement, canonicalConfidence, ["booksmart"]),
    comparisons: { previousPeriod: {
      revenueChangePercent: percentChange(input.canonical.revenue, input.previousCanonical?.revenue, "period_revenue"),
      expenseChangePercent: percentChange(input.canonical.accountingExpenses, input.previousCanonical?.accountingExpenses, "period_expenses"),
      netIncomeChangePercent: percentChange(input.canonical.netIncome, input.previousCanonical?.netIncome, "period_net_income"),
    }, samePeriodLastYear: {
      revenueChangePercent: percentChange(input.canonical.revenue, input.priorYearCanonical?.revenue, "year_revenue"),
      expenseChangePercent: percentChange(input.canonical.accountingExpenses, input.priorYearCanonical?.accountingExpenses, "year_expenses"),
      netIncomeChangePercent: percentChange(input.canonical.netIncome, input.priorYearCanonical?.netIncome, "year_net_income"),
    } },
    yearToDate: {
      revenue: input.yearToDateCanonical ? metric(input.yearToDateCanonical.revenue, canonicalConfidence, ["booksmart"]) : metric(null, "unavailable", [], ["year_to_date_period"]),
      expenses: input.yearToDateCanonical ? metric(input.yearToDateCanonical.accountingExpenses, canonicalConfidence, ["booksmart"]) : metric(null, "unavailable", [], ["year_to_date_period"]),
      netIncome: input.yearToDateCanonical ? metric(input.yearToDateCanonical.netIncome, canonicalConfidence, ["booksmart"]) : metric(null, "unavailable", [], ["year_to_date_period"]),
    },
    cashPosition: {
      currentBalance: metric(cash?.current ?? null, cash?.current == null ? "unavailable" : cash.confidence, cash?.current == null ? [] : ["plaid"], cash?.current == null ? ["fresh_supported_balance"] : []),
      availableBalance: metric(cash?.available ?? null, cash?.available == null ? "unavailable" : cash.confidence, cash?.available == null ? [] : ["plaid"], cash?.available == null ? ["fresh_supported_available_balance"] : []),
    },
    accountsReceivable: {
      totalOutstanding: metric(sources.includes("jobber") ? outstandingInvoices.reduce((sum, row) => sum + money(row.payload?.amounts?.invoiceBalance ?? row.amount), 0) : null, sources.includes("jobber") ? "high" : "unavailable", sources.includes("jobber") ? ["jobber"] : [], sources.includes("jobber") ? [] : ["jobber_or_quickbooks_invoices"]),
      overdueAmount: metric(sources.includes("jobber") ? overdueInvoices.reduce((sum, row) => sum + money(row.payload?.amounts?.invoiceBalance ?? row.amount), 0) : null, sources.includes("jobber") ? "high" : "unavailable", sources.includes("jobber") ? ["jobber"] : [], sources.includes("jobber") ? [] : ["jobber_or_quickbooks_invoices"]),
      overdueInvoiceCount: overdueInvoices.length,
      overdueInvoices: overdueInvoices.map(row => ({ id: row.external_id, number: row.record_number ?? null, title: row.title ?? null,
        balance: money(row.payload?.amounts?.invoiceBalance ?? row.amount), dueDate: row.payload?.dueDate ?? null })),
      averageInvoiceAgeDays: invoiceAges.length ? metric(invoiceAges.reduce((sum, value) => sum + value, 0) / invoiceAges.length, "high", ["jobber"]) : metric(null, "unavailable", [], ["outstanding_invoice_dates"]),
      largestCustomerBalances: [...balancesByClient.entries()].map(([customerId, values]) => ({ customerId, customerName: clientNames.get(customerId) ?? null, ...values }))
        .sort((left, right) => right.outstanding - left.outstanding).slice(0, 5),
    }, jobs: jobs.sort((left, right) => right.attentionScore - left.attentionScore), confirmedJobCosts, expenseCategoryChanges, unusualTransactions,
    unmatchedTransactions: input.unmatchedTransactions ?? 0, unmatchedReceipts: input.unmatchedReceipts ?? 0,
    bookkeepingIssues: [{ type: "uncategorized_transactions", count: input.canonical.completeness?.uncategorizedTransactionCount ?? 0 },
      { type: "unmatched_transactions", count: input.unmatchedTransactions ?? 0 }, { type: "unmatched_receipts", count: input.unmatchedReceipts ?? 0 }].filter(issue => issue.count > 0),
    signals: input.signals ?? [], cpaReviewItems: (input.signals ?? []).filter((row: any) => row?.requires_cpa_review === true), missingInputs,
  };
}
