export type MonitoringSignalStatus = "active" | "resolved" | "dismissed" | "expired";
export type MonitoringTaskStatus = "open" | "in_progress" | "waiting" | "completed" | "dismissed";
export type MonitoringTaskPriority = "low" | "medium" | "high" | "critical";
export type MonitoringTaskAssignmentRole = "owner" | "cpa" | "booksmart";

export const FINANCIAL_DATA_CHANGE_EVENTS = [
  "transaction_categorized",
  "bulk_categorization_completed",
  "transactions_approved",
  "transaction_created",
  "transaction_updated",
  "transaction_deleted",
  "document_transactions_approved",
] as const;
export type FinancialDataChangeEvent = typeof FINANCIAL_DATA_CHANGE_EVENTS[number];

export function isFinancialDataChangeEvent(value: unknown): value is FinancialDataChangeEvent {
  return typeof value === "string" && (FINANCIAL_DATA_CHANGE_EVENTS as readonly string[]).includes(value);
}

const SIGNAL_ACTIONS: Record<MonitoringSignalStatus, readonly ("dismiss" | "resolve" | "reopen")[]> = {
  active: ["dismiss", "resolve"],
  resolved: ["reopen"],
  dismissed: ["reopen"],
  expired: ["reopen"],
};

export function canTransitionSignal(status: MonitoringSignalStatus, action: "dismiss" | "resolve" | "reopen") {
  return SIGNAL_ACTIONS[status].includes(action);
}

export function validTaskDueDate(value: unknown) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validTaskPriority(value: unknown): value is MonitoringTaskPriority {
  return ["low", "medium", "high", "critical"].includes(String(value));
}

export function validTaskAssignmentRole(value: unknown): value is MonitoringTaskAssignmentRole {
  return ["owner", "cpa", "booksmart"].includes(String(value));
}

export type MonitoringSummary = {
  revenue: number;
  accountingExpenses: number;
  netIncome: number;
  netCashMovement: number;
  unclassifiedTransactionCount: number;
  healthScore: number;
  comparison?: {
    revenue: number;
    accountingExpenses: number;
    netIncome?: number;
  };
  categorySpending?: Array<{ key: string; label: string; current: number; previous: number; sourceIds: number[] }>;
  largeApprovedTransactions?: Array<{ id: number; title: string; amount: number }>;
  pendingDocumentReview?: { count: number; sourceIds: number[] };
};

export type SignalCandidate = {
  signalKey: string;
  signalType: "trend" | "bookkeeping" | "cash_flow" | "connection";
  category: "revenue" | "expenses" | "bookkeeping" | "cash_flow" | "connections";
  severity: "info" | "positive" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  currentValue: number;
  comparisonValue: number | null;
  percentage: number | null;
  recommendedAction: string;
  ctaLabel: string;
  ctaRoute: string;
  requiresCpaReview: boolean;
  cpaReviewLevel: "none" | "optional" | "recommended" | "urgent";
  sourceIds?: Array<number | string>;
  exclusions?: string[];
  confidence?: number;
  provider?: "jobber" | "contractor_intelligence";
  directUrl?: string | null;
  sourceRecordType?: string;
  calculationVersion?: string;
};

const pctChange = (current: number, previous: number) => previous === 0
  ? null
  : Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;

export function evaluateTrustedSummary(summary: MonitoringSummary): SignalCandidate[] {
  const signals: SignalCandidate[] = [];
  const previous = summary.comparison;
  if (previous) {
    const revenueChange = pctChange(summary.revenue, previous.revenue);
    if (revenueChange !== null && Math.abs(revenueChange) >= 10) {
      const increased = revenueChange > 0;
      signals.push({
        signalKey: "revenue-trend", signalType: "trend", category: "revenue",
        severity: increased ? "positive" : "high",
        title: increased ? "Revenue is trending up" : "Revenue has decreased",
        description: `Recognized revenue is ${Math.abs(revenueChange)}% ${increased ? "above" : "below"} the comparison period.`,
        currentValue: summary.revenue, comparisonValue: previous.revenue, percentage: revenueChange,
        recommendedAction: increased ? "Review the revenue trend and expected cash impact." : "Review the revenue decline and consider CPA guidance.",
        ctaLabel: "View reports", ctaRoute: "/user/reports", requiresCpaReview: !increased,
        cpaReviewLevel: increased ? "optional" : "recommended",
      });
    }
    const expenseChange = pctChange(summary.accountingExpenses, previous.accountingExpenses);
    if (expenseChange !== null && Math.abs(expenseChange) >= 10) {
      const increased = expenseChange > 0;
      signals.push({
        signalKey: "expense-trend", signalType: "trend", category: "expenses", severity: increased ? expenseChange >= 25 ? "high" : "medium" : "positive",
        title: `Expenses ${increased ? "increased" : "decreased"} ${Math.abs(expenseChange)}%`, description: `Recognized accounting expenses ${increased ? "increased" : "decreased"} compared with the prior period.`,
        currentValue: summary.accountingExpenses, comparisonValue: previous.accountingExpenses, percentage: expenseChange,
        recommendedAction: increased ? "Review categories contributing to the increase." : "Review the categories contributing to improved expense control.", ctaLabel: "See why", ctaRoute: "/user/money",
        requiresCpaReview: increased && expenseChange >= 25, cpaReviewLevel: increased && expenseChange >= 25 ? "recommended" : "optional",
      });
    }
    const netIncomeChange = previous.netIncome == null ? null : pctChange(summary.netIncome, previous.netIncome);
    if (netIncomeChange !== null && Math.abs(netIncomeChange) >= 10) {
      const improved = summary.netIncome > previous.netIncome!;
      signals.push({
        signalKey: "net-income-trend", signalType: "trend", category: "revenue", severity: improved ? "positive" : "high",
        title: `Net income ${improved ? "improved" : "declined"}`,
        description: `Net income changed ${Math.abs(netIncomeChange)}% compared with the prior period.`,
        currentValue: summary.netIncome, comparisonValue: previous.netIncome!, percentage: netIncomeChange,
        recommendedAction: improved ? "Review the drivers of improved profitability." : "Review the revenue and expense drivers behind the decline.",
        ctaLabel: "View details", ctaRoute: "/user/money", requiresCpaReview: !improved,
        cpaReviewLevel: improved ? "optional" : "recommended",
      });
    }
  }
  for (const category of summary.categorySpending ?? []) {
    const change = pctChange(category.current, category.previous);
    if (category.current < 500 || change === null || change < 25) continue;
    signals.push({
      signalKey: `category-spike:${category.key}`, signalType: "trend", category: "expenses", severity: change >= 75 ? "high" : "medium",
      title: `${category.label} spending increased ${change}%`,
      description: `${category.label} drove a material increase compared with the prior period.`,
      currentValue: category.current, comparisonValue: category.previous, percentage: change,
      recommendedAction: `Review approved ${category.label.toLowerCase()} transactions.`, ctaLabel: "See why", ctaRoute: "/user/money",
      requiresCpaReview: change >= 75, cpaReviewLevel: change >= 75 ? "recommended" : "optional",
      sourceIds: category.sourceIds, confidence: 1,
    });
  }
  for (const transaction of (summary.largeApprovedTransactions ?? []).slice(0, 3)) {
    signals.push({
      signalKey: `large-transaction:${transaction.id}`, signalType: "bookkeeping", category: "bookkeeping", severity: "medium",
      title: `Unusually large approved transaction: ${transaction.title}`,
      description: `An approved transaction of ${Math.abs(transaction.amount).toLocaleString("en-US", { style: "currency", currency: "USD" })} is materially larger than recent activity.`,
      currentValue: Math.abs(transaction.amount), comparisonValue: null, percentage: null,
      recommendedAction: "Review the transaction and its classification.", ctaLabel: "Review transaction", ctaRoute: "/user/reports",
      requiresCpaReview: Math.abs(transaction.amount) >= 10_000, cpaReviewLevel: Math.abs(transaction.amount) >= 10_000 ? "recommended" : "optional",
      sourceIds: [transaction.id], confidence: 0.95,
    });
  }
  if ((summary.pendingDocumentReview?.count ?? 0) > 0) {
    const pending = summary.pendingDocumentReview!;
    signals.push({
      signalKey: "documents-needing-review", signalType: "bookkeeping", category: "bookkeeping", severity: pending.count >= 10 ? "high" : "medium",
      title: `${pending.count} extracted ${pending.count === 1 ? "document needs" : "documents need"} review`,
      description: "Pending extracted financial records are excluded from financial totals until approved.",
      currentValue: pending.count, comparisonValue: null, percentage: null,
      recommendedAction: "Review and approve or reject the extracted records.", ctaLabel: "Review documents", ctaRoute: "/user/reports",
      requiresCpaReview: false, cpaReviewLevel: "none", sourceIds: pending.sourceIds, confidence: 1,
    });
  }
  if (summary.unclassifiedTransactionCount > 0) {
    signals.push({
      signalKey: "uncategorized-transactions", signalType: "bookkeeping", category: "bookkeeping", severity: summary.unclassifiedTransactionCount >= 20 ? "high" : "medium",
      title: `${summary.unclassifiedTransactionCount} transactions need review`, description: "These transactions are excluded from trusted categorized reporting until reviewed.",
      currentValue: summary.unclassifiedTransactionCount, comparisonValue: null, percentage: null,
      recommendedAction: "Categorize the outstanding transactions.", ctaLabel: "Review", ctaRoute: "/user/reports",
      requiresCpaReview: false, cpaReviewLevel: "none",
    });
  }
  if (summary.netCashMovement < 0) {
    signals.push({
      signalKey: "negative-cash-movement", signalType: "cash_flow", category: "cash_flow", severity: "high",
      title: "Cash movement is negative", description: "Money out exceeded money in during the selected period.",
      currentValue: summary.netCashMovement, comparisonValue: null, percentage: null,
      recommendedAction: "Review cash-flow drivers and upcoming obligations.", ctaLabel: "View cash flow", ctaRoute: "/user/reports",
      requiresCpaReview: true, cpaReviewLevel: "recommended",
    });
  }
  return signals;
}

export type MonitoredConnection = {
  id: string;
  name: string;
  type: "plaid" | "quickbooks" | "uploaded_statement";
  status: "healthy" | "attention" | "disconnected" | "available";
  stale: boolean;
  error: string | null;
};

export function evaluateConnectionHealth(connections: MonitoredConnection[]): SignalCandidate[] {
  return connections.flatMap(connection => {
    if (connection.type === "uploaded_statement" || ["healthy", "available"].includes(connection.status)) return [];
    const disconnected = connection.status === "disconnected";
    const title = disconnected ? `${connection.name} is disconnected` : `${connection.name} needs attention`;
    const reason = connection.error ?? (connection.stale ? "The connection has not refreshed recently." : "The latest connection check requires attention.");
    return [{
      signalKey: `connection:${connection.id}`,
      signalType: "connection" as const,
      category: "connections" as const,
      severity: disconnected ? "critical" as const : "high" as const,
      title,
      description: reason,
      currentValue: 1,
      comparisonValue: null,
      percentage: null,
      recommendedAction: `Review and refresh the ${connection.type === "plaid" ? "bank" : "QuickBooks"} connection.`,
      ctaLabel: "Manage connection",
      ctaRoute: "/user/settings",
      requiresCpaReview: false,
      cpaReviewLevel: "none" as const,
    }];
  });
}

const TASK_TRANSITIONS: Record<MonitoringTaskStatus, readonly MonitoringTaskStatus[]> = {
  open: ["in_progress", "waiting", "completed", "dismissed"],
  in_progress: ["waiting", "completed", "dismissed"],
  waiting: ["in_progress", "completed", "dismissed"],
  completed: ["open"],
  dismissed: ["open"],
};

export function canTransitionTask(from: MonitoringTaskStatus, to: MonitoringTaskStatus) {
  return TASK_TRANSITIONS[from].includes(to);
}

export function taskEventForStatus(status: MonitoringTaskStatus) {
  return ({ open: "reopened", in_progress: "started", waiting: "waiting", completed: "completed", dismissed: "dismissed" } as const)[status];
}

export function taskDueDate(candidate: Pick<SignalCandidate, "signalType" | "severity">, from = new Date()) {
  const days = candidate.signalType === "connection" || candidate.severity === "critical"
    ? 0
    : candidate.signalType === "bookkeeping"
      ? 2
      : candidate.severity === "high"
        ? 7
        : 14;
  const due = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  due.setUTCDate(due.getUTCDate() + days);
  return due.toISOString().slice(0, 10);
}

export function signalCreatesTask(candidate: Pick<SignalCandidate, "signalType" | "severity">) {
  return candidate.signalType === "bookkeeping" || candidate.signalType === "connection" || ["high", "critical"].includes(candidate.severity);
}
