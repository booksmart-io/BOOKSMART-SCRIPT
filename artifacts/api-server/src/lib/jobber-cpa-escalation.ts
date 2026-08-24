import type { JobberMonitoringRecord } from "./jobber-monitoring";

export const JOBBER_CPA_ESCALATION_MIN_AMOUNT = 5_000;
export const JOBBER_CPA_ESCALATION_MIN_DAYS = 14;

export type JobberCpaEscalationCandidate = {
  candidateKey: string;
  title: string;
  description: string;
  amount: number;
  ageDays: number;
  sourceIds: string[];
  directUrl: string | null;
  accountingEffect: "none";
};

export function evaluateJobberCpaEscalationPreview(records: JobberMonitoringRecord[], now = new Date()): JobberCpaEscalationCandidate[] {
  return records.flatMap((record) => {
    if (record.is_archived || record.object_type !== "jobs" || record.status !== "requires_invoicing") return [];
    const rawAmount = record.payload.uninvoicedTotal;
    const amount = typeof rawAmount === "number" || typeof rawAmount === "string" ? Number(rawAmount) : Number.NaN;
    const completedAt = typeof record.payload.completedAt === "string" ? record.payload.completedAt : null;
    const completedMs = completedAt ? new Date(completedAt).getTime() : Number.NaN;
    if (!Number.isFinite(amount) || amount < JOBBER_CPA_ESCALATION_MIN_AMOUNT || !Number.isFinite(completedMs)) return [];
    const ageDays = Math.floor((now.getTime() - completedMs) / 86_400_000);
    if (ageDays < JOBBER_CPA_ESCALATION_MIN_DAYS) return [];
    const label = record.record_number ? `#${record.record_number}` : record.title || "record";
    return [{
      candidateKey: `jobber:cpa:material-uninvoiced:${record.external_id}`,
      title: `Material Jobber work remains uninvoiced for review`,
      description: `Jobber job ${label} has ${amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} explicitly marked as uninvoiced ${ageDays} days after its recorded completion date. This is operational evidence and is not recognized BookSmart revenue.`,
      amount, ageDays, sourceIds: [record.external_id], directUrl: record.direct_url, accountingEffect: "none",
    }];
  });
}

export function jobberCpaSharingEligibility(input: { consentEnabled: boolean; activeApprovedCpaEngagement: boolean }) {
  const reasons: string[] = [];
  if (!input.consentEnabled) reasons.push("owner_consent_required");
  if (!input.activeApprovedCpaEngagement) reasons.push("active_approved_cpa_engagement_required");
  return { eligible: reasons.length === 0, reasons };
}
