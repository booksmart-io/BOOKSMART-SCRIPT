import assert from "node:assert/strict";
import test from "node:test";
import { validateScenario } from "../validators/scenario-validator";
import { exactContractorIntelligenceScenarios } from "./exact-scenarios";

test("contains all 16 exact contractor-intelligence fixtures in source order", () => {
  assert.equal(exactContractorIntelligenceScenarios.length, 16);
  assert.deepEqual(exactContractorIntelligenceScenarios.map(row => row.fixture.manifest.scenarioId), Array.from({ length: 16 }, (_, index) => `${String(index + 1).padStart(2, "0")}_CONTRACTOR_INTELLIGENCE`));
});

test("all exact contractor-intelligence fixtures and answer keys validate", () => {
  for (const { fixture, answerKey } of exactContractorIntelligenceScenarios) {
    assert.deepEqual(validateScenario(fixture, answerKey), [], fixture.manifest.scenarioId);
  }
});
