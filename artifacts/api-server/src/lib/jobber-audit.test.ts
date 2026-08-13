import assert from "node:assert/strict";
import test from "node:test";
import { safeJobberAuditMetadata, writeJobberAuditEvent } from "./jobber-audit";

test("Jobber audit metadata drops secrets and imported record content", () => {
  assert.deepEqual(safeJobberAuditMetadata({
    sync_mode: "full",
    records_scanned: 22,
    access_token: "secret",
    refresh_token: "secret",
    client_name: "Private client",
    invoice_amount: 250,
    object_counts: { jobs: 4, clients: 10 },
  }), {
    sync_mode: "full",
    records_scanned: 22,
    object_counts: { jobs: 4, clients: 10 },
  });
});

test("Jobber audit writer stores only organization-scoped append data", async () => {
  let inserted: any = null;
  const admin = {
    from(table: string) {
      assert.equal(table, "jobber_audit_events");
      return { async insert(value: unknown) { inserted = value; return { error: null }; } };
    },
  };
  await writeJobberAuditEvent(admin as any, {
    organizationId: 11,
    connectionId: 4,
    actorUserId: 700,
    eventType: "sync_completed",
    outcome: "succeeded",
    metadata: { sync_mode: "incremental", records_changed: 2, token: "never-store" },
  });
  assert.deepEqual(inserted, {
    organization_id: 11,
    connection_id: 4,
    actor_user_id: 700,
    event_type: "sync_completed",
    outcome: "succeeded",
    error_category: null,
    metadata: { sync_mode: "incremental", records_changed: 2 },
  });
});

