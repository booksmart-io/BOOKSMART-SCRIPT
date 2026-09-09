import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const migration = readFileSync(new URL("../../artifacts/booksmart/supabase/20260908_security_audit_retention_schedule.sql", import.meta.url), "utf8");

test("audit retention uses one named daily database schedule", () => {
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_cron/i);
  assert.match(migration, /cron\.schedule\(\s*'booksmart-security-audit-retention'/i);
  assert.match(migration, /'17 3 \* \* \*'/);
  assert.match(migration, /SELECT public\.purge_expired_security_audit_events\(\)/i);
});

test("audit retention schedule embeds no network destination or credential", () => {
  assert.doesNotMatch(migration, /https?:\/\//i);
  assert.doesNotMatch(migration, /(?:service_role|authorization|bearer|api[_-]?key|secret)\s*[:=]/i);
});

test("audit retention scheduling remains idempotent by stable job name", () => {
  const names = [...migration.matchAll(/booksmart-security-audit-retention/g)];
  assert.equal(names.length, 1);
});
