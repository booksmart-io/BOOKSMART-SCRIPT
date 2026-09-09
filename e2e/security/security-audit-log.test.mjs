import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import test from "node:test";
const require = createRequire(new URL("../../.tmp/transaction-policy-validation/package.json", import.meta.url));
const { PGlite } = require("@electric-sql/pglite");
const migration = readFileSync(new URL("../../artifacts/booksmart/supabase/20260908_security_audit_log.sql", import.meta.url), "utf8");

test("security audit records are private, append-only, deduplicated and retention-purgeable", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role");
    await db.exec(migration);
    const hash = "a".repeat(64);
    await db.query("INSERT INTO security_audit_events(event_key,event_type,outcome,actor_fingerprint,source,metadata) VALUES($1,'data_export','succeeded',$2,'api',$3)", ["e".repeat(64), hash, { action: "download" }]);
    await assert.rejects(db.query("UPDATE security_audit_events SET outcome='failed'"), /append-only/);
    await assert.rejects(db.query("DELETE FROM security_audit_events"), /append-only/);
    await assert.rejects(db.query("INSERT INTO security_audit_events(event_key,event_type,outcome,source) VALUES($1,'data_export','succeeded','api')", ["e".repeat(64)]));
    await db.query("INSERT INTO security_audit_events(event_key,event_type,outcome,source,retain_until) VALUES($1,'session_signed_out','succeeded','web',now()-interval '1 day')", ["f".repeat(64)]);
    const purge = await db.query("SELECT purge_expired_security_audit_events() AS removed");
    assert.equal(Number(purge.rows[0].removed), 1);
    const remaining = await db.query("SELECT count(*)::int AS count FROM security_audit_events");
    assert.equal(remaining.rows[0].count, 1);
    const grants = await db.query("SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_name='security_audit_events' AND grantee IN ('anon','authenticated')");
    assert.equal(grants.rows.length, 0);
  } finally { await db.close(); }
});
