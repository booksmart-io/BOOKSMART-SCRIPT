import { exactContractorScenarioById } from "./contractor-intelligence/exact-scenarios";
import { scenarioById as legacyScenarioById } from "./scenarios/registry";

/** Resolves only executable, validated synthetic scenarios from either suite. */
export function scenarioById(scenarioId: string) {
  return legacyScenarioById(scenarioId) ?? exactContractorScenarioById(scenarioId);
}
