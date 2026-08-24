import { timingSafeEqual } from "node:crypto";

export function validMonitoringSecret(actual: string | undefined, expected: string | undefined) {
  if (!actual || !expected) return false;
  const supplied = Buffer.from(actual); const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

export function monitoringIntervalMinutes(value: unknown) {
  const parsed = Number(value ?? 1440);
  return Number.isFinite(parsed) && parsed >= 5 ? Math.floor(parsed) : 1440;
}

export function scheduledRunKey(intervalMinutes: number, nowMs: number, requestedKey?: string | null) {
  if (requestedKey && requestedKey.length >= 8 && requestedKey.length <= 200) return `scheduled:${requestedKey}`;
  return `scheduled:${intervalMinutes}:${Math.floor(nowMs / (intervalMinutes * 60_000))}`;
}

export function monitoringRunStatus(successful: number, failed: number) {
  return failed === 0 ? "completed" as const : successful > 0 ? "partial" as const : "failed" as const;
}

export type ScheduledRunSnapshot = { status: "running" | "completed" | "partial" | "failed"; started_at: string; completed_at?: string | null };

export function scheduledMonitoringHealth(input: {
  secretConfigured: boolean; intervalMinutes: number; leaseMinutes: number;
  latest?: ScheduledRunSnapshot | null; nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.secretConfigured) return { status: "not_configured" as const, next_expected_at: null, overdue_since: null };
  if (!input.latest) return { status: "never_run" as const, next_expected_at: null, overdue_since: null };
  const startedMs = new Date(input.latest.started_at).getTime();
  const nextExpectedMs = startedMs + input.intervalMinutes * 60_000;
  const overdueMs = nextExpectedMs + input.leaseMinutes * 60_000;
  const nextExpectedAt = new Date(nextExpectedMs).toISOString();
  if (input.latest.status === "running") {
    const stalled = nowMs > startedMs + input.leaseMinutes * 60_000;
    return { status: stalled ? "stalled" as const : "running" as const, next_expected_at: nextExpectedAt, overdue_since: stalled ? new Date(startedMs + input.leaseMinutes * 60_000).toISOString() : null };
  }
  if (nowMs > overdueMs) return { status: "overdue" as const, next_expected_at: nextExpectedAt, overdue_since: new Date(overdueMs).toISOString() };
  if (input.latest.status === "failed") return { status: "failed" as const, next_expected_at: nextExpectedAt, overdue_since: null };
  if (input.latest.status === "partial") return { status: "partial" as const, next_expected_at: nextExpectedAt, overdue_since: null };
  return { status: "healthy" as const, next_expected_at: nextExpectedAt, overdue_since: null };
}
