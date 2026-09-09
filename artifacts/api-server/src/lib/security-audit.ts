import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SecurityAuditEventType = "session_signed_in" | "session_signed_out" | "data_export" | "account_deletion" |
  "integration_connection" | "cpa_access_change" | "cpa_order_change" | "admin_account_change" | "admin_role_change";
export type SecurityAuditOutcome = "succeeded" | "failed" | "denied";
const ALLOWED_METADATA = new Set(["action", "provider", "status_code", "warning_count", "role", "session_event"]);

function secret() {
  const value = process.env.SECURITY_AUDIT_HMAC_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("security_audit_not_configured");
  return value;
}
export function auditFingerprint(kind: string, value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return createHmac("sha256", secret()).update(`${kind}:${String(value)}`).digest("hex");
}
export function safeSecurityAuditMetadata(metadata: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(metadata).filter(([key, value]) => ALLOWED_METADATA.has(key) &&
    (typeof value === "string" || typeof value === "number" || typeof value === "boolean") &&
    (!/token|secret|password|authorization|credential/i.test(key)) && String(value).length <= 120));
}
export function securityAuditAdminClient() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("security_audit_not_configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function writeSecurityAuditEvent(admin: SupabaseClient, event: {
  eventType: SecurityAuditEventType; outcome: SecurityAuditOutcome; actorAuthId?: string | null;
  organizationId?: string | number | null; target?: string | number | null; source?: "web" | "api" | "system";
  metadata?: Record<string, unknown>; eventKey?: string;
}) {
  const eventKey = event.eventKey ?? randomUUID().replaceAll("-", "");
  const { error } = await admin.from("security_audit_events").upsert({
    event_key: auditFingerprint("event", eventKey), event_type: event.eventType, outcome: event.outcome,
    actor_fingerprint: auditFingerprint("actor", event.actorAuthId),
    organization_fingerprint: auditFingerprint("organization", event.organizationId),
    target_fingerprint: auditFingerprint("target", event.target), source: event.source ?? "api",
    metadata: safeSecurityAuditMetadata(event.metadata),
  }, { onConflict: "event_key", ignoreDuplicates: true });
  if (error) throw new Error("security_audit_write_failed");
}
