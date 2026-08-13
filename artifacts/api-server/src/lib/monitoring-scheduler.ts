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
