export const SURVEY_VERSION = 2;
export const LEGACY_SURVEY_VERSION = 1;
export const PRIMARY_WORK_LOCATION_OPTIONS = ["My Home", "Commercial Office", "Both (Home & Office)"] as const;
export type SurveyKey = "business_survey" | "balance_sheet_profile";
export type SurveyStatus = "not_started" | "in_progress" | "completed" | "completed_with_skips";

export type SurveyAnswers = Record<string, unknown>;

export type QuestionDefinition = {
  key: string;
  surveyKey: SurveyKey;
  stepKey: string;
  introducedIn?: number;
  applicable?: (answers: SurveyAnswers) => boolean;
};

const hasVehicle = (a: SurveyAnswers) =>
  typeof a["vehicle.ownership"] === "string" && a["vehicle.ownership"] !== "No Business Vehicle";
const hasHomeOffice = (a: SurveyAnswers) =>
  a["workspace.home_office_type"] === "Dedicated Room (Exclusive Use)"
  || a["workspace.home_office_type"] === "Shared Space (Non-Exclusive)";
const hasEquipment = (a: SurveyAnswers) => a["equipment.ownership"] === true;
const hasSelectedDebt = (a: SurveyAnswers) =>
  Array.isArray(a["liabilities.selected"]) && a["liabilities.selected"].length > 0;
const wantsFunding = (a: SurveyAnswers) =>
  a["funding.interest"] === "Yes" || a["funding.interest"] === "Maybe / exploring options";

export const QUESTIONS: QuestionDefinition[] = [
  { key: "tax.filing_status", surveyKey: "business_survey", stepKey: "business.legal_tax", introducedIn: 1 },
  { key: "tax.primary_business_state", surveyKey: "business_survey", stepKey: "business.legal_tax", introducedIn: 1 },
  { key: "tax.residency_status", surveyKey: "business_survey", stepKey: "business.legal_tax" },
  { key: "tax.multi_state_activity", surveyKey: "business_survey", stepKey: "business.legal_tax" },
  { key: "income.primary_types", surveyKey: "business_survey", stepKey: "business.income" },
  { key: "income.passive_types", surveyKey: "business_survey", stepKey: "business.income" },
  { key: "business.activity_model", surveyKey: "business_survey", stepKey: "business.phase1_profile", introducedIn: 2 },
  { key: "tax.issues_1099s", surveyKey: "business_survey", stepKey: "business.phase1_profile", introducedIn: 2 },
  { key: "accounting.software", surveyKey: "business_survey", stepKey: "business.phase1_profile", introducedIn: 2 },
  { key: "strategy.business_goals", surveyKey: "business_survey", stepKey: "business.phase1_profile", introducedIn: 2 },
  { key: "funding.interest", surveyKey: "business_survey", stepKey: "business.phase1_profile", introducedIn: 2 },
  { key: "funding.purposes", surveyKey: "business_survey", stepKey: "business.phase1_profile", introducedIn: 2, applicable: wantsFunding },
  { key: "team.structure", surveyKey: "business_survey", stepKey: "business.people_accounting" },
  { key: "accounting.method", surveyKey: "business_survey", stepKey: "business.people_accounting" },
  { key: "equipment.ownership", surveyKey: "business_survey", stepKey: "business.people_accounting" },
  { key: "vehicle.ownership", surveyKey: "business_survey", stepKey: "business.vehicle" },
  { key: "vehicle.deduction_method", surveyKey: "business_survey", stepKey: "business.vehicle", applicable: hasVehicle },
  { key: "vehicle.over_6000_lbs", surveyKey: "business_survey", stepKey: "business.vehicle", applicable: hasVehicle },
  { key: "workspace.home_office_type", surveyKey: "business_survey", stepKey: "business.workspace" },
  { key: "workspace.home_status", surveyKey: "business_survey", stepKey: "business.workspace", applicable: hasHomeOffice },
  { key: "workspace.tech_usage", surveyKey: "business_survey", stepKey: "business.workspace" },
  { key: "property.interests", surveyKey: "business_survey", stepKey: "business.real_estate" },
  { key: "property.hosts_home_meetings", surveyKey: "business_survey", stepKey: "business.real_estate", applicable: hasHomeOffice },
  { key: "health.insurance", surveyKey: "business_survey", stepKey: "business.health_family" },
  { key: "health.savings", surveyKey: "business_survey", stepKey: "business.health_family" },
  { key: "family.education_support", surveyKey: "business_survey", stepKey: "business.health_family" },
  { key: "strategy.tax_goal", surveyKey: "business_survey", stepKey: "business.strategy" },
  { key: "strategy.retirement", surveyKey: "business_survey", stepKey: "business.strategy" },
  { key: "strategy.audit_appetite", surveyKey: "business_survey", stepKey: "business.strategy" },
  { key: "workspace.home_business_use_percent", surveyKey: "business_survey", stepKey: "business.deduction_percentages", applicable: hasHomeOffice },
  { key: "vehicle.business_use_percent", surveyKey: "business_survey", stepKey: "business.deduction_percentages", applicable: hasVehicle },
  { key: "workspace.utility_business_use_percent", surveyKey: "business_survey", stepKey: "business.deduction_percentages", applicable: hasHomeOffice },
  { key: "equipment.spending_this_year", surveyKey: "business_survey", stepKey: "business.equipment_debts", applicable: hasEquipment },
  { key: "liabilities.selected", surveyKey: "business_survey", stepKey: "business.equipment_debts" },

  { key: "workspace.primary_work_location", surveyKey: "balance_sheet_profile", stepKey: "balance.work_location" },
  { key: "workspace.total_home_sqft", surveyKey: "balance_sheet_profile", stepKey: "balance.home_sqft", applicable: hasHomeOffice },
  { key: "workspace.home_allocation_percent", surveyKey: "balance_sheet_profile", stepKey: "balance.home_percent", applicable: hasHomeOffice },
  { key: "vehicle.balance_business_use_percent", surveyKey: "balance_sheet_profile", stepKey: "balance.vehicle_percent", applicable: hasVehicle },
  { key: "workspace.phone_business_use_percent", surveyKey: "balance_sheet_profile", stepKey: "balance.phone_percent", applicable: (a) => Array.isArray(a["workspace.tech_usage"]) && a["workspace.tech_usage"].includes("Personal Phone for Business") },
  { key: "workspace.internet_business_use_percent", surveyKey: "balance_sheet_profile", stepKey: "balance.internet_percent", applicable: (a) => Array.isArray(a["workspace.tech_usage"]) && a["workspace.tech_usage"].includes("Home Internet for Business") },
  { key: "workspace.balance_utility_percent", surveyKey: "balance_sheet_profile", stepKey: "balance.utility_percent", applicable: hasHomeOffice },
  { key: "equipment.balance_ownership", surveyKey: "balance_sheet_profile", stepKey: "balance.equipment_ownership" },
  { key: "equipment.current_value", surveyKey: "balance_sheet_profile", stepKey: "balance.equipment_value", applicable: hasEquipment },
  { key: "assets.has_receivables", surveyKey: "balance_sheet_profile", stepKey: "balance.receivables" },
  { key: "assets.has_inventory", surveyKey: "balance_sheet_profile", stepKey: "balance.inventory" },
  { key: "liabilities.has_debt", surveyKey: "balance_sheet_profile", stepKey: "balance.debt_presence" },
  { key: "liabilities.balances", surveyKey: "balance_sheet_profile", stepKey: "balance.debt_balances", applicable: hasSelectedDebt },
  { key: "equity.owner_contributed", surveyKey: "balance_sheet_profile", stepKey: "balance.owner_contribution" },
  { key: "equity.owner_contribution_details", surveyKey: "balance_sheet_profile", stepKey: "balance.owner_contribution_details", applicable: (a) => a["equity.owner_contributed"] === true },
  { key: "equity.owner_draws", surveyKey: "balance_sheet_profile", stepKey: "balance.owner_draws" },
];

export const STEP_KEYS = [...new Set(QUESTIONS.map((question) => question.stepKey))];

export function questionsForStep(stepKey: string) {
  return QUESTIONS.filter((question) => question.stepKey === stepKey);
}

export function isApplicable(question: QuestionDefinition, answers: SurveyAnswers) {
  return question.applicable ? question.applicable(answers) : true;
}

export function meaningfulAnswer(value: unknown) {
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(meaningfulAnswer);
  }
  return false;
}

export type ProgressState = {
  answered: Set<string>;
  skipped: Set<string>;
};

export function progressAfterQuestionAnswer(progress: ProgressState, questionKey: string): ProgressState {
  const answered = new Set(progress.answered);
  const skipped = new Set(progress.skipped);
  answered.add(questionKey);
  skipped.delete(questionKey);
  return { answered, skipped };
}

export function progressAfterQuestionSkip(progress: ProgressState, questionKey: string): ProgressState {
  const answered = new Set(progress.answered);
  const skipped = new Set(progress.skipped);
  answered.delete(questionKey);
  skipped.add(questionKey);
  return { answered, skipped };
}

export type SurveySaveLock = { current: boolean };

export function acquireSurveySaveLock(lock: SurveySaveLock) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseSurveySaveLock(lock: SurveySaveLock) {
  lock.current = false;
}

export async function persistSurveyQuestionInOrder(options: {
  saveAnswer: () => Promise<void>;
  saveProgress: () => Promise<void>;
  onSuccess: () => void;
}) {
  await options.saveAnswer();
  await options.saveProgress();
  options.onSuccess();
}

export function calculateSurveyStatus(
  surveyKey: SurveyKey,
  answers: SurveyAnswers,
  progress: ProgressState,
): SurveyStatus {
  const applicable = QUESTIONS.filter((question) => question.surveyKey === surveyKey && isApplicable(question, answers));
  const resolved = applicable.filter((question) => progress.answered.has(question.key) || progress.skipped.has(question.key));
  if (resolved.length === 0) return "not_started";
  if (resolved.length < applicable.length) return "in_progress";
  return applicable.some((question) => progress.skipped.has(question.key)) ? "completed_with_skips" : "completed";
}

export function firstIncompleteStep(
  answers: SurveyAnswers,
  progress: ProgressState,
) {
  return STEP_KEYS.find((stepKey) =>
    questionsForStep(stepKey).some((question) =>
      isApplicable(question, answers)
      && !progress.answered.has(question.key)
      && !progress.skipped.has(question.key)
    )
  ) ?? null;
}

export function inferLegacyProgress(answers: SurveyAnswers): ProgressState {
  return {
    answered: new Set(QUESTIONS.filter((question) => meaningfulAnswer(answers[question.key])).map((question) => question.key)),
    skipped: new Set(),
  };
}

export function finalizeApplicableProgress(
  answers: SurveyAnswers,
  progress: ProgressState,
): ProgressState {
  const answered = new Set(progress.answered);
  const skipped = new Set(progress.skipped);
  for (const question of QUESTIONS) {
    if (
      isApplicable(question, answers)
      && !answered.has(question.key)
      && !skipped.has(question.key)
    ) {
      skipped.add(question.key);
    }
  }
  return { answered, skipped };
}
