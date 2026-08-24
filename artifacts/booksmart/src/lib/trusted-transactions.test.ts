import assert from "node:assert/strict";
import test from "node:test";
import { trustedTransactions } from "./trusted-transactions";

test("only valid rows from the canonical transactions ledger are trusted", () => {
  const valid = { id: 1, amount: 250, date_time: "2026-08-12T12:00:00.000Z" };
  assert.deepEqual(trustedTransactions("transactions", [valid]), [valid]);
  assert.deepEqual(trustedTransactions("transactions", [valid, { id: 0, amount: 10, date_time: valid.date_time }, { id: 2, amount: Number.NaN, date_time: valid.date_time }, { id: 3, amount: 10, date_time: "not-a-date" }]), [valid]);
});

test("pending, staged, rejected, and duplicate sources cannot enter the trusted boundary", () => {
  const rows = [{ id: 1, amount: 250, date_time: "2026-08-12T12:00:00.000Z" }];
  for (const source of ["pending_transactions", "quickbooks_staged_entities", "rejected", "duplicate"] as const) {
    assert.deepEqual(trustedTransactions(source as never, rows), []);
  }
  assert.deepEqual(trustedTransactions("transactions", [{ ...rows[0], pending: true }]), []);
});
