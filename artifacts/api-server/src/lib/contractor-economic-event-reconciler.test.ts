import assert from "node:assert/strict";
import test from "node:test";
import { reconcileEconomicEvents, type EconomicEventEvidence } from "./contractor-economic-event-reconciler";

test("Scenario 5 consolidates duplicate payment evidence and preserves an expense conflict", () => {
  const rows: EconomicEventEvidence[] = [
    { id: "qb-payment", source: "quickbooks", kind: "customer_payment", amount: 5_000, date: "2026-08-10", counterparty: "Acme", correlationKey: "INV-5000" },
    { id: "plaid-deposit", source: "plaid", kind: "customer_payment", amount: 5_000, date: "2026-08-10", counterparty: "Acme", correlationKey: "INV-5000" },
    { id: "gmail-confirmation", source: "gmail", kind: "customer_payment", amount: 5_000, date: "2026-08-10", counterparty: "Acme", correlationKey: "INV-5000", evidenceOnly: true },
    { id: "manual-deposit", source: "manual_statement", kind: "customer_payment", amount: 5_000, date: "2026-08-10", counterparty: "Acme", correlationKey: "INV-5000" },
    { id: "bank-expense", source: "plaid", kind: "expense", amount: 420, date: "2026-08-11", counterparty: "Supply Co", correlationKey: "SUPPLY-811" },
    { id: "qb-expense", source: "quickbooks", kind: "expense", amount: 425, date: "2026-08-11", counterparty: "Supply Co", correlationKey: "SUPPLY-811" },
  ];
  const result = reconcileEconomicEvents(rows);
  const payment = result.find(row => row.kind === "customer_payment")!;
  assert.equal(payment.amount, 5_000);
  assert.equal(payment.netAmount, 5_000);
  assert.equal(payment.evidence.length, 4);
  assert.deepEqual(payment.conflicts, []);
  const expense = result.find(row => row.kind === "expense")!;
  assert.equal(expense.amount, 425, "QuickBooks remains authoritative without overwriting Plaid evidence");
  assert.equal(expense.confidence, "needs_review");
  assert.deepEqual(expense.conflicts[0]?.observedAmounts, [420, 425]);
});

test("Scenario 15 links refund and credit evidence to payment and nets collected cash to $4,500", () => {
  const result = reconcileEconomicEvents([
    { id: "qb-payment-6000", source: "quickbooks", kind: "customer_payment", amount: 6_000, date: "2026-08-01", correlationKey: "INV-6000" },
    { id: "plaid-payment-6000", source: "plaid", kind: "customer_payment", amount: 6_000, date: "2026-08-01", correlationKey: "INV-6000" },
    { id: "qb-credit-1500", source: "quickbooks", kind: "refund", amount: 1_500, date: "2026-08-12", correlationKey: "CREDIT-1500", reverses: "INV-6000", evidenceOnly: true },
    { id: "plaid-refund-1500", source: "plaid", kind: "refund", amount: 1_500, date: "2026-08-12", correlationKey: "CREDIT-1500", reverses: "INV-6000" },
  ]);
  const payment = result.find(row => row.kind === "customer_payment")!;
  assert.equal(payment.netAmount, 4_500);
  assert.deepEqual(payment.refundIds, ["qb-credit-1500", "plaid-refund-1500"]);
});
