import assert from "node:assert/strict";
import test from "node:test";
import { matchReceiptToTransaction } from "./contractor-receipt-transaction-matcher";

test("matches one existing Plaid purchase using amount, date, and vendor", () => {
  const result = matchReceiptToTransaction({ total: 1842.17, date: "2026-08-20", vendor: "Home Depot" }, [
    { id: "7", amount: -1842.17, date: "2026-08-21T00:00:00Z", title: "THE HOME DEPOT", plaidTransactionId: "plaid-7" },
  ]);
  assert.equal(result.transactionId, "7"); assert.equal(result.confidence, "high"); assert.equal(result.transactionSource, "plaid");
});

test("amount-only evidence remains a confirmation suggestion", () => {
  const result = matchReceiptToTransaction({ total: 500, date: "2026-08-20", vendor: "Supplier A" }, [
    { id: "8", amount: -500, date: "2026-08-30T00:00:00Z", title: "Unknown merchant" },
  ]);
  assert.equal(result.confidence, "low"); assert.equal(result.requiresConfirmation, true);
});

test("ambiguous duplicate purchases remain unmatched", () => {
  const candidates = ["8", "9"].map(id => ({ id, amount: -500, date: "2026-08-20T00:00:00Z", title: "Lowe's" }));
  const result = matchReceiptToTransaction({ total: 500, date: "2026-08-20", vendor: "Lowe's" }, candidates);
  assert.equal(result.transactionId, null); assert.equal(result.confidence, "unmatched");
});

test("missing receipt total or date cannot produce a financial link", () => {
  const result = matchReceiptToTransaction({ total: null, date: "2026-08-20", vendor: "Lowe's" }, []);
  assert.equal(result.transactionId, null);
});
