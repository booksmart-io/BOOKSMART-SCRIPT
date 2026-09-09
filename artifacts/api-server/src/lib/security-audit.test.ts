import test from "node:test";
import assert from "node:assert/strict";
import { auditFingerprint, safeSecurityAuditMetadata, writeSecurityAuditEvent } from "./security-audit";
import { describeSecuritySensitiveRequest } from "../middlewares/security-audit";

process.env.SECURITY_AUDIT_HMAC_KEY = "synthetic-audit-test-key-with-enough-entropy";

test("audit fingerprints are stable, typed and irreversible representations", () => {
  const first = auditFingerprint("actor", "user-1");
  assert.match(first!, /^[0-9a-f]{64}$/);
  assert.equal(first, auditFingerprint("actor", "user-1"));
  assert.notEqual(first, auditFingerprint("organization", "user-1"));
  assert.notEqual(first, auditFingerprint("actor", "user-2"));
  assert.equal(first?.includes("user-1"), false);
});

test("metadata allowlist excludes secrets, nested objects, long values and unknown fields", () => {
  const safe = safeSecurityAuditMetadata({ action: "disconnect", provider: "gmail", status_code: 200,
    authorization: "Bearer secret", access_token: "secret", error: "provider details", nested: { password: "secret" },
    role: "x".repeat(121) });
  assert.deepEqual(safe, { action: "disconnect", provider: "gmail", status_code: 200 });
  assert.equal(JSON.stringify(safe).includes("secret"), false);
});

test("security route classification is explicit and ignores ordinary data reads", () => {
  assert.deepEqual(describeSecuritySensitiveRequest("POST", "/api/account/export"), { eventType: "data_export", action: "download" });
  assert.deepEqual(describeSecuritySensitiveRequest("POST", "/api/integrations/gmail/disconnect"), { eventType: "integration_connection", provider: "gmail", action: "disconnect" });
  assert.deepEqual(describeSecuritySensitiveRequest("GET", "/api/integrations/jobber/callback"), { eventType: "integration_connection", provider: "jobber", action: "callback" });
  assert.equal(describeSecuritySensitiveRequest("GET", "/api/financial-summary"), null);
});

test("audit writer stores only hashes and safe metadata and deduplicates by event key", async () => {
  let payload: any;
  const query: any = { then(resolve: any) { return Promise.resolve({ error: null }).then(resolve); } };
  const client: any = { from(table: string) { assert.equal(table, "security_audit_events"); return { upsert(value: any, options: any) {
    payload = value; assert.deepEqual(options, { onConflict: "event_key", ignoreDuplicates: true }); return query;
  } }; } };
  await writeSecurityAuditEvent(client, { eventType: "data_export", outcome: "succeeded", actorAuthId: "private-user",
    organizationId: 9, target: "private-target", eventKey: "stable-event", metadata: { action: "download", access_token: "secret" } });
  assert.equal(JSON.stringify(payload).includes("private-user"), false);
  assert.equal(JSON.stringify(payload).includes("private-target"), false);
  assert.equal(JSON.stringify(payload).includes("secret"), false);
  assert.match(payload.actor_fingerprint, /^[0-9a-f]{64}$/);
});
