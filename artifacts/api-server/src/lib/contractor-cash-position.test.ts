import assert from "node:assert/strict";
import test from "node:test";
import { verifiedContractorCashPosition } from "./contractor-cash-position";

test("returns separate fresh current and available depository balances", () => {
  const result = verifiedContractorCashPosition({ hasHealthyPlaidConnection: true, now: new Date("2026-08-20T12:00:00Z"), snapshots: [
    { external_account_id: "a", account_type: "depository", current_balance: 1000, available_balance: 900, currency: "USD", balance_timestamp: "2026-08-20T10:00:00Z" },
    { external_account_id: "b", account_type: "depository", current_balance: 500, available_balance: null, currency: "USD", balance_timestamp: "2026-08-20T10:00:00Z" },
  ] });
  assert.equal(result.current, 1500); assert.equal(result.available, 1400); assert.equal(result.confidence, "high");
});

test("stale or unhealthy balances remain unavailable", () => {
  const result = verifiedContractorCashPosition({ hasHealthyPlaidConnection: false, snapshots: [] });
  assert.equal(result.current, null); assert.equal(result.available, null); assert.equal(result.confidence, "unavailable");
});
