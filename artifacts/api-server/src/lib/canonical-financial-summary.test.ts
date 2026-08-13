import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalFinancialSummary, buildCanonicalHomeSummaryPair, parseFinancialSummaryInstantPeriod, parseFinancialSummaryPeriod } from "./canonical-financial-summary";
import type { FinancialTransaction } from "../../../booksmart/src/lib/financial-engine";

const start = new Date("2026-07-01T00:00:00.000Z");
const end = new Date("2026-07-31T23:59:59.999Z");
const transaction = (id: number, amount: number, title: string, deductible = false): FinancialTransaction => ({
  id, amount, title, deductible, date_time: "2026-07-15T12:00:00.000Z",
});

function confirmedDocument(id: number, category: string, values: Record<string, number>) {
  return {
    id,
    name: `${category}.pdf`,
    category,
    tax_year: "2026",
    parsed_data: {
      statement_workflow: {
        organization_id: 7,
        lifecycle_status: "confirmed",
        confirmed_result: {
          metadata: category === "Balance Sheet"
            ? { as_of_date: "2026-07-31", scale: "units" }
            : { period_start: "2026-07-01", period_end: "2026-07-31", scale: "units" },
          values,
        },
      },
    },
  };
}

test("canonical transaction summary matches the existing accounting-engine totals", () => {
  const summary = buildCanonicalFinancialSummary({
    organizationId: 7, start, end, categories: [], subCategories: [],
    transactions: [
      transaction(1, 10_000, "[Revenue] Sales"),
      transaction(2, -2_000, "[OPEX] Rent", true),
      transaction(3, -3_000, "[Asset:Fixed] [CF:Investing] Equipment"),
      transaction(4, 500, "Transfer from savings"),
      transaction(5, -500, "Transfer to checking"),
    ],
  });
  assert.equal(summary.source, "transactions");
  assert.deepEqual(summary.sources, { pnl: "transactions", balanceSheet: "transactions", cashFlow: "transactions" });
  assert.equal(summary.revenue, 10_000);
  assert.equal(summary.accountingExpenses, 2_000);
  assert.equal(summary.netIncome, 8_000);
  assert.equal(summary.moneyIn, 10_000);
  assert.equal(summary.moneyOut, 5_000);
  assert.equal(summary.netCashMovement, 5_000);
  assert.equal(summary.deductibleAmount, 2_000);
  assert.equal(summary.calculationVersion, "financial-summary-v2");
});

test("confirmed uploaded P&L and cash flow preserve Reports source precedence without double counting", () => {
  const summary = buildCanonicalFinancialSummary({
    organizationId: 7, start, end, categories: [], subCategories: [],
    transactions: [transaction(1, 99_000, "[Revenue] Ledger revenue"), transaction(2, -40_000, "[OPEX] Ledger expenses")],
    documents: [
      confirmedDocument(10, "Profit & Loss", { revenue: 25_000, cost_of_goods_sold: 4_000, gross_profit: 21_000, operating_expenses: 6_000, net_income: 15_000 }),
      confirmedDocument(11, "Cash Flow Statement", { operating_activities: 18_000, investing_activities: -2_500, financing_activities: -500, net_cash_change: 15_000 }),
    ],
  });
  assert.equal(summary.source, "uploaded_statement");
  assert.equal(summary.sources.pnl, "uploaded");
  assert.equal(summary.sources.cashFlow, "uploaded");
  assert.equal(summary.revenue, 25_000);
  assert.equal(summary.accountingExpenses, 10_000);
  assert.equal(summary.netIncome, 15_000);
  assert.equal(summary.moneyIn, 18_000);
  assert.equal(summary.moneyOut, 3_000);
  assert.equal(summary.netCashMovement, 15_000);
});

test("canonical health uses the same configured federal deduction rule as Reports", () => {
  const expense = { ...transaction(2, -2_000, "[OPEX] Advertising", true), sub_category_id: 54 };
  const summary = buildCanonicalFinancialSummary({
    organizationId: 7, start, end, categories: [], subCategories: [], organization: { id: 7, state: null },
    transactions: [transaction(1, 10_000, "[Revenue] Sales"), expense],
    deductionRuleGroups: [{ id: 1, state_id: null, valid_from: "2020-01-01", valid_to: null, description: null }],
    deductionRules: [{ id: 1, deduction_rule_group_id: 1, sub_category_id: 54, organization_column_name: null, calculation_type: "percentage", value: 50, is_per_transaction: true, max_deduction_per_transaction: null }],
  });
  assert.equal(summary.deductibleAmount, 1_000);
  assert.equal(summary.health.methodologyVersion, "financial-health-v1");
});

test("pending and cross-organization statements are excluded and reported as incomplete", () => {
  const pending = confirmedDocument(12, "Profit & Loss", { revenue: 30_000 });
  (pending.parsed_data.statement_workflow as Record<string, unknown>).lifecycle_status = "needs_review";
  const otherOrganization = confirmedDocument(13, "Profit & Loss", { revenue: 50_000 });
  (otherOrganization.parsed_data.statement_workflow as Record<string, unknown>).organization_id = 99;
  const summary = buildCanonicalFinancialSummary({ organizationId: 7, start, end, transactions: [], categories: [], subCategories: [], documents: [pending, otherOrganization] });
  assert.equal(summary.source, "transactions");
  assert.equal(summary.revenue, 0);
  assert.equal(summary.completeness.confirmedStatementCount, 0);
  assert.equal(summary.completeness.pendingStatementCount, 1);
  assert.ok(summary.warnings.includes("pending_statements_excluded"));
});

test("canonical period parser uses explicit inclusive UTC day boundaries", () => {
  assert.deepEqual(parseFinancialSummaryPeriod("2026-08-01", "2026-08-31"), {
    start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-08-31T23:59:59.999Z"),
  });
  assert.equal(parseFinancialSummaryPeriod("08/01/2026", "2026-08-31"), null);
  assert.equal(parseFinancialSummaryPeriod("2026-09-01", "2026-08-31"), null);
});

test("shadow period parser preserves the browser's exact local-day instants", () => {
  assert.deepEqual(parseFinancialSummaryInstantPeriod("2026-07-15T07:00:00.000Z", "2026-08-14T06:59:59.999Z"), {
    start: new Date("2026-07-15T07:00:00.000Z"), end: new Date("2026-08-14T06:59:59.999Z"),
  });
  assert.equal(parseFinancialSummaryInstantPeriod("not-a-date", "2026-08-14T06:59:59.999Z"), null);
});

test("combined Home pair equals two independently filtered canonical summaries", () => {
  const previousStart = new Date("2026-06-01T07:00:00.000Z");
  const previousEnd = new Date("2026-07-01T06:59:59.999Z");
  const currentStart = new Date("2026-07-01T07:00:00.000Z");
  const currentEnd = new Date("2026-07-31T06:59:59.999Z");
  const transactions: FinancialTransaction[] = [
    { ...transaction(1, 4_000, "[Revenue] Previous"), date_time: "2026-06-15T12:00:00.000Z" },
    { ...transaction(2, -1_000, "[OPEX] Previous"), date_time: "2026-06-20T12:00:00.000Z" },
    { ...transaction(3, 10_000, "[Revenue] Current"), date_time: "2026-07-15T12:00:00.000Z" },
    { ...transaction(4, -2_000, "[OPEX] Current", true), date_time: "2026-07-20T12:00:00.000Z" },
  ];
  const shared = { organizationId: 7, transactions, categories: [], subCategories: [] };
  const pair = buildCanonicalHomeSummaryPair({ ...shared, currentStart, currentEnd, previousStart, previousEnd });
  const independentCurrent = buildCanonicalFinancialSummary({ ...shared, start: currentStart, end: currentEnd, transactions: transactions.slice(2) });
  const independentPrevious = buildCanonicalFinancialSummary({ ...shared, start: previousStart, end: previousEnd, transactions: transactions.slice(0, 2) });
  assert.deepEqual({ revenue: pair.current.revenue, expenses: pair.current.accountingExpenses, cash: pair.current.netCashMovement }, { revenue: independentCurrent.revenue, expenses: independentCurrent.accountingExpenses, cash: independentCurrent.netCashMovement });
  assert.deepEqual({ revenue: pair.previous.revenue, expenses: pair.previous.accountingExpenses, cash: pair.previous.netCashMovement }, { revenue: independentPrevious.revenue, expenses: independentPrevious.accountingExpenses, cash: independentPrevious.netCashMovement });
});
