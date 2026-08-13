import assert from "node:assert/strict";
import test from "node:test";
import { classifyJobberRefreshFailure, isJobberThrottle, jobberContentHash } from "./jobber-client";
import { jobberOverlapWatermark, jobberSyncVariables, shouldStopJobPages } from "./jobber-sync";

test("incremental client sync uses an updated-at watermark and descending order", () => {
  assert.deepEqual(jobberSyncVariables("clients", "incremental", "2026-08-10T12:00:00.000Z", "next"), {
    first: 25,
    after: "next",
    sort: { key: "UPDATED_AT", direction: "DESCENDING" },
    filter: { updatedAt: { after: "2026-08-10T12:00:00.000Z" } },
  });
});

test("incremental synchronization overlaps the watermark by five minutes", () => {
  assert.equal(jobberOverlapWatermark("2026-08-10T12:00:00.000Z"), "2026-08-10T11:55:00.000Z");
  assert.equal(jobberOverlapWatermark(null), null);
});

test("full sync does not apply an updated-at filter", () => {
  const variables = jobberSyncVariables("invoices", "full", "2026-08-10T12:00:00.000Z", null);
  assert.equal("filter" in variables, false);
});

test("incremental jobs sort newest first and stop after an entirely old page", () => {
  assert.deepEqual(jobberSyncVariables("jobs", "incremental", "2026-08-10T12:00:00.000Z", null).sort, [
    { key: "UPDATED_AT", direction: "DESCENDING" },
  ]);
  assert.equal(shouldStopJobPages("jobs", "incremental", "2026-08-10T12:00:00.000Z", [
    { id: "1", updatedAt: "2026-08-10T11:00:00.000Z" },
    { id: "2", updatedAt: "2026-08-09T11:00:00.000Z" },
  ]), true);
  assert.equal(shouldStopJobPages("jobs", "incremental", "2026-08-10T12:00:00.000Z", [
    { id: "1", updatedAt: "2026-08-11T11:00:00.000Z" },
    { id: "2", updatedAt: "2026-08-09T11:00:00.000Z" },
  ]), false);
});

test("Jobber throttling is recognized by code or message", () => {
  assert.equal(isJobberThrottle([{ extensions: { code: "THROTTLED" } }]), true);
  assert.equal(isJobberThrottle([{ message: "Request was throttled" }]), true);
  assert.equal(isJobberThrottle([{ message: "Validation failed" }]), false);
});

test("record hashing is stable for idempotent upserts", () => {
  const record = { id: "client-1", name: "BookSmart Test" };
  assert.equal(jobberContentHash(record), jobberContentHash({ ...record }));
  assert.notEqual(jobberContentHash(record), jobberContentHash({ ...record, name: "Updated" }));
});

test("expired refresh authorization requires a safe reconnect", () => {
  const error = classifyJobberRefreshFailure(400, { error: "invalid_grant", error_description: "Refresh token expired" });
  assert.equal(error.code, "reauthorization_required");
  assert.equal(error.retryable, false);
  assert.match(error.message, /Reconnect Jobber/);
});

test("temporary Jobber token failures remain retryable", () => {
  const error = classifyJobberRefreshFailure(503, { error: "server_error" });
  assert.equal(error.code, "temporarily_unavailable");
  assert.equal(error.retryable, true);
  assert.match(error.message, /imported records are safe/);
});
