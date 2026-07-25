import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireSurveySaveLock,
  calculateSurveyStatus,
  finalizeApplicableProgress,
  firstIncompleteStep,
  inferLegacyProgress,
  isApplicable,
  PRIMARY_WORK_LOCATION_OPTIONS,
  persistSurveyQuestionInOrder,
  progressAfterQuestionAnswer,
  progressAfterQuestionSkip,
  releaseSurveySaveLock,
  QUESTIONS,
  STEP_KEYS,
} from "./survey-progress";

test("stable definition covers the v2 business and balance steps", () => {
  assert.equal(STEP_KEYS.filter((key) => key.startsWith("business.")).length, 11);
  assert.equal(STEP_KEYS.filter((key) => key.startsWith("balance.")).length, 16);
  assert.equal(new Set(QUESTIONS.map((question) => question.key)).size, QUESTIONS.length);
});

test("v2 questions are additive and funding purposes follow funding interest", () => {
  const v2 = QUESTIONS.filter((question) => question.introducedIn === 2);
  assert.deepEqual(v2.map((question) => question.key), [
    "business.activity_model",
    "tax.issues_1099s",
    "accounting.software",
    "strategy.business_goals",
    "funding.interest",
    "funding.purposes",
  ]);
  const purposes = v2.find((question) => question.key === "funding.purposes")!;
  assert.equal(isApplicable(purposes, { "funding.interest": "No" }), false);
  assert.equal(isApplicable(purposes, { "funding.interest": "Yes" }), true);
  assert.equal(isApplicable(purposes, { "funding.interest": "Maybe / exploring options" }), true);
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

test("primary work location keeps its approved independent vocabulary", () => {
  assert.deepEqual([...PRIMARY_WORK_LOCATION_OPTIONS], [
    "My Home",
    "Commercial Office",
    "Both (Home & Office)",
  ]);
  assert.equal(PRIMARY_WORK_LOCATION_OPTIONS.includes("Dedicated Room (Exclusive Use)" as never), false);
});

test("answer and skip update only the active progress key", () => {
  const initial = {
    answered: new Set(["tax.filing_status"]),
    skipped: new Set(["income.passive_types"]),
  };
  const answered = progressAfterQuestionAnswer(initial, "tax.primary_business_state");
  assert.deepEqual([...answered.answered].sort(), ["tax.filing_status", "tax.primary_business_state"]);
  assert.deepEqual([...answered.skipped], ["income.passive_types"]);

  const skipped = progressAfterQuestionSkip(answered, "tax.primary_business_state");
  assert.equal(skipped.answered.has("tax.primary_business_state"), false);
  assert.equal(skipped.skipped.has("tax.primary_business_state"), true);
  assert.equal(skipped.skipped.has("income.passive_types"), true);
});

test("rapid save attempts acquire the synchronous lock only once", () => {
  const lock = { current: false };
  assert.equal(acquireSurveySaveLock(lock), true);
  assert.equal(acquireSurveySaveLock(lock), false);
  releaseSurveySaveLock(lock);
  assert.equal(acquireSurveySaveLock(lock), true);
});

test("answer persistence failure prevents progress and navigation", async () => {
  const events: string[] = [];
  await assert.rejects(
    persistSurveyQuestionInOrder({
      saveAnswer: async () => {
        events.push("answer");
        throw new Error("answer failed");
      },
      saveProgress: async () => {
        events.push("progress");
      },
      onSuccess: () => events.push("navigate"),
    }),
    /answer failed/,
  );
  assert.deepEqual(events, ["answer"]);
});

test("progress persistence failure prevents navigation after the answer save", async () => {
  const events: string[] = [];
  await assert.rejects(
    persistSurveyQuestionInOrder({
      saveAnswer: async () => {
        events.push("answer");
      },
      saveProgress: async () => {
        events.push("progress");
        throw new Error("progress failed");
      },
      onSuccess: () => events.push("navigate"),
    }),
    /progress failed/,
  );
  assert.deepEqual(events, ["answer", "progress"]);
});
