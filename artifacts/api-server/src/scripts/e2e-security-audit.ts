import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name}_missing`); return value; };
const url = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const auditKey = process.env.SECURITY_AUDIT_HMAC_KEY?.trim() || serviceKey;
const api = (process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8082").replace(/\/+$/, "");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function savedSession(slug: string) {
  const state = JSON.parse(readFileSync(`e2e/.auth/${slug}.json`, "utf8"));
  const entries = state.origins.flatMap((origin: any) => origin.localStorage ?? []);
  const auth = JSON.parse(entries.find((entry: any) => /^sb-.+-auth-token$/.test(entry.name))?.value ?? "null");
  if (auth?.user?.email !== `${slug}@booksmart-e2e.example.test` || !auth.refresh_token) throw new Error("synthetic_session_required");
  return { authId: auth.user.id as string, refreshToken: auth.refresh_token as string };
}
const fingerprint = (kind: string, value: string) => createHmac("sha256", auditKey).update(`${kind}:${value}`).digest("hex");

const saved = savedSession("01-healthy-hvac");
const refresh = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: saved.refreshToken }) });
if (!refresh.ok) throw new Error("synthetic_session_refresh_failed");
const refreshed = await refresh.json() as { access_token?: string; user?: { id?: string } };
if (!refreshed.access_token || refreshed.user?.id !== saved.authId) throw new Error("synthetic_identity_changed");
const token = refreshed.access_token;
const actor = fingerprint("actor", saved.authId);
const before = await admin.from("security_audit_events").select("id").eq("actor_fingerprint", actor).order("id", { ascending: false }).limit(1);
if (before.error) throw new Error("audit_read_failed");
const previousMaxId = before.data?.[0]?.id ?? 0;

for (const event of ["signed_in", "signed_out"]) {
  const response = await fetch(`${api}/api/security-audit/session`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ event }) });
  if (response.status !== 204) throw new Error(`session_audit_failed_${event}_${response.status}`);
}
const exportResponse = await fetch(`${api}/api/account/export`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
if (!exportResponse.ok || exportResponse.headers.get("content-type") !== "application/gzip") throw new Error(`export_audit_trigger_failed_${exportResponse.status}`);
await exportResponse.arrayBuffer();

let rows: Array<{ id: number; event_type: string; outcome: string; actor_fingerprint: string | null; organization_fingerprint: string | null; target_fingerprint: string | null; metadata: unknown }> = [];
for (let attempt = 0; attempt < 20; attempt++) {
  const result = await admin.from("security_audit_events").select("id,event_type,outcome,actor_fingerprint,organization_fingerprint,target_fingerprint,metadata")
    .eq("actor_fingerprint", actor).gt("id", previousMaxId).order("id", { ascending: false }).limit(20);
  if (result.error) throw new Error("audit_read_failed");
  rows = result.data ?? [];
  const types = new Set(rows.map(row => row.event_type));
  if (rows.length >= 3 && ["session_signed_in", "session_signed_out", "data_export"].every(type => types.has(type))) break;
  await new Promise(resolve => setTimeout(resolve, 250));
}
const types = new Set(rows.map(row => row.event_type));
for (const expected of ["session_signed_in", "session_signed_out", "data_export"]) if (!types.has(expected)) throw new Error(`audit_event_missing_${expected}`);
for (const row of rows) {
  for (const value of [row.actor_fingerprint, row.organization_fingerprint, row.target_fingerprint]) if (value !== null && !/^[0-9a-f]{64}$/.test(value)) throw new Error("invalid_audit_fingerprint");
  const serialized = JSON.stringify(row);
  for (const secret of [token, serviceKey, saved.refreshToken]) if (secret && serialized.includes(secret)) throw new Error("credential_found_in_audit");
}

const clientRead = await fetch(`${url}/rest/v1/security_audit_events?select=id&limit=1`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
if (clientRead.status === 200 && (await clientRead.json() as unknown[]).length > 0) throw new Error("client_audit_read_exposed");
if (![200, 401, 403].includes(clientRead.status)) throw new Error(`unexpected_client_read_status_${clientRead.status}`);

const targetId = rows[0]?.id;
if (!targetId) throw new Error("audit_fixture_missing");
const update = await admin.from("security_audit_events").update({ outcome: "failed" }).eq("id", targetId);
if (!update.error) throw new Error("audit_update_not_blocked");
const removal = await admin.from("security_audit_events").delete().eq("id", targetId);
if (!removal.error) throw new Error("audit_delete_not_blocked");

const invalidEvent = await fetch(`${api}/api/security-audit/session`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ event: `invalid-${randomUUID()}` }) });
if (invalidEvent.status !== 400) throw new Error("invalid_audit_event_accepted");
console.log(JSON.stringify({ status: "passed", eventsVerified: ["session_signed_in", "session_signed_out", "data_export"],
  clientReadDenied: true, updateDenied: true, deleteDenied: true, credentialScanPassed: true }));
