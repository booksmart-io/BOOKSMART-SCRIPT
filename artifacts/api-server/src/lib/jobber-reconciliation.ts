import type { SupabaseClient } from "@supabase/supabase-js";
import { JobberConnectionError } from "./jobber-client";
import { syncJobberReadOnly } from "./jobber-sync";

type AdminClient = SupabaseClient<any, any, any>;

export async function reconcileScheduledJobberOrganization(admin: AdminClient, organizationId: number) {
  const { data: connection, error: connectionError } = await admin.from("jobber_connections")
    .select("*").eq("organization_id", organizationId).eq("status", "active").maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection) return { status: "not_connected" as const, scanned: 0, changed: 0 };

  const now = new Date();
  const staleBefore = new Date(now.getTime() - 30 * 60_000).toISOString();
  const { error: staleError } = await admin.from("jobber_sync_state").update({
    status: "failed", completed_at: now.toISOString(),
    last_error: "Scheduled reconciliation recovered an interrupted synchronization.",
    updated_at: now.toISOString(),
  }).eq("connection_id", connection.id).eq("status", "running").lt("updated_at", staleBefore);
  if (staleError) throw staleError;
  const { data: running, error: runningError } = await admin.from("jobber_sync_state").select("id")
    .eq("connection_id", connection.id).eq("status", "running").limit(1).maybeSingle();
  if (runningError) throw runningError;
  if (running) throw new Error("Jobber synchronization is already running for this organization.");

  try {
    const result = await syncJobberReadOnly(admin, connection, "incremental");
    const completedAt = new Date().toISOString();
    const { error: updateError } = await admin.from("jobber_connections").update({
      last_successful_sync_at: completedAt, last_sync_error: null, updated_at: completedAt,
    }).eq("id", connection.id).eq("organization_id", organizationId);
    if (updateError) throw updateError;
    return {
      status: "completed" as const,
      scanned: Object.values(result.counts).reduce((sum, count) => sum + count, 0),
      changed: Object.values(result.changed).reduce((sum, count) => sum + count, 0),
    };
  } catch (error) {
    const connectionFailure = error instanceof JobberConnectionError ? error : null;
    const safeMessage = connectionFailure?.message ?? "Scheduled Jobber reconciliation failed; the last complete dataset remains available.";
    await admin.from("jobber_connections").update({
      last_sync_error: safeMessage.slice(0, 500),
      status: connectionFailure?.code === "reauthorization_required" ? "error" : "active",
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id).eq("organization_id", organizationId);
    throw error;
  }
}
