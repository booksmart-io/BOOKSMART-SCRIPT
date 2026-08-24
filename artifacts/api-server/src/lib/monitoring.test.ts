import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionSignal, canTransitionTask, evaluateConnectionHealth, evaluateTrustedSummary, isFinancialDataChangeEvent, signalCreatesTask, taskDueDate, validTaskAssignmentRole, validTaskDueDate, validTaskPriority } from "./monitoring";

test("monitoring rules produce deterministic signals from the shared summary", () => {
  const signals = evaluateTrustedSummary({
    revenue: 12_000, accountingExpenses: 7_500, netIncome: 4_500,
    netCashMovement: -500, unclassifiedTransactionCount: 23, healthScore: 55,
    comparison: { revenue: 10_000, accountingExpenses: 5_000 },
  });
  assert.deepEqual(signals.map(signal => signal.signalKey), [
    "revenue-trend", "expense-trend", "uncategorized-transactions", "negative-cash-movement",
  ]);
  assert.equal(signals[0]?.percentage, 20);
  assert.equal(signals[1]?.percentage, 50);
});

test("monitoring rules do not invent trends without a comparison period", () => {
  const signals = evaluateTrustedSummary({
    revenue: 12_000, accountingExpenses: 7_500, netIncome: 4_500,
    netCashMovement: 500, unclassifiedTransactionCount: 0, healthScore: 70,
  });
  assert.deepEqual(signals, []);
});

test("trusted detail rules retain traceable sources", () => {
  const signals = evaluateTrustedSummary({
    revenue: 9_000, accountingExpenses: 4_000, netIncome: 5_000,
    netCashMovement: 1_000, unclassifiedTransactionCount: 0, healthScore: 70,
    comparison: { revenue: 9_000, accountingExpenses: 4_000, netIncome: 4_000 },
    categorySpending: [{ key: "contractors", label: "Contractors", current: 2_000, previous: 1_000, sourceIds: [41, 42] }],
    largeApprovedTransactions: [{ id: 99, title: "Equipment purchase", amount: -12_000 }],
    pendingDocumentReview: { count: 2, sourceIds: [7, 8] },
  });
  assert.ok(signals.some(signal => signal.signalKey === "net-income-trend"));
  assert.deepEqual(signals.find(signal => signal.signalKey === "category-spike:contractors")?.sourceIds, [41, 42]);
  assert.deepEqual(signals.find(signal => signal.signalKey === "large-transaction:99")?.sourceIds, [99]);
  assert.deepEqual(signals.find(signal => signal.signalKey === "documents-needing-review")?.sourceIds, [7, 8]);
});

test("task lifecycle rejects invalid shortcuts", () => {
  assert.equal(canTransitionTask("open", "completed"), true);
  assert.equal(canTransitionTask("completed", "in_progress"), false);
  assert.equal(canTransitionTask("completed", "open"), true);
});

test("signal lifecycle permits only explicit state changes", () => {
  assert.equal(canTransitionSignal("active", "dismiss"), true);
  assert.equal(canTransitionSignal("active", "resolve"), true);
  assert.equal(canTransitionSignal("active", "reopen"), false);
  assert.equal(canTransitionSignal("resolved", "reopen"), true);
  assert.equal(canTransitionSignal("dismissed", "resolve"), false);
  assert.equal(canTransitionSignal("expired", "reopen"), true);
});

test("connection rules create actionable signals only for unhealthy live connections", () => {
  const signals = evaluateConnectionHealth([
    { id: "plaid:1", name: "Healthy Bank", type: "plaid", status: "healthy", stale: false, error: null },
    { id: "quickbooks:2", name: "Books Co", type: "quickbooks", status: "attention", stale: true, error: null },
    { id: "uploaded_statement", name: "Uploaded statements", type: "uploaded_statement", status: "available", stale: false, error: null },
  ]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.signalKey, "connection:quickbooks:2");
  assert.equal(signals[0]?.severity, "high");
  assert.equal(signals[0]?.ctaRoute, "/user/settings");
});

test("monitoring tasks receive deterministic urgency-based due dates", () => {
  const from = new Date("2026-08-10T18:00:00.000Z");
  assert.equal(taskDueDate({ signalType: "connection", severity: "critical" }, from), "2026-08-10");
  assert.equal(taskDueDate({ signalType: "bookkeeping", severity: "medium" }, from), "2026-08-12");
  assert.equal(taskDueDate({ signalType: "trend", severity: "high" }, from), "2026-08-17");
  assert.equal(taskDueDate({ signalType: "trend", severity: "medium" }, from), "2026-08-24");
});

test("task generation covers actionable bookkeeping, connection, and high severity signals", () => {
  assert.equal(signalCreatesTask({ signalType: "bookkeeping", severity: "medium" }), true);
  assert.equal(signalCreatesTask({ signalType: "connection", severity: "high" }), true);
  assert.equal(signalCreatesTask({ signalType: "trend", severity: "high" }), true);
  assert.equal(signalCreatesTask({ signalType: "trend", severity: "medium" }), false);
  assert.equal(signalCreatesTask({ signalType: "trend", severity: "positive" }), false);
});

test("financial-data event bridge accepts only explicit accounting events", () => {
  assert.equal(isFinancialDataChangeEvent("transaction_categorized"), true);
  assert.equal(isFinancialDataChangeEvent("document_transactions_approved"), true);
  assert.equal(isFinancialDataChangeEvent("delete_organization"), false);
  assert.equal(isFinancialDataChangeEvent(null), false);
});

test("task management accepts only bounded canonical values", () => {
  assert.equal(validTaskPriority("critical"), true);
  assert.equal(validTaskPriority("urgent"), false);
  assert.equal(validTaskAssignmentRole("cpa"), true);
  assert.equal(validTaskAssignmentRole("admin"), false);
  assert.equal(validTaskDueDate("2026-02-28"), true);
  assert.equal(validTaskDueDate("2026-02-30"), false);
  assert.equal(validTaskDueDate(null), true);
});
