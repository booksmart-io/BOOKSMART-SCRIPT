import { QUESTIONS, isApplicable, type ProgressState, type SurveyAnswers } from "./survey-progress";

export const SURVEY_SECTIONS = [
  {
    key: "section.tax_basics",
    title: "Tax & Business Basics",
    description: "Your filing context, business location, and sources of income.",
    stepKeys: ["business.legal_tax", "business.income"],
  },
  {
    key: "section.team_accounting",
    title: "Team & Accounting",
    description: "How your business is staffed and how its books are maintained.",
    stepKeys: ["business.people_accounting"],
  },
  {
    key: "section.workspace_property",
    title: "Workspace & Property",
    description: "Your work location, home-office allocation, technology, and property.",
    stepKeys: [
      "business.workspace", "business.real_estate", "business.deduction_percentages",
      "balance.work_location", "balance.home_sqft", "balance.home_percent",
      "balance.phone_percent", "balance.internet_percent", "balance.utility_percent",
    ],
  },
  {
    key: "section.vehicle",
    title: "Vehicle",
    description: "Vehicle ownership, deduction method, weight, and business use.",
    stepKeys: ["business.vehicle", "balance.vehicle_percent"],
  },
  {
    key: "section.equipment_assets",
    title: "Equipment & Assets",
    description: "Equipment spending and value, receivables, and inventory.",
    stepKeys: [
      "business.equipment_debts", "balance.equipment_ownership",
      "balance.equipment_value", "balance.receivables", "balance.inventory",
    ],
  },
  {
    key: "section.debts_equity",
    title: "Debts & Owner Equity",
    description: "Business liabilities, owner contributions, and owner draws.",
    stepKeys: [
      "balance.debt_presence", "balance.debt_balances", "balance.owner_contribution",
      "balance.owner_contribution_details", "balance.owner_draws",
    ],
  },
  {
    key: "section.tax_strategy",
    title: "Tax Strategy Preferences",
    description: "Recommended for personalized AI tax strategies.",
    stepKeys: ["business.health_family", "business.strategy"],
  },
] as const;

export function sectionIndexForStep(stepKey: string | null | undefined) {
  if (!stepKey) return 0;
  const index = SURVEY_SECTIONS.findIndex((section) =>
    (section.stepKeys as readonly string[]).includes(stepKey)
  );
  return index < 0 ? 0 : index;
}

export function questionsForSection(sectionIndex: number) {
  const section = SURVEY_SECTIONS[sectionIndex];
  if (!section) return [];
  return QUESTIONS.filter((question) =>
    (section.stepKeys as readonly string[]).includes(question.stepKey)
  );
}

export function sectionCompletion(
  sectionIndex: number,
  answers: SurveyAnswers,
  progress: ProgressState,
) {
  const applicable = questionsForSection(sectionIndex).filter((question) => isApplicable(question, answers));
  const resolved = applicable.filter((question) =>
    progress.answered.has(question.key) || progress.skipped.has(question.key)
  );
  return { applicable: applicable.length, resolved: resolved.length };
}

export function applicableSurveyCompletion(answers: SurveyAnswers, progress: ProgressState) {
  const applicable = QUESTIONS.filter((question) => isApplicable(question, answers));
  const resolved = applicable.filter((question) =>
    progress.answered.has(question.key) || progress.skipped.has(question.key)
  );
  return {
    applicable: applicable.length,
    resolved: resolved.length,
    percent: applicable.length ? Math.round((resolved.length / applicable.length) * 100) : 100,
  };
}
