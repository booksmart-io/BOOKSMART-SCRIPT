import type { MonitoringSignal } from "@/lib/monitoring-client";

export const CPA_SHARED_ACCESS = [
  "Canonical financial summaries and trends",
  "Approved transaction data used by those summaries",
  "Monitoring tasks assigned to the CPA or marked for CPA review",
  "Planning readiness and configured planning inputs",
] as const;

export function needsCpaAttention(signal: Pick<MonitoringSignal, "status" | "requires_cpa_review" | "cpa_review_level">) {
  return signal.status === "active"
    && signal.requires_cpa_review === true
    && ["optional", "recommended", "urgent"].includes(signal.cpa_review_level);
}
