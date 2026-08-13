import assert from "node:assert/strict";
import test from "node:test";
import { monitoringIntervalMinutes, monitoringRunStatus, scheduledRunKey, validMonitoringSecret } from "./monitoring-scheduler";

test("scheduled endpoint can authenticate without a user session using only the configured secret", () => {
  assert.equal(validMonitoringSecret("strong-secret", "strong-secret"), true);
  assert.equal(validMonitoringSecret("wrong-secret", "strong-secret"), false);
  assert.equal(validMonitoringSecret(undefined, "strong-secret"), false);
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
