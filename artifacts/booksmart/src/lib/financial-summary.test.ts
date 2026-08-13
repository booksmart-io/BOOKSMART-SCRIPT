import assert from "node:assert/strict";
import test from "node:test";
import { calculateFinancialReport, type FinancialTransaction } from "./financial-engine";
import { calculateBusinessHealthFromActivity, calculateBusinessHealthScore, createFinancialSummary } from "./financial-summary";

const start = new Date("2026-01-01T00:00:00Z");
const end = new Date("2026-12-31T23:59:59Z");
const tx = (id: number, amount: number, title: string): FinancialTransaction => ({ id, amount, title, date_time: "2026-06-01T12:00:00Z" });

test("shared summary preserves accounting profit versus cash movement", () => {
  const report = calculateFinancialReport({ start, end, transactions: [tx(1, 10_000, "[Revenue] Client payment"), tx(2, -2_000, "[OPEX] Rent"), tx(3, -3_000, "[Asset:Fixed] [CF:Investing] Equipment purchase")] });
  const summary = createFinancialSummary({ report, deductibleAmount: 2_000 });
  assert.equal(summary.revenue, 10_000);
  assert.equal(summary.accountingExpenses, 2_000);
  assert.equal(summary.netIncome, 8_000);
  assert.equal(summary.moneyOut, 5_000);
  assert.equal(summary.netCashMovement, 5_000);
});

test("CPA activity uses the shared health methodology and refuses an empty fallback score", () => {
  assert.equal(calculateBusinessHealthFromActivity([]), null);
  const health = calculateBusinessHealthFromActivity([{ amount: 20_000 }, { amount: -8_000, deductible: true }, { amount: -4_000 }]);
  assert.equal(health?.methodologyVersion, "financial-health-v1");
  assert.equal(health?.score, calculateBusinessHealthScore({ revenue: 20_000, accountingExpenses: 12_000, netIncome: 8_000, deductibleAmount: 8_000, transactionCount: 3 }).score);
});

test("shared summary excludes transfers from money movement", () => {
  const report = calculateFinancialReport({ start, end, transactions: [tx(1, -500, "Transfer to savings"), tx(2, 500, "Transfer from checking")] });
  const summary = createFinancialSummary({ report });
  assert.equal(summary.moneyIn, 0); assert.equal(summary.moneyOut, 0); assert.equal(summary.netIncome, 0); assert.equal(summary.netCashMovement, 0);
});

test("health score uses one versioned and explainable formula", () => {
  const health = calculateBusinessHealthScore({ revenue: 20_000, netIncome: 8_000, accountingExpenses: 12_000, deductibleAmount: 8_000, transactionCount: 10 });
  assert.equal(health.score, 100); assert.equal(health.status, "Excellent"); assert.equal(health.methodologyVersion, "financial-health-v1"); assert.equal(health.factors.reduce((sum, factor) => sum + factor.points, 0), health.score);
  assert.match(health.calculatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(health.positiveFactors.length, health.factors.length);
  assert.equal(health.negativeFactors.length, 0);
  assert.deepEqual(health.missingInputs, []);
  assert.deepEqual(health.highestPriorityActions, []);
});

test("health score reports missing inputs and priority actions without inventing values", () => {
  const health = calculateBusinessHealthScore({ revenue: 0, netIncome: -500, accountingExpenses: 500, deductibleAmount: 0, transactionCount: 0, unclassifiedTransactionCount: 2 });
  assert.deepEqual(health.missingInputs, ["approved_transactions", "deduction_classification"]);
  assert.ok(health.highestPriorityActions.some((action) => action.includes("negative net income")));
  assert.ok(health.highestPriorityActions.some((action) => action.includes("2 uncategorized")));
});
