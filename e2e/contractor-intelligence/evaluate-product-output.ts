import type { ScenarioAnswerKey } from "../scenarios/types";

export type ProductSignal = { signal_key: string; title?: string | null; amount?: number | null; source_ids?: unknown; metadata?: unknown };
export type ProductEvaluation = {
  status: "PASS" | "PARTIAL" | "FAIL";
  expectedChecks: number;
  satisfiedChecks: number;
  actualInsightKeys: string[];
  missingInsights: string[];
  missingNumericValues: string[];
  missingMatches: string[];
  missingDuplicates: string[];
  missingConflicts: string[];
  missingConfidenceIssues: string[];
  prohibitedConclusionsFound: string[];
};

const cents = (value: number) => Math.round(value * 100);
function numbers(value: unknown, found: number[] = []): number[] {
  if (typeof value === "number" && Number.isFinite(value)) found.push(value);
  else if (Array.isArray(value)) for (const item of value) numbers(item, found);
  else if (value && typeof value === "object") for (const item of Object.values(value)) numbers(item, found);
  return found;
}

/** Evaluates observable product output only. Fixture validity is deliberately not an input. */
export function evaluateProductOutput(answerKey: ScenarioAnswerKey, signals: ProductSignal[]): ProductEvaluation {
  const documents = signals.map(signal => JSON.stringify(signal).toLowerCase());
  const actualNumbers = signals.flatMap(signal => [signal.amount, ...numbers(signal.metadata)]).filter((value): value is number => typeof value === "number");
  const missingInsights = (answerKey.expectedInsights ?? []).filter(expected => !signals.some(signal => signal.signal_key === expected.key || signal.signal_key.startsWith(`${expected.key}:`))).map(row => row.key);
  const missingNumericValues = Object.entries(answerKey.expectedNumericValues ?? {}).filter(([, expected]) => !actualNumbers.some(actual => cents(actual) === cents(expected))).map(([key, expected]) => `${key}=${expected}`);
  const missingMatches = (answerKey.expectedMatches ?? []).filter(match => !documents.some(document => match.recordIds.every(id => document.includes(id.toLowerCase())))).map(row => row.id);
  const missingDuplicates = (answerKey.expectedDuplicates ?? []).filter(expected => !documents.some(document => expected.recordIds.every(id => document.includes(id.toLowerCase())) && /duplicate|dedup|same economic/.test(document))).map(row => row.economicEvent);
  const missingConflicts = (answerKey.expectedConflicts ?? []).filter(expected => !documents.some(document => expected.recordIds.every(id => document.includes(id.toLowerCase())) && /conflict|discrep|fresh|stale|review/.test(document))).map(row => row.id);
  const missingConfidenceIssues = (answerKey.expectedConfidenceIssues ?? []).filter(expected => !documents.some(document => document.includes(expected.subject.toLowerCase()) && document.includes(expected.expected.toLowerCase()))).map(row => row.subject);
  const prohibitedConclusionsFound = (answerKey.prohibitedConclusions ?? []).filter(prohibited => documents.some(document => document.includes(prohibited.toLowerCase())));
  const expectedChecks = (answerKey.expectedInsights?.length ?? 0) + Object.keys(answerKey.expectedNumericValues ?? {}).length + (answerKey.expectedMatches?.length ?? 0) + (answerKey.expectedDuplicates?.length ?? 0) + (answerKey.expectedConflicts?.length ?? 0) + (answerKey.expectedConfidenceIssues?.length ?? 0) + (answerKey.prohibitedConclusions?.length ?? 0);
  const missing = missingInsights.length + missingNumericValues.length + missingMatches.length + missingDuplicates.length + missingConflicts.length + missingConfidenceIssues.length + prohibitedConclusionsFound.length;
  const satisfiedChecks = expectedChecks - missing;
  return { status: expectedChecks > 0 && missing === 0 ? "PASS" : satisfiedChecks > 0 || signals.length > 0 ? "PARTIAL" : "FAIL", expectedChecks, satisfiedChecks, actualInsightKeys: signals.map(row => row.signal_key), missingInsights, missingNumericValues, missingMatches, missingDuplicates, missingConflicts, missingConfidenceIssues, prohibitedConclusionsFound };
}
