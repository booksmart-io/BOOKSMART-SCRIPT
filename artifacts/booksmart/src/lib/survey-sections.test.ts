import assert from "node:assert/strict";
import test from "node:test";
import {
  SURVEY_SECTIONS,
  adjacentApplicableQuestion,
  applicableQuestionsInDisplayOrder,
  applicableSurveyCompletion,
  questionsForSection,
  sectionIndexForStep,
} from "./survey-sections";

test("consolidates the v2 flow into eight sections", () => {
  assert.equal(SURVEY_SECTIONS.length, 8);
  assert.equal(sectionIndexForStep("business.phase1_profile"), 1);
  assert.equal(sectionIndexForStep("business.vehicle"), 4);
  assert.equal(sectionIndexForStep("balance.vehicle_percent"), 4);
  assert.equal(sectionIndexForStep("balance.debt_balances"), 6);
});

test("every stable question key belongs to a grouped section", async () => {
  const { QUESTIONS } = await import("./survey-progress");
  const grouped = new Set(SURVEY_SECTIONS.flatMap((_, index) => questionsForSection(index).map((q) => q.key)));
  assert.deepEqual([...QUESTIONS.map((q) => q.key).filter((key) => !grouped.has(key))], []);
});

test("completion counts applicable questions only", () => {
  const answers = {
    "vehicle.ownership": "No Business Vehicle",
    "workspace.home_office_type": "No Home Office",
    "equipment.ownership": false,
    "liabilities.selected": [],
  };
  const resolved = new Set([
    "vehicle.ownership",
    "workspace.home_office_type",
    "equipment.ownership",
    "liabilities.selected",
  ]);
  const result = applicableSurveyCompletion(answers, { answered: resolved, skipped: new Set() });
  assert.ok(result.applicable < questionsForSection(0).length + questionsForSection(1).length
    + questionsForSection(2).length + questionsForSection(3).length
    + questionsForSection(4).length + questionsForSection(5).length
    + questionsForSection(6).length);
  assert.ok(result.resolved >= 4);
});

test("every registered question has exactly one card position", async () => {
  const { QUESTIONS } = await import("./survey-progress");
  const allApplicableAnswers = {
    "funding.interest": "Yes",
    "vehicle.ownership": "Own Personally",
    "workspace.home_office_type": "Dedicated Room (Exclusive Use)",
    "workspace.tech_usage": ["Personal Phone for Business", "Home Internet for Business"],
    "equipment.ownership": true,
    "liabilities.selected": ["credit_cards"],
    "equity.owner_contributed": true,
  };
  const visible = applicableQuestionsInDisplayOrder(allApplicableAnswers);
  assert.equal(visible.length, QUESTIONS.length);
  assert.equal(new Set(visible.map((question) => question.key)).size, QUESTIONS.length);
  assert.equal(new Set(SURVEY_SECTIONS.flatMap((_, index) => questionsForSection(index).map((q) => q.key))).size, QUESTIONS.length);
});

test("display numbering reaches Y of Y and conditions change Y", () => {
  const noFunding = applicableQuestionsInDisplayOrder({ "funding.interest": "No" });
  assert.equal(noFunding.some((question) => question.key === "funding.purposes"), false);
  const withFunding = applicableQuestionsInDisplayOrder({ "funding.interest": "Yes" });
  assert.equal(withFunding.length, noFunding.length + 1);
  assert.equal(withFunding.indexOf(withFunding.at(-1)!) + 1, withFunding.length);
});

test("back crosses a section boundary to the previous applicable card", () => {
  const answers = { "funding.interest": "No" };
  const businessProfileFirst = questionsForSection(1).find((question) => question.key === "business.activity_model")!;
  const previous = adjacentApplicableQuestion(businessProfileFirst.key, answers, -1);
  assert.equal(previous?.key, "income.passive_types");
});

test("question-key resume values resolve to their owning section", () => {
  assert.equal(sectionIndexForStep("workspace.primary_work_location"), 3);
  assert.equal(sectionIndexForStep("equipment.balance_ownership"), 5);
});
