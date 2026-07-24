import assert from "node:assert/strict";
import test from "node:test";
import { SURVEY_SECTIONS, applicableSurveyCompletion, questionsForSection, sectionIndexForStep } from "./survey-sections";

test("consolidates the legacy flow into seven sections", () => {
  assert.equal(SURVEY_SECTIONS.length, 7);
  assert.equal(sectionIndexForStep("business.vehicle"), 3);
  assert.equal(sectionIndexForStep("balance.vehicle_percent"), 3);
  assert.equal(sectionIndexForStep("balance.debt_balances"), 5);
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
