import { scenarios } from "../scenarios/registry";
import { validateScenario } from "./scenario-validator";
let failures = 0;

for (const { fixture, answerKey } of scenarios) {
  const issues = validateScenario(fixture, answerKey);
  if (issues.length === 0) {
    console.log(`PASS ${fixture.manifest.scenarioId} ${fixture.manifest.scenarioName}`);
    continue;
  }
  failures += issues.length;
  console.error(`FAIL ${fixture.manifest.scenarioId} ${fixture.manifest.scenarioName}`);
  for (const issue of issues) console.error(`  ${issue.path}: ${issue.message}`);
}

if (failures > 0) process.exitCode = 1;
