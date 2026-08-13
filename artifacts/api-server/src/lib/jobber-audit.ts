import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient<any, any, any>;

export type JobberAuditEventType =
  | "connect_started"
  | "connected"
  | "reconnected"
  | "sync_started"
  | "sync_completed"
  | "sync_failed"
  | "authorization_expired"
  | "disconnected";

export type JobberAuditOutcome = "started" | "succeeded" | "failed" | "attention_required";
export type JobberAuditErrorCategory =
  | "reauthorization_required"
  | "temporarily_unavailable"
  | "configuration_error"
  | "provider_error"
  | "local_error";

const ALLOWED_METADATA = new Set([
  "sync_mode",
  "records_scanned",
  "records_changed",
  "object_counts",
  "remote_revocation_confirmed",
  "api_version",
]);

export function safeJobberAuditMetadata(metadata: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata).filter(([key, value]) => {
    if (!ALLOWED_METADATA.has(key)) return false;
    if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
    if (key === "object_counts" && typeof value === "object" && !Array.isArray(value)) {
      return Object.values(value as Record<string, unknown>).every((count) => Number.isSafeInteger(count) && Number(count) >= 0);
    }
    return false;
  }));
}

export async function writeJobberAuditEvent(admin: AdminClient, event: {
  organizationId: number;
  connectionId?: number | null;
  actorUserId?: number | null;
  eventType: JobberAuditEventType;
  outcome: JobberAuditOutcome;
  errorCategory?: JobberAuditErrorCategory | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await admin.from("jobber_audit_events").insert({
    organization_id: event.organizationId,
    connection_id: event.connectionId ?? null,
    actor_user_id: event.actorUserId ?? null,
    event_type: event.eventType,
    outcome: event.outcome,
    error_category: event.errorCategory ?? null,
    metadata: safeJobberAuditMetadata(event.metadata),
  });
  if (error) throw error;
}

