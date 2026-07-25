export function dashboardSurveyRowsForCurrentVersion(
  rows: Array<{ survey_version: number; status: string; current_section_key: string | null }>,
  currentVersion: number,
) {
  const current = rows.filter((row) => row.survey_version === currentVersion);
  if (current.length) return current;
  const legacy = rows.filter((row) => row.survey_version < currentVersion);
  if (!legacy.length || legacy.every((row) => row.status === "not_started")) return [];
  return [{
    survey_version: currentVersion,
    status: "in_progress",
    current_section_key: legacy.find((row) => row.current_section_key)?.current_section_key ?? null,
    legacyUpgradeRequired: true,
  }];
}

export function dashboardOnboarding(input: {
  accountExists: boolean;
  businessInformationComplete: boolean;
  surveyStatuses: string[];
  surveyReachedEnd?: boolean;
  connectedBankCount: number;
  transactionCount: number;
}) {
  const surveyComplete = input.surveyStatuses.length >= 2
    && (
      input.surveyStatuses.every((status) => status === "completed" || status === "completed_with_skips")
      || (input.surveyReachedEnd === true && input.surveyStatuses.every((status) => status !== "not_started"))
    );
  const completedWithSkips = surveyComplete && (
    input.surveyReachedEnd === true
    || input.surveyStatuses.some((status) => status === "completed_with_skips")
  );
  const surveyInProgress = !surveyComplete && input.surveyStatuses.some((status) => status === "in_progress");
  const surveyLabel = surveyComplete
    ? (completedWithSkips ? "Completed with skips" : "Completed")
    : (surveyInProgress ? "In progress" : "Not started");
  const milestones = [
    input.accountExists, input.businessInformationComplete, surveyComplete,
    input.connectedBankCount > 0, input.transactionCount > 0,
  ];
  const completedCount = milestones.filter(Boolean).length;
  return {
    surveyComplete,
    surveyInProgress,
    surveyLabel,
    completedCount,
    percent: Math.round((completedCount / milestones.length) * 100),
    nextAction: (!surveyComplete
      ? "survey"
      : input.connectedBankCount === 0
        ? "bank"
        : input.transactionCount === 0 ? "transactions" : "complete") as "survey" | "bank" | "transactions" | "complete",
  };
}
