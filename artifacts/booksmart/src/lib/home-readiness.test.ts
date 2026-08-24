import assert from "node:assert/strict";
import test from "node:test";
import { forecastShortfallDate, hasCanonicalFinancialHistory, planningSetupMessage } from "./home-readiness";

test("confirmed statements count as trusted Home financial history", () => {
  assert.equal(hasCanonicalFinancialHistory(
    { approvedTransactionCount: 0, confirmedStatementCount: 1 },
    { approvedTransactionCount: 0, confirmedStatementCount: 0 },
  ), true);
});

test("maximum forecast shortfall is paired with the lowest-balance date", () => {
  assert.equal(forecastShortfallDate({ shortfall: 3_600, shortfallDate: "2026-09-02", lowestBalanceDate: "2026-09-04" }), "2026-09-04");
  assert.equal(forecastShortfallDate({ shortfall: 0, shortfallDate: null, lowestBalanceDate: "2026-09-04" }), null);
});

test("Home does not invent history when canonical completeness is empty", () => {
  assert.equal(hasCanonicalFinancialHistory(
    { approvedTransactionCount: 0, confirmedStatementCount: 0 },
    { approvedTransactionCount: 0, confirmedStatementCount: 0 },
  ), false);
});

test("planning setup messages expose trusted missing prerequisites", () => {
  assert.equal(planningSetupMessage(["fresh_verified_cash_balance"]), "Next: connect a supported bank with a fresh verified cash balance");
  assert.equal(planningSetupMessage(["known_obligations", "operating_buffer"]), "Next: add upcoming obligations and set an operating cash buffer");
});
