import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConnectionStatus } from "./connection-status";

const now = new Date("2026-08-10T12:00:00.000Z");

test("normalizes healthy Plaid and QuickBooks connections", () => {
  const result = normalizeConnectionStatus({
    organizationId: 63,
    now,
    plaidItems: [{ id: 1, institution_name: "Test Bank", status: "active", updated_at: "2026-08-10T10:00:00.000Z" }],
    quickBooksConnections: [{ id: 2, realm_id: "abc", company_name: "Sandbox Company", status: "active", last_synced_at: "2026-08-09T10:00:00.000Z", last_sync_status: "completed" }],
  });
  assert.equal(result.status, "connected");
  assert.equal(result.totalConnections, 2);
  assert.equal(result.healthyConnections, 2);
  assert.equal(result.attentionRequired, 0);
});

test("reports stale and failed connections without treating uploads as live connections", () => {
  const result = normalizeConnectionStatus({
    organizationId: 63,
    now,
    quickBooksConnections: [{ id: 2, status: "active", last_synced_at: "2026-08-01T10:00:00.000Z", last_sync_status: "failed", last_sync_error: "Token expired" }],
    uploadedStatements: [{ created_at: "2026-08-10T08:00:00.000Z", parsed_data: { statement_workflow: { organization_id: 63, lifecycle_status: "confirmed" } } }],
  });
  assert.equal(result.status, "attention");
  assert.equal(result.totalConnections, 1);
  assert.equal(result.attentionRequired, 1);
  assert.equal(result.providers.at(-1)?.type, "uploaded_statement");
  assert.equal(result.providers.at(-1)?.status, "available");
});

test("uses Plaid synchronization health instead of treating any row update as a successful refresh", () => {
  const result = normalizeConnectionStatus({
    organizationId: 63,
    now,
    plaidItems: [{
      id: 4,
      institution_name: "Test Bank",
      status: "active",
      updated_at: "2026-08-10T11:30:00.000Z",
      last_synced_at: "2026-08-09T10:00:00.000Z",
      last_sync_status: "failed",
      last_sync_error: "Item login required",
    }],
  });
  assert.equal(result.status, "attention");
  assert.equal(result.providers[0]?.lastDataRefresh, "2026-08-09T10:00:00.000Z");
  assert.equal(result.providers[0]?.error, "Item login required");
  assert.equal(result.providers[0]?.stale, false);
});
