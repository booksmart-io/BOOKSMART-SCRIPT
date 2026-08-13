import assert from "node:assert/strict";
import test from "node:test";
import { CPA_MONITORING_ENGAGEMENT_STATUSES, isCpaRelevantTask, validateCpaTaskCollaboration } from "./cpa-monitoring-access";

test("CPA monitoring permits only active engagement states", () => {
  assert.deepEqual(CPA_MONITORING_ENGAGEMENT_STATUSES, ["active", "in_progress", "in-progress"]);
  assert.equal(CPA_MONITORING_ENGAGEMENT_STATUSES.includes("pending" as never), false);
  assert.equal(CPA_MONITORING_ENGAGEMENT_STATUSES.includes("completed" as never), false);
});

test("CPA collaboration permits acknowledgement and bounded non-empty notes", () => {
  assert.deepEqual(validateCpaTaskCollaboration("acknowledge", undefined), { valid: true, action: "acknowledge", note: null });
  assert.deepEqual(validateCpaTaskCollaboration("note", "  Please confirm payroll.  "), { valid: true, action: "note", note: "Please confirm payroll." });
  assert.equal(validateCpaTaskCollaboration("note", " ").valid, false);
  assert.equal(validateCpaTaskCollaboration("complete", "no").valid, false);
  assert.equal(validateCpaTaskCollaboration("note", "x".repeat(1001)).valid, false);
});

test("CPA portfolio exposes only tasks requiring CPA involvement", () => {
  assert.equal(isCpaRelevantTask({ requires_cpa: true, assignment_role: "owner" }), true);
  assert.equal(isCpaRelevantTask({ requires_cpa: false, assignment_role: "cpa" }), true);
  assert.equal(isCpaRelevantTask({ requires_cpa: false, assignment_role: "owner" }), false);
});
