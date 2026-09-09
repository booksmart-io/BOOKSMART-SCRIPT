import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProductOutput } from "./evaluate-product-output";

test("does not convert valid fixtures or unrelated signals into a pass", () => {
  const result = evaluateProductOutput({ completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0, expectedNumericValues: { net: 4500 }, expectedMatches: [{ id: "refund-link", recordIds: ["payment", "refund"], economicEvent: "refund", confidence: "high", disposition: "matched" }] }, [{ signal_key: "unrelated", amount: 6000 }]);
  assert.equal(result.status, "PARTIAL");
  assert.deepEqual(result.missingNumericValues, ["net=4500"]);
  assert.deepEqual(result.missingMatches, ["refund-link"]);
});

test("passes only when observable output satisfies every declared check", () => {
  const result = evaluateProductOutput({ completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0, expectedNumericValues: { net: 4500 }, expectedMatches: [{ id: "refund-link", recordIds: ["payment", "refund"], economicEvent: "refund", confidence: "high", disposition: "matched" }] }, [{ signal_key: "refund", amount: 4500, source_ids: ["payment", "refund"] }]);
  assert.equal(result.status, "PASS");
});

test("confidence-only scenarios cannot pass without visible confidence evidence", () => {
  const result = evaluateProductOutput({ completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0,
    expectedConfidenceIssues: [{ subject: "accounting confirmation", expected: "limited", reason: "QuickBooks unavailable" }],
    prohibitedConclusions: ["Invented QuickBooks value"] }, [{ signal_key: "generic", title: "Cash movement changed" }]);
  assert.equal(result.status, "PARTIAL");
  assert.deepEqual(result.missingConfidenceIssues, ["accounting confirmation"]);
  assert.deepEqual(result.prohibitedConclusionsFound, []);
});
