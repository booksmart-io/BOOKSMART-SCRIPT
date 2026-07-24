import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  SURVEY_VERSION,
  QUESTIONS,
  calculateSurveyStatus,
  firstIncompleteStep,
  inferLegacyProgress,
  questionsForStep,
  type ProgressState,
  type SurveyAnswers,
  type SurveyKey,
} from "@/lib/survey-progress";

type ProgressRow = {
  survey_key: SurveyKey;
  status: string;
  current_section_key: string | null;
  answered_question_keys: string[] | null;
  skipped_question_keys: string[] | null;
  started_at?: string | null;
};

export function useSurveyProgress(orgId: number | null, open: boolean, ready: boolean, answers: SurveyAnswers) {
  const [progress, setProgress] = useState<ProgressState>({ answered: new Set(), skipped: new Set() });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasStoredProgress, setHasStoredProgress] = useState(false);
  const [startedAt, setStartedAt] = useState<Partial<Record<SurveyKey, string>>>({});

  useEffect(() => {
    if (!open || !orgId || !ready) return;
    let cancelled = false;
    setLoading(true);
    setLoaded(false);
    supabase
      .from("organization_survey_progress")
      .select("survey_key,status,current_section_key,answered_question_keys,skipped_question_keys,started_at")
      .eq("organization_id", orgId)
      .eq("survey_version", SURVEY_VERSION)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("Unable to load survey progress:", error.message);
          setProgress(inferLegacyProgress(answers));
          setHasStoredProgress(false);
          setStartedAt({});
        } else if (data?.length) {
          const rows = data as ProgressRow[];
          setProgress({
            answered: new Set(rows.flatMap((row) => row.answered_question_keys ?? [])),
            skipped: new Set(rows.flatMap((row) => row.skipped_question_keys ?? [])),
          });
          setStartedAt(Object.fromEntries(rows.flatMap((row) => row.started_at ? [[row.survey_key, row.started_at]] : [])));
          setHasStoredProgress(true);
        } else {
          setProgress(inferLegacyProgress(answers));
          setHasStoredProgress(false);
          setStartedAt({});
        }
        setLoading(false);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [orgId, open, ready]);

  const persist = useCallback(async (
    next: ProgressState,
    currentStepKey: string | null,
    source: "user" | "legacy_inferred" = "user",
  ) => {
    if (!orgId) return;
    const now = new Date().toISOString();
    const rows = (["business_survey", "balance_sheet_profile"] as SurveyKey[]).map((surveyKey) => {
      const status = calculateSurveyStatus(surveyKey, answers, next);
      const completed = status === "completed" || status === "completed_with_skips";
      const keysForSurvey = new Set(
        QUESTIONS.filter((question) => question.surveyKey === surveyKey).map((question) => question.key),
      );
      const currentQuestion = currentStepKey ? questionsForStep(currentStepKey)[0] : undefined;
      return {
        organization_id: orgId,
        survey_key: surveyKey,
        survey_version: SURVEY_VERSION,
        status,
        current_section_key: currentQuestion?.surveyKey === surveyKey ? currentStepKey : null,
        answered_question_keys: [...next.answered].filter((key) => keysForSurvey.has(key)),
        completed_question_keys: [...next.answered].filter((key) => keysForSurvey.has(key)),
        skipped_question_keys: [...next.skipped].filter((key) => keysForSurvey.has(key)),
        started_at: status === "not_started" ? null : (startedAt[surveyKey] ?? now),
        last_saved_at: now,
        completed_at: completed ? now : null,
        completion_source: completed ? source : null,
        updated_at: now,
      };
    });
    const { error } = await supabase
      .from("organization_survey_progress")
      .upsert(rows, { onConflict: "organization_id,survey_key,survey_version" });
    if (error) throw error;
    setProgress(next);
    setStartedAt((current) => ({
      ...current,
      ...Object.fromEntries((["business_survey", "balance_sheet_profile"] as SurveyKey[])
        .filter((key) => calculateSurveyStatus(key, answers, next) !== "not_started")
        .map((key) => [key, current[key] ?? now])),
    }));
    setHasStoredProgress(true);
  }, [answers, orgId, startedAt]);

  const statuses = {
    business_survey: calculateSurveyStatus("business_survey", answers, progress),
    balance_sheet_profile: calculateSurveyStatus("balance_sheet_profile", answers, progress),
  };
  const legacyCompleteLike = !hasStoredProgress
    && Object.values(statuses).every((status) => status === "completed" || status === "completed_with_skips");

  return {
    progress,
    loading,
    loaded,
    hasStoredProgress,
    persist,
    statuses,
    legacyCompleteLike,
    resumeStepKey: firstIncompleteStep(answers, progress),
  };
}
