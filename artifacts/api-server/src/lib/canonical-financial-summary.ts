import {
  calculateFinancialReport,
  type FinancialCategory,
  type FinancialSubCategory,
  type FinancialTransaction,
} from "../../../booksmart/src/lib/financial-engine";
import {
  normalizeStatementDoc,
  resolveFinancialStatements,
  type StatementPeriod,
} from "../../../booksmart/src/lib/financial-statements";
import { createFinancialSummary, type BusinessHealthScore, type FinancialSummarySource } from "../../../booksmart/src/lib/financial-summary";
import { trustedTransactions } from "../../../booksmart/src/lib/trusted-transactions";
import { summarizeDeductions, type DeductionRule, type DeductionRuleGroup, type OrgRow } from "../../../booksmart/src/lib/deduction-calculation";
import { normalizeStateId } from "../../../booksmart/src/lib/state-id";

export const CANONICAL_FINANCIAL_SUMMARY_VERSION = "financial-summary-v2" as const;
export type CanonicalFinancialSummaryVersion = typeof CANONICAL_FINANCIAL_SUMMARY_VERSION;
export type CanonicalStatementSource = "transactions" | "uploaded";
export type CanonicalPeriodSemantics = "inclusive_custom_range";
export type CanonicalFinancialWarning = "uncategorized_transactions_excluded" | "pending_statements_excluded" | "mixed_financial_sources";

export type CanonicalFinancialVisuals = {
  cashFlowBars: {
    mode: "daily" | "statement_sections";
    points: Array<{ key: string; label: string; value: number; moneyIn?: number; moneyOut?: number }>;
  };
  spendingBreakdown: Array<{ key: "cost_of_sales" | "operating" | "other" | "taxes"; label: string; value: number }>;
};

export type CanonicalFinancialSummary = {
  organizationId: number;
  period: { start: string; end: string; semantics: CanonicalPeriodSemantics };
  calculationVersion: CanonicalFinancialSummaryVersion;
  source: FinancialSummarySource;
  sources: { pnl: CanonicalStatementSource; balanceSheet: CanonicalStatementSource; cashFlow: CanonicalStatementSource };
  revenue: number;
  accountingExpenses: number;
  netIncome: number;
  moneyIn: number;
  moneyOut: number;
  netCashMovement: number;
  profitMarginPct: number | null;
  deductibleAmount: number;
  health: BusinessHealthScore;
  visuals: CanonicalFinancialVisuals;
  completeness: {
    approvedTransactionCount: number;
    uncategorizedTransactionCount: number;
    confirmedStatementCount: number;
    pendingStatementCount: number;
    complete: boolean;
  };
  warnings: CanonicalFinancialWarning[];
};

export type CanonicalStatementDocument = {
  id: number;
  name: string;
  category: string | null;
  tax_year?: string | null;
  parsed_data: Record<string, unknown> | null;
};

export type CanonicalFinancialSummaryInput = {
  organizationId: number;
  start: Date;
  end: Date;
  transactions: FinancialTransaction[];
  categories: FinancialCategory[];
  subCategories: FinancialSubCategory[];
  documents?: CanonicalStatementDocument[];
  organization?: OrgRow | null;
  deductionRuleGroups?: DeductionRuleGroup[];
  deductionRules?: DeductionRule[];
};

function transactionFallback(report: ReturnType<typeof calculateFinancialReport>) {
  const accountingExpenses = report.pnl.cogs + report.pnl.operatingExpenses + report.pnl.otherExpenses + report.pnl.incomeTaxExpense;
  return {
    pnl: {
      totalRevenue: report.pnl.netRevenue,
      totalCogs: report.pnl.cogs,
      totalGrossProfit: report.pnl.grossProfit,
      totalOpex: report.pnl.operatingExpenses,
      totalExpenses: accountingExpenses,
      netIncome: report.pnl.netIncome,
      count: report.classifiedTransactions.length,
    },
    bs: {
      currentAssets: report.balanceSheet.currentAssets,
      nonCurrentAssets: report.balanceSheet.netFixedAssets + report.balanceSheet.otherAssets,
      totalAssets: report.balanceSheet.totalAssets,
      currentLiabilities: report.balanceSheet.currentLiabilities,
      longTermLiabilities: report.balanceSheet.longTermLiabilities,
      totalLiabilities: report.balanceSheet.totalLiabilities,
      equity: report.balanceSheet.totalEquity,
    },
    cf: {
      operating: report.cashFlow.operatingCashFlow,
      investing: report.cashFlow.investingCashFlow,
      financing: report.cashFlow.financingCashFlow,
      netChange: report.cashFlow.netChangeInCash,
      count: report.classifiedTransactions.length,
    },
  };
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function buildCashFlowBars(
  classified: ReturnType<typeof calculateFinancialReport>["classifiedTransactions"],
  source: CanonicalStatementSource,
  resolvedCashFlow: { operating: number; investing: number; financing: number },
): CanonicalFinancialVisuals["cashFlowBars"] {
  if (source === "uploaded") {
    return {
      mode: "statement_sections",
      points: [
        { key: "operating", label: "Operating", value: resolvedCashFlow.operating },
        { key: "investing", label: "Investing", value: resolvedCashFlow.investing },
        { key: "financing", label: "Financing", value: resolvedCashFlow.financing },
      ],
    };
  }
  const daily = new Map<string, { moneyIn: number; moneyOut: number }>();
  for (const transaction of classified) {
    if (transaction.isTransfer) continue;
    const timestamp = new Date(transaction.date_time);
    if (Number.isNaN(timestamp.getTime())) continue;
    const key = timestamp.toISOString().slice(0, 10);
    const totals = daily.get(key) ?? { moneyIn: 0, moneyOut: 0 };
    if (transaction.amount > 0) totals.moneyIn += transaction.amount;
    else if (transaction.amount < 0) totals.moneyOut += Math.abs(transaction.amount);
    daily.set(key, totals);
  }
  return {
    mode: "daily",
    points: [...daily.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, totals]) => ({
      key,
      label: new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      value: roundMoney(totals.moneyIn - totals.moneyOut),
      moneyIn: roundMoney(totals.moneyIn),
      moneyOut: roundMoney(totals.moneyOut),
    })),
  };
}

function buildSpendingBreakdown(pnl: { totalCogs: number; totalOpex: number; totalExpenses: number }): CanonicalFinancialVisuals["spendingBreakdown"] {
  const otherAndTaxes = Math.max(0, pnl.totalExpenses - pnl.totalCogs - pnl.totalOpex);
  return [
    { key: "cost_of_sales", label: "Cost of sales", value: roundMoney(Math.max(0, pnl.totalCogs)) },
    { key: "operating", label: "Operating", value: roundMoney(Math.max(0, pnl.totalOpex)) },
    { key: "other", label: "Other & taxes", value: roundMoney(otherAndTaxes) },
  ].filter(item => item.value > 0) as CanonicalFinancialVisuals["spendingBreakdown"];
}

export function buildCanonicalFinancialSummary(input: CanonicalFinancialSummaryInput): CanonicalFinancialSummary {
  const transactions = trustedTransactions("transactions", input.transactions);
  const report = calculateFinancialReport({
    transactions,
    categories: input.categories,
    subCategories: input.subCategories,
    start: input.start,
    end: input.end,
  });
  const statementPeriods: StatementPeriod[] = (input.documents ?? [])
    .flatMap(normalizeStatementDoc)
    .filter(period => period.organizationId === input.organizationId);
  const resolved = resolveFinancialStatements(statementPeriods, input.start, input.end, transactionFallback(report));
  const classified = report.classifiedTransactions.filter(transaction => !transaction.isTransfer);
  const transactionMoneyIn = classified.filter(transaction => transaction.amount > 0).reduce((sum, transaction) => sum + transaction.amount, 0);
  const transactionMoneyOut = classified.filter(transaction => transaction.amount < 0).reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const moneyIn = resolved.sources.cashFlow === "uploaded"
    ? Math.max(0, resolved.cashFlow.operating) + Math.max(0, resolved.cashFlow.investing) + Math.max(0, resolved.cashFlow.financing)
    : transactionMoneyIn;
  const moneyOut = resolved.sources.cashFlow === "uploaded"
    ? Math.max(0, -resolved.cashFlow.operating) + Math.max(0, -resolved.cashFlow.investing) + Math.max(0, -resolved.cashFlow.financing)
    : transactionMoneyOut;
  const deductibleAmount = summarizeDeductions(
    classified.filter(transaction => transaction.deductible === true),
    normalizeStateId(input.organization?.state), input.organization ?? null,
    input.deductionRuleGroups ?? [], input.deductionRules ?? [], input.end,
  ).totalFederal;
  const source = resolved.sources.pnl === "uploaded" || resolved.sources.cashFlow === "uploaded"
    ? "uploaded_statement" as const
    : "transactions" as const;
  const summary = createFinancialSummary({
    report,
    source,
    revenue: resolved.pnl.totalRevenue,
    accountingExpenses: resolved.pnl.totalExpenses,
    netIncome: resolved.pnl.netIncome,
    moneyIn,
    moneyOut,
    netCashMovement: resolved.cashFlow.netChange,
    deductibleAmount,
  });
  const pendingStatements = (input.documents ?? []).filter(document => {
    const workflow = document.parsed_data?.statement_workflow;
    return workflow && typeof workflow === "object" && ["uploaded", "extracting", "needs_review"].includes(String((workflow as Record<string, unknown>).lifecycle_status));
  }).length;
  const warnings: CanonicalFinancialWarning[] = [];
  if (summary.unclassifiedTransactionCount > 0) warnings.push("uncategorized_transactions_excluded");
  if (pendingStatements > 0) warnings.push("pending_statements_excluded");
  if (resolved.sources.pnl !== resolved.sources.cashFlow) warnings.push("mixed_financial_sources");
  return {
    organizationId: input.organizationId,
    period: { start: input.start.toISOString(), end: input.end.toISOString(), semantics: "inclusive_custom_range" as const },
    calculationVersion: CANONICAL_FINANCIAL_SUMMARY_VERSION,
    source,
    sources: resolved.sources,
    revenue: summary.revenue,
    accountingExpenses: summary.accountingExpenses,
    netIncome: summary.netIncome,
    moneyIn: summary.moneyIn,
    moneyOut: summary.moneyOut,
    netCashMovement: summary.netCashMovement,
    profitMarginPct: summary.profitMarginPct,
    deductibleAmount: summary.deductibleAmount,
    health: summary.health,
    visuals: {
      cashFlowBars: buildCashFlowBars(classified, resolved.sources.cashFlow, resolved.cashFlow),
      spendingBreakdown: buildSpendingBreakdown(resolved.pnl),
    },
    completeness: {
      approvedTransactionCount: summary.transactionCount,
      uncategorizedTransactionCount: summary.unclassifiedTransactionCount,
      confirmedStatementCount: statementPeriods.length,
      pendingStatementCount: pendingStatements,
      complete: warnings.length === 0,
    },
    warnings,
  };
}

export function buildCanonicalHomeSummaryPair(input: Omit<CanonicalFinancialSummaryInput, "start" | "end"> & {
  currentStart: Date; currentEnd: Date; previousStart: Date; previousEnd: Date;
}) {
  const forPeriod = (start: Date, end: Date) => buildCanonicalFinancialSummary({
    ...input,
    start,
    end,
    transactions: input.transactions.filter(transaction => {
      const timestamp = new Date(transaction.date_time).getTime();
      return Number.isFinite(timestamp) && timestamp >= start.getTime() && timestamp <= end.getTime();
    }),
  });
  return {
    current: forPeriod(input.currentStart, input.currentEnd),
    previous: forPeriod(input.previousStart, input.previousEnd),
  };
}

export function parseFinancialSummaryPeriod(startValue: unknown, endValue: unknown) {
  const startText = typeof startValue === "string" ? startValue : "";
  const endText = typeof endValue === "string" ? endValue : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startText) || !/^\d{4}-\d{2}-\d{2}$/.test(endText)) return null;
  const start = new Date(`${startText}T00:00:00.000Z`);
  const end = new Date(`${endText}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const maximumEnd = new Date(start); maximumEnd.setUTCFullYear(maximumEnd.getUTCFullYear() + 10);
  if (end > maximumEnd) return null;
  return { start, end };
}

export function parseFinancialSummaryInstantPeriod(startValue: unknown, endValue: unknown) {
  if (typeof startValue !== "string" || typeof endValue !== "string") return null;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const maximumEnd = new Date(start); maximumEnd.setUTCFullYear(maximumEnd.getUTCFullYear() + 10);
  if (end > maximumEnd) return null;
  return { start, end };
}
