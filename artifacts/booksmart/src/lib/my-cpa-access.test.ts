import assert from "node:assert/strict";
import test from "node:test";
import { CPA_SHARED_ACCESS, needsCpaAttention } from "./my-cpa-access";

test("documents the bounded CPA access exposed by active engagements", () => {
  assert.deepEqual(CPA_SHARED_ACCESS, [
    "Canonical financial summaries and trends",
    "Approved transaction data used by those summaries",
    "Monitoring tasks assigned to the CPA or marked for CPA review",
    "Planning readiness and configured planning inputs",
  ]);
});

test("shows only active signals explicitly marked for CPA review", () => {
  assert.equal(needsCpaAttention({ status: "active", requires_cpa_review: true, cpa_review_level: "recommended" }), true);
  assert.equal(needsCpaAttention({ status: "active", requires_cpa_review: false, cpa_review_level: "recommended" }), false);
  assert.equal(needsCpaAttention({ status: "resolved", requires_cpa_review: true, cpa_review_level: "urgent" }), false);
  assert.equal(needsCpaAttention({ status: "active", requires_cpa_review: true, cpa_review_level: "none" }), false);
});
