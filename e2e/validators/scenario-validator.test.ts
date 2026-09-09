import assert from "node:assert/strict";
import test from "node:test";
import { scenario, answerKey } from "../scenarios/04_unbilled_landscaping/scenario";
import { validateScenario } from "./scenario-validator";

test("validates the deterministic unbilled landscaping answer key", () => {
  assert.deepEqual(validateScenario(scenario, answerKey), []);
});

test("rejects an answer key that disagrees with fixture mathematics", () => {
  const issues = validateScenario(scenario, { ...answerKey, completedUnbilledValue: answerKey.completedUnbilledValue - 1 });
  assert.ok(issues.some(issue => issue.path === "answerKey.completedUnbilledValue"));
});

test("rejects rich intelligence expectations that reference unseeded evidence", () => {
  const issues = validateScenario(scenario, {
    ...answerKey,
    expectedMatches: [{
      id: "missing-match",
      recordIds: ["record-that-was-not-seeded"],
      economicEvent: "expense",
      confidence: "high",
      disposition: "matched",
    }],
    expectedInsights: [{
      key: "contractor:test",
      evidence: [{ provider: "jobber", recordId: "missing-job", role: "primary" }],
    }],
  });

  assert.ok(issues.some(issue => issue.path === "answerKey.expectedMatches[0].recordIds"));
  assert.ok(issues.some(issue => issue.path === "answerKey.expectedInsights[0].evidence[0].recordId"));
});
