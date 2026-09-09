import { exactContractorIntelligenceScenarios } from "./exact-scenarios";
import { validateScenario } from "../validators/scenario-validator";

let failed = false;
for (const { fixture, answerKey } of exactContractorIntelligenceScenarios) {
  const issues = validateScenario(fixture, answerKey);
  if (issues.length === 0) console.log(`PASS ${fixture.manifest.scenarioId} ${fixture.manifest.scenarioName}`);
  else {
    failed = true;
    console.error(`FAIL ${fixture.manifest.scenarioId} ${fixture.manifest.scenarioName}`);
    for (const issue of issues) console.error(`  ${issue.path}: ${issue.message}`);
  }
}
if (exactContractorIntelligenceScenarios.length !== 16) {
  failed = true;
  console.error(`FAIL registry: expected 16 scenarios, found ${exactContractorIntelligenceScenarios.length}`);
}
if (failed) process.exitCode = 1;
