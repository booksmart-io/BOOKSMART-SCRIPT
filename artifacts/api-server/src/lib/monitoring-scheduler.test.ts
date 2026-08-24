import assert from "node:assert/strict";
import test from "node:test";
import { monitoringIntervalMinutes, monitoringRunStatus, scheduledMonitoringHealth, scheduledRunKey, validMonitoringSecret } from "./monitoring-scheduler";

test("scheduled endpoint can authenticate without a user session using only the configured secret", () => {
  assert.equal(validMonitoringSecret("strong-secret", "strong-secret"), true);
  assert.equal(validMonitoringSecret("wrong-secret", "strong-secret"), false);
  assert.equal(validMonitoringSecret(undefined, "strong-secret"), false);
});

test("scheduler health distinguishes configuration, execution, failure, and overdue states", () => {
  const base = { intervalMinutes: 1440, leaseMinutes: 30, nowMs: Date.parse("2026-08-14T12:10:00Z") };
  assert.equal(scheduledMonitoringHealth({ ...base, secretConfigured: false }).status, "not_configured");
  assert.equal(scheduledMonitoringHealth({ ...base, secretConfigured: true }).status, "never_run");
  assert.equal(scheduledMonitoringHealth({ ...base, secretConfigured: true, latest: { status: "completed", started_at: "2026-08-13T12:00:00Z" } }).status, "healthy");
  assert.equal(scheduledMonitoringHealth({ ...base, secretConfigured: true, latest: { status: "partial", started_at: "2026-08-13T12:00:00Z" } }).status, "partial");
  assert.equal(scheduledMonitoringHealth({ ...base, secretConfigured: true, latest: { status: "failed", started_at: "2026-08-13T12:00:00Z" } }).status, "failed");
  assert.equal(scheduledMonitoringHealth({ ...base, secretConfigured: true, latest: { status: "running", started_at: "2026-08-14T12:00:00Z" } }).status, "running");
  assert.equal(scheduledMonitoringHealth({ ...base, secretConfigured: true, nowMs: Date.parse("2026-08-14T13:00:00Z"), latest: { status: "running", started_at: "2026-08-14T12:00:00Z" } }).status, "stalled");
  assert.equal(scheduledMonitoringHealth({ ...base, secretConfigured: true, nowMs: Date.parse("2026-08-14T13:00:01Z"), latest: { status: "completed", started_at: "2026-08-13T12:00:00Z" } }).status, "overdue");
});

test("scheduled retries in one interval receive the same deterministic run key", () => {
  const interval = monitoringIntervalMinutes("1440");
  assert.equal(scheduledRunKey(interval, 1_786_500_000_000), scheduledRunKey(interval, 1_786_500_001_000));
  assert.equal(scheduledRunKey(interval, 1, "render-run-123"), "scheduled:render-run-123");
  assert.equal(monitoringIntervalMinutes("2"), 1440);
});

test("per-organization failures produce partial or failed audit status", () => {
  assert.equal(monitoringRunStatus(4, 0), "completed");
  assert.equal(monitoringRunStatus(3, 1), "partial");
  assert.equal(monitoringRunStatus(0, 2), "failed");
});
