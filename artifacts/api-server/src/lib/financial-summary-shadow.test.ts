import assert from "node:assert/strict";
import test from "node:test";
import { compareFinancialSummaries } from "./financial-summary-shadow";

const values = { revenue: 100, accountingExpenses: 40, netIncome: 60, moneyIn: 120, moneyOut: 60, netCashMovement: 60, healthScore: 72 };
const transactionSources = { pnl: "transactions", balanceSheet: "transactions", cashFlow: "transactions" };

test("shadow comparison recognizes matching values within currency tolerance", () => {
  const result = compareFinancialSummaries({ legacy: values, canonical: { ...values, revenue: 100.005 }, legacySources: transactionSources, canonicalSources: { ...transactionSources } });
  assert.equal(result.classification, "match");
  assert.deepEqual(result.differences, []);
});

test("shadow comparison classifies equal-source value drift as unexpected", () => {
  const result = compareFinancialSummaries({ legacy: values, canonical: { ...values, netIncome: 55 }, legacySources: transactionSources, canonicalSources: transactionSources });
  assert.equal(result.classification, "unexpected_mismatch");
  assert.deepEqual(result.differences.map(item => item.metric), ["netIncome"]);
});

test("shadow comparison explains mismatches when source selection differs", () => {
  const result = compareFinancialSummaries({ legacy: values, canonical: { ...values, revenue: 125 }, legacySources: transactionSources, canonicalSources: { ...transactionSources, pnl: "uploaded" } });
  assert.equal(result.classification, "expected_source_difference");
  assert.equal(result.sourceDifference, true);
});

test("shadow comparison treats health-only methodology drift as expected", () => {
  const result = compareFinancialSummaries({ legacy: values, canonical: { ...values, healthScore: 55 }, legacySources: transactionSources, canonicalSources: transactionSources });
  assert.equal(result.classification, "expected_source_difference");
  assert.equal(result.methodologyDifference, true);
  assert.deepEqual(result.differences.map(item => item.metric), ["healthScore"]);
});
