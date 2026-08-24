import assert from "node:assert/strict";
import test from "node:test";
import { inclusiveLocalDayEnd, manualTransactionDate } from "./manual-transaction-date";

test("a transaction entered for today never receives a future noon timestamp", () => {
  const now = new Date(2026, 7, 24, 7, 6, 0, 0);
  assert.equal(manualTransactionDate("2026-08-24", now)?.getTime(), now.getTime());
});

test("historical date-only transactions use a stable local-noon timestamp", () => {
  const value = manualTransactionDate("2026-08-23", new Date(2026, 7, 24, 7, 6));
  assert.equal(value?.getFullYear(), 2026);
  assert.equal(value?.getMonth(), 7);
  assert.equal(value?.getDate(), 23);
  assert.equal(value?.getHours(), 12);
});

test("money periods include the complete current local day", () => {
  const end = inclusiveLocalDayEnd(new Date(2026, 7, 24, 7, 6));
  assert.deepEqual([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()], [23, 59, 59, 999]);
});
