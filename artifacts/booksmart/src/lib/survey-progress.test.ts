import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSurveyStatus,
  finalizeApplicableProgress,
  firstIncompleteStep,
  inferLegacyProgress,
  isApplicable,
  QUESTIONS,
  STEP_KEYS,
} from "./survey-progress";

test("stable definition covers the current 10 business and 16 balance steps", () => {
  assert.equal(STEP_KEYS.filter((key) => key.startsWith("business.")).length, 10);
  assert.equal(STEP_KEYS.filter((key) => key.startsWith("balance.")).length, 16);
  assert.equal(new Set(QUESTIONS.map((question) => question.key)).size, QUESTIONS.length);
});

test("no vehicle makes vehicle detail questions not applicable", () => {
  const answers = { "vehicle.ownership": "No Business Vehicle" };
  const details = QUESTIONS.filter((question) => question.key.startsWith("vehicle.") && question.key !== "vehicle.ownership");
  assert.equal(details.every((question) => !isApplicable(question, answers)), true);

  const withVehicle = { "vehicle.ownership": "Own Personally" };
  assert.equal(details.every((question) => isApplicable(question, withVehicle)), true);
});

test("legacy inference ignores zeros, empty arrays, and visual defaults without provenance", () => {
  const progress = inferLegacyProgress({
    "vehicle.business_use_percent": 0,
    "income.primary_types": [],
    "equipment.spending_this_year": 0,
    "tax.multi_state_activity": false,
  });
  assert.equal(progress.answered.has("vehicle.business_use_percent"), false);
  assert.equal(progress.answered.has("income.primary_types"), false);
  assert.equal(progress.answered.has("equipment.spending_this_year"), false);
  assert.equal(progress.answered.has("tax.multi_state_activity"), true);
});

test("skips and not-applicable questions produce completed_with_skips correctly", () => {
  const answers = { "vehicle.ownership": "No Business Vehicle" };
  const applicableBusiness = QUESTIONS.filter(
    (question) => question.surveyKey === "business_survey" && isApplicable(question, answers),
  );
  const answered = new Set(applicableBusiness.map((question) => question.key));
  const skippedKey = applicableBusiness[0].key;
  answered.delete(skippedKey);
  const skipped = new Set([skippedKey]);
  assert.equal(calculateSurveyStatus("business_survey", answers, { answered, skipped }), "completed_with_skips");
});

test("changing a conditional parent makes newly applicable questions outstanding", () => {
  const noVehicle = { "vehicle.ownership": "No Business Vehicle" };
  const answered = new Set(
    QUESTIONS.filter((question) => isApplicable(question, noVehicle)).map((question) => question.key),
  );
  const progress = { answered, skipped: new Set<string>() };
  assert.equal(firstIncompleteStep(noVehicle, progress), null);
  assert.equal(firstIncompleteStep({ "vehicle.ownership": "Own Personally" }, progress), "business.vehicle");
});

test("finishing resolves remaining applicable optional questions as skipped", () => {
  const answers = { "vehicle.ownership": "No Business Vehicle" };
  const progress = finalizeApplicableProgress(answers, {
    answered: new Set(["vehicle.ownership"]),
    skipped: new Set(),
  });
  assert.equal(progress.answered.has("vehicle.ownership"), true);
  assert.equal(progress.skipped.has("vehicle.deduction_method"), false);
  assert.equal(
    calculateSurveyStatus("business_survey", answers, progress),
    "completed_with_skips",
  );
  assert.equal(
    calculateSurveyStatus("balance_sheet_profile", answers, progress),
    "completed_with_skips",
  );
});
