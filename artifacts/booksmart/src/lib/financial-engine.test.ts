import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFinancialReport,
  chartBucket,
  chartGranularity,
  compareValues,
  dynamicAxisBounds,
  type FinancialTransaction,
} from "./financial-engine";

const start = new Date("2025-01-01T00:00:00.000Z");
const end = new Date("2025-12-31T23:59:59.999Z");
let nextId = 1;

function tx(
  amount: number,
  title: string,
  date = "2025-06-01T12:00:00.000Z",
): FinancialTransaction {
  return { id: nextId++, amount, title, date_time: date };
}

function report(transactions: FinancialTransaction[]) {
  return calculateFinancialReport({ transactions, start, end });
}

test("Revenue, COGS, and OPEX use the correct P&L formulas", () => {
  const result = report([
    tx(1_000, "[Revenue] Sales"),
    tx(-100, "[Revenue] Customer refund"),
    tx(-300, "[COGS] Materials"),
    tx(-200, "[OPEX] Rent"),
    tx(50, "[OPEX] Expense refund"),
  ]);
  assert.equal(result.pnl.netRevenue, 900);
  assert.equal(result.pnl.grossProfit, 600);
  assert.equal(result.pnl.operatingExpenses, 150);
  assert.equal(result.pnl.operatingIncome, 450);
  assert.equal(result.pnl.netIncome, 450);
});

test("internal bank transfers do not affect statements", () => {
  const result = report([
    tx(-500, "Transfer to savings"),
    tx(500, "Transfer from checking"),
  ]);
  assert.equal(result.pnl.netIncome, 0);
  assert.equal(result.cashFlow.netChangeInCash, 0);
  assert.equal(result.balanceSheet.cash, 0);
});

test("credit-card purchase is an expense and payment is excluded", () => {
  const result = report([
    tx(-120, "[OPEX] Credit card purchase [Liability:Credit Card] accrued"),
    tx(-120, "Credit card payment"),
  ]);
  assert.equal(result.pnl.operatingExpenses, 120);
  assert.equal(result.balanceSheet.creditCards, 120);
  assert.equal(result.balanceSheet.cash, 0);
});

test("equipment purchase is investing cash flow and a fixed asset", () => {
  const result = report([
    tx(-2_000, "[Asset:Fixed] [CF:Investing] Equipment purchase"),
  ]);
  assert.equal(result.balanceSheet.grossFixedAssets, 2_000);
  assert.equal(result.cashFlow.capitalExpenditures, 2_000);
  assert.equal(result.cashFlow.investingCashFlow, -2_000);
});

test("loan proceeds and principal repayment are financing activity", () => {
  const result = report([
    tx(10_000, "[Liability:Long-Term] [CF:Financing] Loan proceeds"),
    tx(-2_000, "[Liability:Long-Term] [CF:Financing] Principal repayment"),
  ]);
  assert.equal(result.balanceSheet.longTermLiabilities, 8_000);
  assert.equal(result.cashFlow.loanProceeds, 10_000);
  assert.equal(result.cashFlow.principalPayments, 2_000);
  assert.equal(result.cashFlow.financingCashFlow, 8_000);
});

test("owner contribution and draw update financing and equity", () => {
  const result = report([
    tx(5_000, "[Equity] Owner contribution [CF:Financing]"),
    tx(-750, "[Equity:Draw] Owner draw [CF:Financing]"),
  ]);
  assert.equal(result.balanceSheet.ownerContributions, 5_000);
  assert.equal(result.balanceSheet.ownerDraws, 750);
  assert.equal(result.balanceSheet.totalEquity, 4_250);
  assert.equal(result.cashFlow.financingCashFlow, 4_250);
});

test("accounts receivable increases and decreases reverse operating cash", () => {
  const result = report([
    tx(1_000, "[Revenue] [Asset:AR] Accounts receivable increase"),
    tx(-400, "[Asset:AR] Accounts receivable decrease"),
  ]);
  assert.equal(result.balanceSheet.accountsReceivable, 600);
  assert.equal(result.cashFlow.accountsReceivableChange, 600);
  assert.equal(result.cashFlow.operatingCashFlow, 400);
});

test("accounts payable increases and decreases affect operating cash", () => {
  const result = report([
    tx(-700, "[OPEX] [Liability:AP] Accounts payable increase"),
    tx(-200, "[Liability:AP] Accounts payable decrease"),
  ]);
  assert.equal(result.balanceSheet.accountsPayable, 500);
  assert.equal(result.cashFlow.accountsPayableChange, 500);
  assert.equal(result.cashFlow.operatingCashFlow, -200);
});

test("partial invoice payment recognizes revenue once and leaves the unpaid receivable", () => {
  const result = report([
    tx(1_000, "[Revenue] [Asset:AR] Accounts receivable increase for invoice"),
    tx(-400, "[Asset:AR] Accounts receivable decrease payment received"),
  ]);
  assert.equal(result.pnl.grossRevenue, 1_000);
  assert.equal(result.pnl.netIncome, 1_000);
  assert.equal(result.balanceSheet.accountsReceivable, 600);
  assert.equal(result.balanceSheet.cash, 400);
  assert.equal(result.cashFlow.operatingCashFlow, 400);
});

test("customer deposits and retainers remain liabilities until earned", () => {
  const depositOnly = report([
    tx(500, "[Liability:Deferred Revenue] Customer retainer received"),
  ]);
  assert.equal(depositOnly.pnl.grossRevenue, 0);
  assert.equal(depositOnly.pnl.netIncome, 0);
  assert.equal(depositOnly.balanceSheet.accruedExpenses, 500);
  assert.equal(depositOnly.balanceSheet.cash, 500);
  assert.equal(depositOnly.cashFlow.deferredRevenueChange, 500);

  const earned = report([
    tx(500, "[Liability:Deferred Revenue] Customer retainer received"),
    tx(
      500,
      "[Revenue] [Liability:Deferred Revenue] Deferred revenue decrease when earned",
    ),
  ]);
  assert.equal(earned.pnl.grossRevenue, 500);
  assert.equal(earned.balanceSheet.accruedExpenses, 0);
  assert.equal(earned.balanceSheet.cash, 500);
  assert.equal(earned.cashFlow.operatingCashFlow, 500);
});

test("chargebacks and bounced payments reverse revenue and cash", () => {
  const result = report([
    tx(800, "[Revenue] Customer payment received"),
    tx(-200, "[Revenue:Return] Customer chargeback"),
    tx(-100, "[Revenue:Return] Bounced customer payment"),
  ]);
  assert.equal(result.pnl.grossRevenue, 800);
  assert.equal(result.pnl.returns, 300);
  assert.equal(result.pnl.netRevenue, 500);
  assert.equal(result.balanceSheet.cash, 500);
});

test("voided checks and invoices are represented by exact reversing entries", () => {
  const result = report([
    tx(600, "[Revenue] Invoice issued"),
    tx(-600, "[Revenue:Return] Voided invoice reversal"),
    tx(-250, "[OPEX] Vendor check paid"),
    tx(250, "[OPEX] Voided check reversal"),
  ]);
  assert.equal(result.pnl.netRevenue, 0);
  assert.equal(result.pnl.operatingExpenses, 0);
  assert.equal(result.pnl.netIncome, 0);
  assert.equal(result.balanceSheet.cash, 0);
});

test("sales tax collected is a payable and does not inflate revenue", () => {
  const result = report([
    tx(1_000, "[Revenue] Sale received"),
    tx(80, "[Liability:Taxes Payable] Sales tax collected"),
  ]);
  assert.equal(result.pnl.grossRevenue, 1_000);
  assert.equal(result.pnl.netIncome, 1_000);
  assert.equal(result.balanceSheet.taxesPayable, 80);
  assert.equal(result.balanceSheet.cash, 1_080);
});

test("accrued payroll and payroll-tax liabilities affect cash only when paid", () => {
  const result = report([
    tx(-1_000, "[OPEX] [Liability:Accrued] Payroll expense accrued increase"),
    tx(-200, "[OPEX] [Liability:Taxes Payable] Payroll tax expense accrued increase"),
    tx(-1_000, "[Liability:Accrued] Payroll liability decrease payment"),
    tx(-200, "[Liability:Taxes Payable] Payroll taxes payable decrease payment"),
  ]);
  assert.equal(result.pnl.operatingExpenses, 1_200);
  assert.equal(result.balanceSheet.accruedExpenses, 0);
  assert.equal(result.balanceSheet.taxesPayable, 0);
  assert.equal(result.balanceSheet.cash, -1_200);
  assert.equal(result.cashFlow.operatingCashFlow, -1_200);
});

test("report ranges include exact month and year endpoints and exclude adjacent periods", () => {
  const month = calculateFinancialReport({
    transactions: [
      tx(10, "[Revenue] Before month", "2025-05-31T23:59:59.999Z"),
      tx(20, "[Revenue] Month start", "2025-06-01T00:00:00.000Z"),
      tx(30, "[Revenue] Month end", "2025-06-30T23:59:59.999Z"),
      tx(40, "[Revenue] After month", "2025-07-01T00:00:00.000Z"),
    ],
    start: new Date("2025-06-01T00:00:00.000Z"),
    end: new Date("2025-06-30T23:59:59.999Z"),
  });
  assert.equal(month.pnl.grossRevenue, 50);

  const year = report([
    tx(50, "[Revenue] Year start", "2025-01-01T00:00:00.000Z"),
    tx(60, "[Revenue] Year end", "2025-12-31T23:59:59.999Z"),
    tx(70, "[Revenue] Next year", "2026-01-01T00:00:00.000Z"),
  ]);
  assert.equal(year.pnl.grossRevenue, 110);
});

test("depreciation reduces earnings and fixed assets but is added back to cash flow", () => {
  const result = report([
    tx(-100, "[Depreciation] Depreciation expense"),
    tx(-100, "[Asset:Accumulated Depreciation] Accumulated depreciation"),
  ]);
  assert.equal(result.pnl.depreciation, 100);
  assert.equal(result.pnl.netIncome, -100);
  assert.equal(result.cashFlow.operatingCashFlow, 0);
  assert.equal(result.balanceSheet.accumulatedDepreciation, 100);
});

test("multi-year chart buckets are year-safe and follow required thresholds", () => {
  assert.equal(chartBucket(new Date("2024-01-10"), "monthly").key, "2024-01");
  assert.equal(chartBucket(new Date("2025-01-10"), "monthly").key, "2025-01");
  assert.equal(
    chartGranularity(new Date("2025-01-01"), new Date("2025-01-31")),
    "daily",
  );
  assert.equal(
    chartGranularity(new Date("2025-01-01"), new Date("2025-06-30")),
    "weekly",
  );
  assert.equal(
    chartGranularity(new Date("2024-01-01"), new Date("2025-12-29")),
    "monthly",
  );
  assert.equal(
    chartGranularity(new Date("2023-01-01"), new Date("2025-12-31")),
    "quarterly",
  );
});

test("zero revenue and zero equity use safe null ratios", () => {
  const result = report([]);
  assert.equal(result.pnl.grossMarginPct, null);
  assert.equal(result.ratios.debtToEquity, null);
  assert.equal(result.ratios.roaPct, null);
  assert.deepEqual(compareValues(10, 0), { amount: 10, percent: null });
  assert.deepEqual(dynamicAxisBounds([-50, 100]), [-65, 115]);
});

test("complete P&L, Balance Sheet, and Cash Flow example reconciles", () => {
  const result = report([
    tx(10_000, "[Revenue] Cash sales"),
    tx(-3_000, "[COGS] Cash materials"),
    tx(-2_000, "[OPEX] Cash rent"),
    tx(-1_000, "[Asset:Fixed] [CF:Investing] Equipment purchase"),
    tx(5_000, "[Liability:Long-Term] [CF:Financing] Loan proceeds"),
    tx(2_000, "[Equity] Owner contribution [CF:Financing]"),
  ]);
  assert.equal(result.pnl.netIncome, 5_000);
  assert.equal(result.balanceSheet.totalAssets, 12_000);
  assert.equal(result.balanceSheet.liabilitiesAndEquity, 12_000);
  assert.equal(result.cashFlow.netChangeInCash, 11_000);
  assert.equal(result.cashFlow.endingCash, result.balanceSheet.cash);
  assert.ok(result.reconciliations.every((item) => item.reconciled));
});
