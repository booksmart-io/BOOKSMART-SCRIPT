import type { SignalCandidate } from "./monitoring";

export const JOBBER_UNINVOICED_HIGH_THRESHOLD = 5_000;
export const JOBBER_UNSCHEDULED_HIGH_COUNT = 5;

export type JobberMonitoringRecord = {
  external_id: string;
  object_type: "jobs" | "scheduled_items" | "quotes" | "invoices";
  record_number: string | null;
  status: string | null;
  title: string | null;
  amount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  source_created_at: string | null;
  source_updated_at: string | null;
  direct_url: string | null;
  is_archived: boolean;
  payload: Record<string, unknown>;
};

export function jobberMonitoringOrganizationIds(env: NodeJS.ProcessEnv = process.env): Set<number> {
  return new Set(String(env.JOBBER_MONITORING_ORGANIZATION_IDS ?? "")
    .split(",")
    .map(value => Number(value.trim()))
    .filter(value => Number.isSafeInteger(value) && value > 0));
}

export function jobberMonitoringPreviewOrganizationIds(env: NodeJS.ProcessEnv = process.env): Set<number> {
  return new Set(String(env.JOBBER_MONITORING_PREVIEW_ORGANIZATION_IDS ?? "")
    .split(",")
    .map(value => Number(value.trim()))
    .filter(value => Number.isSafeInteger(value) && value > 0));
}

export function jobberMonitoringPreviewEnabled(organizationId: number, env: NodeJS.ProcessEnv = process.env): boolean {
  return env.JOBBER_MONITORING_ENABLED === "true" && jobberMonitoringPreviewOrganizationIds(env).has(organizationId);
}

export function jobberMonitoringEnabled(organizationId: number, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.JOBBER_MONITORING_ENABLED !== "true" || !Number.isSafeInteger(organizationId) || organizationId <= 0) return false;
  if (env.JOBBER_MONITORING_ROLLOUT === "all") return true;
  return jobberMonitoringOrganizationIds(env).has(organizationId);
}

const daysSince = (value: unknown, now: Date) => {
  if (typeof value !== "string") return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.floor((now.getTime() - timestamp) / 86_400_000) : null;
};

const base = (record: JobberMonitoringRecord) => ({
  comparisonValue: null,
  percentage: null,
  ctaLabel: "Review Jobber record",
  ctaRoute: "/user/jobber-records",
  requiresCpaReview: false,
  cpaReviewLevel: "none" as const,
  sourceIds: [record.external_id],
  confidence: 1,
  provider: "jobber" as const,
  directUrl: record.direct_url,
  sourceRecordType: record.object_type,
  calculationVersion: "jobber-operational-v1",
});

export function evaluateJobberOperationalRecords(records: JobberMonitoringRecord[], now = new Date()): SignalCandidate[] {
  const signals: SignalCandidate[] = [];
  for (const record of records) {
    if (record.is_archived) continue;
    if (record.object_type === "jobs" && record.status === "requires_invoicing") {
      const uninvoiced = Number(record.payload.uninvoicedTotal);
      if (Number.isFinite(uninvoiced) && uninvoiced > 0) signals.push({
        ...base(record), signalKey: `jobber:requires-invoicing:${record.external_id}`,
        signalType: "bookkeeping", category: "bookkeeping", severity: uninvoiced >= JOBBER_UNINVOICED_HIGH_THRESHOLD ? "high" : "medium",
        title: `Job ${record.record_number ? `#${record.record_number}` : record.title || ""} needs invoicing`.trim(),
        description: `Jobber reports ${uninvoiced.toLocaleString("en-US", { style: "currency", currency: "USD" })} as uninvoiced operational work. This is not counted as BookSmart revenue.`,
        currentValue: uninvoiced, recommendedAction: "Review the job in Jobber and create or confirm the appropriate invoice.",
      });
    }
    if (record.object_type === "invoices" && ["awaiting_payment", "past_due", "sent_not_due"].includes(record.status ?? "")) {
      const balance = Number(record.payload.amounts && typeof record.payload.amounts === "object" ? (record.payload.amounts as Record<string, unknown>).invoiceBalance : record.amount ?? 0);
      if (!Number.isFinite(balance) || balance <= 0) continue;
      const dueDays = daysSince(record.payload.dueDate, now);
      const overdue = record.status === "past_due" || (dueDays !== null && dueDays > 0);
      signals.push({
        ...base(record), signalKey: `jobber:outstanding-invoice:${record.external_id}`,
        signalType: "bookkeeping", category: "cash_flow", severity: overdue ? "high" : "medium",
        title: `${overdue ? "Overdue" : "Outstanding"} Jobber invoice ${record.record_number ? `#${record.record_number}` : ""}`.trim(),
        description: `Jobber shows an outstanding operational balance of ${balance.toLocaleString("en-US", { style: "currency", currency: "USD" })}${overdue && dueDays !== null ? `, ${dueDays} day${dueDays === 1 ? "" : "s"} past due` : ""}. It is not added to BookSmart accounting revenue.`,
        currentValue: balance, recommendedAction: overdue ? "Review collection status and follow up with the customer in Jobber." : "Review the invoice status and expected collection date in Jobber.",
      });
    }
    if (record.object_type === "quotes" && record.status === "awaiting_response") {
      const waitingDays = daysSince(record.payload.transitionedAt ?? record.source_updated_at, now);
      if (waitingDays === null || waitingDays < 7) continue;
      signals.push({
        ...base(record), signalKey: `jobber:quote-follow-up:${record.external_id}`,
        signalType: "trend", category: "revenue", severity: waitingDays >= 21 ? "high" : "medium",
        title: `Quote ${record.record_number ? `#${record.record_number}` : record.title || ""} is awaiting a response`.trim(),
        description: `This Jobber quote has been awaiting a customer response for ${waitingDays} days. It remains operational pipeline and is not counted as revenue.`,
        currentValue: waitingDays, recommendedAction: "Review the quote and follow up with the customer in Jobber.",
      });
    }
  }
  return signals;
}

const at = (value: string | null) => value ? new Date(value).getTime() : Number.NaN;

export function evaluateJobberOperationalPlanning(records: JobberMonitoringRecord[], now = new Date()): SignalCandidate[] {
  const active = records.filter(record => !record.is_archived);
  const nowMs = now.getTime();
  const inDays = (days: number) => nowMs + days * 86_400_000;
  const upcoming = active.filter(record => record.object_type === "scheduled_items" &&
    !["completed", "cancelled"].includes(record.status ?? "") && at(record.starts_at) >= nowMs && at(record.starts_at) <= inDays(30));
  const upcomingSeven = upcoming.filter(record => at(record.starts_at) <= inDays(7));
  const signals: SignalCandidate[] = [];

  if (upcoming.length > 0) signals.push({
    signalKey: "jobber:upcoming-workload", signalType: "trend", category: "bookkeeping", severity: "info",
    title: `${upcomingSeven.length} visit${upcomingSeven.length === 1 ? "" : "s"} scheduled in the next 7 days`,
    description: `Jobber shows ${upcoming.length} scheduled visit${upcoming.length === 1 ? "" : "s"} across the next 30 days. This is operational workload, not recognized revenue.`,
    currentValue: upcomingSeven.length, comparisonValue: upcoming.length, percentage: null,
    recommendedAction: "Review upcoming assignments and capacity in Jobber.", ctaLabel: "Review Jobber visits", ctaRoute: "/user/jobber-records",
    requiresCpaReview: false, cpaReviewLevel: "none", sourceIds: upcoming.map(record => record.external_id), confidence: 1,
    provider: "jobber", sourceRecordType: "scheduled_items", calculationVersion: "jobber-operational-v1",
  });

  const unscheduled = active.filter(record => record.object_type === "jobs" && record.status === "unscheduled");
  if (unscheduled.length > 0) signals.push({
    signalKey: "jobber:unscheduled-active-jobs", signalType: "bookkeeping", category: "bookkeeping",
    severity: unscheduled.length >= JOBBER_UNSCHEDULED_HIGH_COUNT ? "high" : "medium",
    title: `${unscheduled.length} active Jobber job${unscheduled.length === 1 ? " is" : "s are"} unscheduled`,
    description: "These operational jobs do not currently have scheduled work in Jobber.",
    currentValue: unscheduled.length, comparisonValue: null, percentage: null,
    recommendedAction: "Review the jobs and schedule the next visit or place the work on hold.", ctaLabel: "Review Jobber jobs", ctaRoute: "/user/jobber-records",
    requiresCpaReview: false, cpaReviewLevel: "none", sourceIds: unscheduled.map(record => record.external_id), confidence: 1,
    provider: "jobber", sourceRecordType: "jobs", calculationVersion: "jobber-operational-v1",
  });

  const jobs = active.filter(record => record.object_type === "jobs" && Number.isFinite(at(record.source_created_at)));
  const currentStart = nowMs - 30 * 86_400_000;
  const previousStart = nowMs - 60 * 86_400_000;
  const hasHistory = jobs.length >= 10 && jobs.some(record => at(record.source_created_at) <= previousStart);
  if (hasHistory) {
    const current = jobs.filter(record => at(record.source_created_at) > currentStart && at(record.source_created_at) <= nowMs);
    const previous = jobs.filter(record => at(record.source_created_at) > previousStart && at(record.source_created_at) <= currentStart);
    if (previous.length > 0) {
      const percentage = Math.round(((current.length - previous.length) / previous.length) * 1000) / 10;
      if (Math.abs(percentage) >= 25) signals.push({
        signalKey: "jobber:job-volume-trend", signalType: "trend", category: "bookkeeping", severity: percentage < 0 ? "medium" : "positive",
        title: `Job volume ${percentage < 0 ? "declined" : "increased"} ${Math.abs(percentage)}%`,
        description: `Jobber contains ${current.length} jobs created in the latest 30 days versus ${previous.length} in the preceding 30 days. This is operational activity, not accounting revenue.`,
        currentValue: current.length, comparisonValue: previous.length, percentage,
        recommendedAction: percentage < 0 ? "Review demand, quote conversion, and upcoming capacity." : "Review capacity for the increased operational workload.",
        ctaLabel: "Review Jobber jobs", ctaRoute: "/user/jobber-records", requiresCpaReview: false, cpaReviewLevel: "none",
        sourceIds: [...current, ...previous].map(record => record.external_id), confidence: 1, provider: "jobber", sourceRecordType: "jobs", calculationVersion: "jobber-operational-v1",
      });
    }
  }
  return signals;
}

export function evaluateJobberMonitoringPreview(records: JobberMonitoringRecord[], now = new Date()): SignalCandidate[] {
  return [...evaluateJobberOperationalRecords(records, now), ...evaluateJobberOperationalPlanning(records, now)];
}

export function isApprovedJobberSignalKey(signalKey: string): boolean {
  return signalKey.startsWith("jobber:requires-invoicing:") || signalKey === "jobber:unscheduled-active-jobs";
}

export function isJobberLifecycleKey(signalKey: string): boolean {
  // Previously persisted Jobber preview keys remain
  // lifecycle-managed only so they can resolve cleanly. They are never emitted
  // by evaluateApprovedJobberCandidates.
  return signalKey.startsWith("jobber:");
}

export function evaluateApprovedJobberCandidates(records: JobberMonitoringRecord[], now = new Date()): SignalCandidate[] {
  return evaluateJobberMonitoringPreview(records, now).filter(candidate => isApprovedJobberSignalKey(candidate.signalKey));
}
