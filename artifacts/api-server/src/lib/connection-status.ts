import type { SupabaseClient } from "@supabase/supabase-js";

export type ConnectionProviderStatus = {
  id: string;
  type: "plaid" | "quickbooks" | "uploaded_statement";
  name: string;
  status: "healthy" | "attention" | "disconnected" | "available";
  lastDataRefresh: string | null;
  error: string | null;
  stale: boolean;
};

export type NormalizedConnectionStatus = {
  organizationId: number;
  status: "connected" | "attention" | "not_connected";
  providers: ConnectionProviderStatus[];
  totalConnections: number;
  healthyConnections: number;
  attentionRequired: number;
  lastDataRefresh: string | null;
  calculatedAt: string;
};

type ConnectionRow = Record<string, unknown>;

function iso(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function isStale(value: string | null, now: Date, days = 3) {
  return value ? now.getTime() - new Date(value).getTime() > days * 86_400_000 : true;
}

export function normalizeConnectionStatus(input: {
  organizationId: number;
  plaidItems?: ConnectionRow[];
  quickBooksConnections?: ConnectionRow[];
  uploadedStatements?: ConnectionRow[];
  now?: Date;
}): NormalizedConnectionStatus {
  const now = input.now ?? new Date();
  const providers: ConnectionProviderStatus[] = [];

  for (const item of input.plaidItems ?? []) {
    const lastDataRefresh = iso(item.last_synced_at ?? item.updated_at ?? item.created_at);
    const active = String(item.status ?? "") === "active";
    const syncFailed = String(item.last_sync_status ?? "") === "failed";
    const stale = active && isStale(lastDataRefresh, now);
    providers.push({
      id: `plaid:${String(item.id)}`,
      type: "plaid",
      name: String(item.institution_name ?? "Connected bank"),
      status: !active ? "disconnected" : syncFailed || stale ? "attention" : "healthy",
      lastDataRefresh,
      error: syncFailed ? String(item.last_sync_error ?? "Bank synchronization failed.") : null,
      stale,
    });
  }

  for (const connection of input.quickBooksConnections ?? []) {
    const lastDataRefresh = iso(connection.last_synced_at ?? connection.verified_at ?? connection.updated_at ?? connection.connected_at);
    const active = String(connection.status ?? "") === "active";
    const syncFailed = String(connection.last_sync_status ?? "") === "failed";
    const stale = active && isStale(lastDataRefresh, now);
    providers.push({
      id: `quickbooks:${String(connection.realm_id ?? connection.id)}`,
      type: "quickbooks",
      name: String(connection.company_name ?? "QuickBooks Online"),
      status: !active ? "disconnected" : syncFailed || stale ? "attention" : "healthy",
      lastDataRefresh,
      error: syncFailed ? String(connection.last_sync_error ?? "QuickBooks sync failed.") : null,
      stale,
    });
  }

  const confirmedUploads = (input.uploadedStatements ?? []).filter((row) => {
    const parsed = row.parsed_data && typeof row.parsed_data === "object" ? row.parsed_data as ConnectionRow : {};
    const workflow = parsed.statement_workflow && typeof parsed.statement_workflow === "object" ? parsed.statement_workflow as ConnectionRow : {};
    return Number(workflow.organization_id) === input.organizationId && String(workflow.lifecycle_status) === "confirmed";
  });
  if (confirmedUploads.length > 0) {
    const latest = confirmedUploads.map((row) => iso(row.updated_at ?? row.created_at)).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    providers.push({ id: "uploaded_statement", type: "uploaded_statement", name: "Uploaded financial statements", status: "available", lastDataRefresh: latest, error: null, stale: false });
  }

  const liveConnections = providers.filter((provider) => provider.type !== "uploaded_statement");
  const healthyConnections = liveConnections.filter((provider) => provider.status === "healthy").length;
  const attentionRequired = liveConnections.filter((provider) => provider.status === "attention" || provider.status === "disconnected").length;
  const lastDataRefresh = providers.map((provider) => provider.lastDataRefresh).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return {
    organizationId: input.organizationId,
    status: attentionRequired > 0 ? "attention" : healthyConnections > 0 ? "connected" : "not_connected",
    providers,
    totalConnections: liveConnections.length,
    healthyConnections,
    attentionRequired,
    lastDataRefresh,
    calculatedAt: now.toISOString(),
  };
}

export async function loadConnectionStatus(admin: SupabaseClient, organizationId: number, ownerUserId: number) {
  const [plaid, quickBooks, documents] = await Promise.all([
    admin.from("plaid_items").select("id,institution_name,status,created_at,updated_at,last_synced_at,last_sync_status,last_sync_error").eq("org_id", organizationId),
    admin.from("quickbooks_connections").select("id,realm_id,company_name,status,connected_at,verified_at,updated_at,last_synced_at,last_sync_status,last_sync_error").eq("organization_id", organizationId),
    admin.from("user_documents").select("id,parsed_data,created_at,updated_at").eq("user_id", ownerUserId).order("created_at", { ascending: false }).limit(250),
  ]);
  if (plaid.error) throw plaid.error;
  if (quickBooks.error) throw quickBooks.error;
  if (documents.error) throw documents.error;
  return normalizeConnectionStatus({ organizationId, plaidItems: plaid.data ?? [], quickBooksConnections: quickBooks.data ?? [], uploadedStatements: documents.data ?? [] });
}
