import assert from "node:assert/strict";
import test from "node:test";
import { dashboardOnboarding } from "./dashboard-onboarding";

const base = { accountExists: true, businessInformationComplete: true, surveyStatuses: [] as string[], connectedBankCount: 0, transactionCount: 0 };

test("new and partial survey users continue the survey", () => {
  assert.equal(dashboardOnboarding(base).percent, 40);
  assert.equal(dashboardOnboarding({ ...base, surveyStatuses: ["in_progress"] }).nextAction, "survey");
});

test("completed with skips counts as survey completion", () => {
  const result = dashboardOnboarding({ ...base, surveyStatuses: ["completed", "completed_with_skips"] });
  assert.equal(result.surveyComplete, true);
  assert.equal(result.surveyLabel, "Completed with skips");
  assert.equal(result.nextAction, "bank");
});

test("bank and transactions complete independently", () => {
  const surveyed = { ...base, surveyStatuses: ["completed", "completed"] };
  assert.equal(dashboardOnboarding({ ...surveyed, connectedBankCount: 1 }).nextAction, "transactions");
  const complete = dashboardOnboarding({ ...surveyed, connectedBankCount: 1, transactionCount: 3 });
  assert.equal(complete.percent, 100);
  assert.equal(complete.nextAction, "complete");
});

test("different active-organization inputs recalculate progress", () => {
  const complete = dashboardOnboarding({ ...base, surveyStatuses: ["completed", "completed"], connectedBankCount: 1, transactionCount: 2 });
  assert.equal(complete.percent, 100);
  assert.equal(dashboardOnboarding(base).percent, 40);
});

test("recognizes progress rows produced by the previous final-step bug", () => {
  const result = dashboardOnboarding({
    ...base,
    surveyStatuses: ["in_progress", "in_progress"],
    surveyReachedEnd: true,
  });
  assert.equal(result.surveyComplete, true);
  assert.equal(result.surveyLabel, "Completed with skips");
  assert.equal(result.nextAction, "bank");
});
