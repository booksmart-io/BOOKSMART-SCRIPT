import type { FinancialReportResult } from "./financial-engine";

export type FinancialSummarySource = "transactions" | "uploaded_statement";

export type FinancialSummaryInput = {
  report: FinancialReportResult;
  source?: FinancialSummarySource;
  revenue?: number;
  accountingExpenses?: number;
  netIncome?: number;
  moneyIn?: number;
  moneyOut?: number;
  netCashMovement?: number;
  deductibleAmount?: number;
};

export type HealthScoreFactor = {
  key: "base" | "profitability" | "revenue_scale" | "margin" | "deduction_readiness";
  label: string;
  points: number;
  maximumPoints: number;
  explanation: string;
};

export type BusinessHealthScore = {
  score: number;
  status: "Excellent" | "Good" | "Fair" | "Poor" | "Critical";
  methodologyVersion: "financial-health-v1";
  calculatedAt: string;
  factors: HealthScoreFactor[];
  positiveFactors: HealthScoreFactor[];
  negativeFactors: HealthScoreFactor[];
  missingInputs: string[];
  highestPriorityActions: string[];
};

export type FinancialSummary = {
  period: { start: Date; end: Date };
  source: FinancialSummarySource;
  revenue: number;
  accountingExpenses: number;
  netIncome: number;
  moneyIn: number;
  moneyOut: number;
  netCashMovement: number;
  profitMarginPct: number | null;
  deductibleAmount: number;
  deductibleExpensePct: number;
  transactionCount: number;
  unclassifiedTransactionCount: number;
  health: BusinessHealthScore;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function calculateBusinessHealthScore(input: {
  revenue: number;
  netIncome: number;
  accountingExpenses: number;
  deductibleAmount: number;
  transactionCount?: number;
  unclassifiedTransactionCount?: number;
}): BusinessHealthScore {
  const margin = input.revenue > 0 ? (input.netIncome / input.revenue) * 100 : 0;
  const deductiblePct = input.accountingExpenses > 0
    ? clamp(Math.round((input.deductibleAmount / input.accountingExpenses) * 100), 0, 100)
    : 0;
  const factors: HealthScoreFactor[] = [
    { key: "base", label: "Established baseline", points: 15, maximumPoints: 15, explanation: "Every evaluated business starts with a 15-point baseline." },
    { key: "profitability", label: "Positive net income", points: input.netIncome > 0 ? 25 : 0, maximumPoints: 25, explanation: input.netIncome > 0 ? "Revenue exceeded recognized accounting expenses." : "Recognized accounting expenses were not covered by revenue." },
    { key: "revenue_scale", label: "Revenue activity", points: Math.min(25, (Math.max(0, input.revenue) / 1000) * 2), maximumPoints: 25, explanation: "Up to 25 points based on recognized revenue in the selected period." },
    { key: "margin", label: "Net profit margin", points: margin > 20 ? 20 : margin > 5 ? 10 : 0, maximumPoints: 20, explanation: `Net profit margin is ${Math.round(margin * 10) / 10}%.` },
    { key: "deduction_readiness", label: "Deduction readiness", points: deductiblePct > 50 ? 15 : deductiblePct > 20 ? 8 : 0, maximumPoints: 15, explanation: `${deductiblePct}% of recognized expenses are currently identified as deductible.` },
  ];
  const score = clamp(Math.round(factors.reduce((sum, factor) => sum + factor.points, 0)), 0, 100);
  const positiveFactors = factors.filter((factor) => factor.points > 0);
  const negativeFactors = factors.filter((factor) => factor.points < factor.maximumPoints);
  const missingInputs: string[] = [];
  if ((input.transactionCount ?? 0) === 0) missingInputs.push("approved_transactions");
  if (input.accountingExpenses > 0 && input.deductibleAmount === 0) missingInputs.push("deduction_classification");
  const highestPriorityActions: string[] = [];
  if (input.netIncome <= 0) highestPriorityActions.push("Review the expenses driving negative net income.");
  if ((input.unclassifiedTransactionCount ?? 0) > 0) highestPriorityActions.push(`Classify ${input.unclassifiedTransactionCount} uncategorized transaction${input.unclassifiedTransactionCount === 1 ? "" : "s"}.`);
  if (input.revenue <= 0) highestPriorityActions.push("Confirm revenue transactions are connected and classified.");
  if (input.accountingExpenses > 0 && input.deductibleAmount === 0) highestPriorityActions.push("Review expense deduction classifications.");
  return {
    score,
    status: score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : score >= 20 ? "Poor" : "Critical",
    methodologyVersion: "financial-health-v1",
    calculatedAt: new Date().toISOString(),
    factors,
    positiveFactors,
    negativeFactors,
    missingInputs,
    highestPriorityActions: highestPriorityActions.slice(0, 3),
  };
}

export function calculateBusinessHealthFromActivity(transactions: Array<{ amount: number; deductible?: boolean | null }>): BusinessHealthScore | null {
  const valid = transactions.filter(transaction => Number.isFinite(Number(transaction.amount)));
  if (valid.length === 0) return null;
  const revenue = valid.filter(transaction => Number(transaction.amount) > 0).reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const accountingExpenses = valid.filter(transaction => Number(transaction.amount) < 0).reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0);
  const deductibleAmount = valid.filter(transaction => Number(transaction.amount) < 0 && transaction.deductible === true)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0);
  return calculateBusinessHealthScore({ revenue, accountingExpenses, netIncome: revenue - accountingExpenses, deductibleAmount, transactionCount: valid.length });
}

export function createFinancialSummary(input: FinancialSummaryInput): FinancialSummary {
  const report = input.report;
  const transactionExpenses = report.pnl.cogs + report.pnl.operatingExpenses + report.pnl.otherExpenses + report.pnl.incomeTaxExpense;
  const revenue = roundMoney(input.revenue ?? report.pnl.netRevenue);
  const accountingExpenses = roundMoney(input.accountingExpenses ?? transactionExpenses);
  const netIncome = roundMoney(input.netIncome ?? report.pnl.netIncome);
  const classified = report.classifiedTransactions.filter((transaction) => !transaction.isTransfer);
  const moneyIn = roundMoney(input.moneyIn ?? classified.filter((transaction) => transaction.amount > 0).reduce((sum, transaction) => sum + transaction.amount, 0));
  const moneyOut = roundMoney(input.moneyOut ?? classified.filter((transaction) => transaction.amount < 0).reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0));
  const netCashMovement = roundMoney(input.netCashMovement ?? report.cashFlow.netChangeInCash);
  const deductibleAmount = roundMoney(Math.max(0, input.deductibleAmount ?? 0));
  const deductibleExpensePct = accountingExpenses > 0 ? clamp(Math.round((deductibleAmount / accountingExpenses) * 100), 0, 100) : 0;
  return {
    period: { start: report.start, end: report.end }, source: input.source ?? "transactions",
    revenue, accountingExpenses, netIncome, moneyIn, moneyOut, netCashMovement,
    profitMarginPct: revenue > 0 ? (netIncome / revenue) * 100 : null,
    deductibleAmount, deductibleExpensePct,
    transactionCount: report.classifiedTransactions.length,
    unclassifiedTransactionCount: report.unclassifiedTransactionIds.length,
    health: calculateBusinessHealthScore({
      revenue, netIncome, accountingExpenses, deductibleAmount,
      transactionCount: report.classifiedTransactions.length,
      unclassifiedTransactionCount: report.unclassifiedTransactionIds.length,
    }),
  };
}
