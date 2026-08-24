import assert from "node:assert/strict";
import test from "node:test";
import { contractorDiagnosticQuality } from "./contractor-diagnostics";

test("diagnostic confidence reflects sources, real records, and staleness", () => {
  assert.equal(contractorDiagnosticQuality({ connected: ["jobber", "plaid"], stale: [], approvedTransactions: 10, jobs: 2 }).confidence, "high");
  const stale = contractorDiagnosticQuality({ connected: ["jobber", "quickbooks"], stale: ["quickbooks"], approvedTransactions: 10, jobs: 2 });
  assert.equal(stale.confidence, "medium"); assert.deepEqual(stale.staleProviders, ["quickbooks"]);
});
