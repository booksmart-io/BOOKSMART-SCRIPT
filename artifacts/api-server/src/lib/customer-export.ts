import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { normalizeOwnedStoragePath } from "./storage-security";

type Row = Record<string, any>;
export class ExportError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
// Connection projections deliberately never retrieve credentials or raw provider errors.
export const connectionColumns: Record<string, string> = {
  plaid_items: "id,user_id,org_id,plaid_item_id,institution_id,institution_name,status,created_at,updated_at",
  quickbooks_connections: "id,organization_id,realm_id,company_name,country,status,connected_at,disconnected_at,updated_at",
  jobber_connections: "id,organization_id,jobber_account_id,jobber_account_name,access_mode,granted_scopes,status,connected_at,disconnected_at,updated_at",
  gmail_connections: "id,organization_id,google_account_email,granted_scopes,status,connected_at,disconnected_at,updated_at",
};

export function sanitizeExport(value: any): any {
  if (Array.isArray(value)) return value.map(sanitizeExport);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/password|secret|authorization|access.?token|refresh.?token|api.?key|state_hash|pkce|error|^(token|credentials|headers)$/i.test(key))
    .map(([key, entry]) => [key, sanitizeExport(entry)]));
  if (typeof value === "string") {
    // Signed links are bearer credentials. Preserve the object reference, never its signature.
    return value.replace(/https?:\/\/[^\s"<>]+/g, raw => {
      try { const url = new URL(raw); url.username = ""; url.password = "";
        for (const key of [...url.searchParams.keys()]) if (/token|secret|signature|key|credential|code/i.test(key)) url.searchParams.delete(key);
        return url.toString();
      } catch { return raw; }
    });
  }
  return value;
}

export async function exportRows(client: SupabaseClient, table: string, column: string, ids: Array<string | number>, order = "id") {
  const rows: Row[] = [];
  // Small batches also avoid oversized REST URLs for accounts with many organizations.
  for (let batch = 0; batch < ids.length; batch += 50) {
    const scope = ids.slice(batch, batch + 50);
    let expected: number | null = null;
    let offset = 0;
    while (true) {
      const { data, error, count } = await client.from(table).select(connectionColumns[table] ?? "*", { count: "exact" })
        .in(column, scope).order(order, { ascending: true }).range(offset, offset + 499);
      if (error || !data || count === null) throw new ExportError("export_data_unavailable");
      if (expected !== null && expected !== count) throw new ExportError("export_data_changed", 409);
      expected = count;
      const page = data as unknown as Row[];
      for (const row of page) if (!scope.some(id => String(id) === String(row[column]))) throw new ExportError("export_scope_violation");
      rows.push(...page); offset += page.length;
      if (rows.length > 100_000) throw new ExportError("export_too_large", 413);
      if (offset >= count) break;
      if (!data.length) throw new ExportError("export_incomplete");
    }
  }
  return rows;
}

const orgTables = [
  "quickbooks_staged_entities", "quickbooks_account_mappings", "quickbooks_account_mapping_history",
  "jobber_records", "jobber_sync_state", "jobber_audit_events",
  "business_signals", "financial_tasks", "financial_task_events", "monitoring_runs", "monitoring_notification_events",
  "account_balance_snapshots", "financial_planning_items", "financial_planning_audit_events", "account_activity_notifications", "organization_survey_progress",
  "contractor_financial_matches", "contractor_job_cost_assignments", "contractor_receipt_extractions",
  "contractor_source_links", "contractor_gmail_financial_messages",
  "quickbooks_connections", "jobber_connections", "gmail_connections",
];
const orgSettings = ["financial_planning_settings", "contractor_financial_settings", "jobber_cpa_sharing_settings", "business_industry_profiles"];

export async function buildCustomerExport(client: SupabaseClient, authId: string) {
  const startedAt = new Date().toISOString();
  const profiles = await exportRows(client, "users", "auth_id", [authId]);
  if (profiles.length !== 1 || profiles[0].role !== "user") throw new ExportError("export_forbidden", 403);
  const userId = profiles[0].id;
  const organizations = await exportRows(client, "organizations", "owner_id", [userId]);
  const orgIds = organizations.map(row => row.id);
  const records: Record<string, Row[]> = { users: profiles, organizations };
  let totalBytes = 0;
  function reserve(value: unknown) {
    totalBytes += Buffer.byteLength(JSON.stringify(value));
    if (totalBytes > 100 * 1024 * 1024) throw new ExportError("export_too_large", 413);
  }
  reserve(sanitizeExport(records));
  async function collect(table: string, column: string, ids: Array<string | number>, order?: string) {
    records[table] = sanitizeExport(await exportRows(client, table, column, ids, order)); reserve(records[table]);
  }
  for (const table of orgTables) await collect(table, "organization_id", orgIds);
  for (const table of orgSettings) await collect(table, "organization_id", orgIds, "organization_id");
  for (const table of ["transactions", "ai_tax_strategies", "plaid_items", "statement_imports"]) await collect(table, "org_id", orgIds);
  for (const table of ["user_documents", "orders"])
    await collect(table, "user_id", [userId]);
  for (const table of ["token_transactions", "feature_unlocks", "subscriptions"]) await collect(table, "user_id", [authId]);
  const sent = await exportRows(client, "chats", "sender_id", [userId]);
  const received = await exportRows(client, "chats", "receiver_id", [userId]);
  records.chats = sanitizeExport([...new Map([...sent, ...received].map(row => [row.id, row])).values()]);
  reserve(records.chats);
  await collect("messages", "chat_id", records.chats.map(row => row.id));
  await collect("plaid_accounts", "plaid_item_id", records.plaid_items.map(row => row.id));
  await collect("pending_transactions", "import_id", records.statement_imports.map(row => row.id));

  const files: Array<{ bucket: string; path: string; encoding: string; sha256: string; content: string }> = [];
  // Enumerate only this verified subject's prefix; never follow URLs or foreign evidence references.
  for (const bucket of ["documents", "chat-attachments", "userImages"]) {
    const folders = [authId];
    for (let index = 0; index < folders.length; index++) {
      if (folders.length > 1000) throw new ExportError("export_too_large", 413);
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await client.storage.from(bucket).list(folders[index], { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
        if (error || !data) throw new ExportError("export_files_unavailable");
        for (const entry of data) {
          const path = `${folders[index]}/${entry.name}`;
          if (!normalizeOwnedStoragePath(path, authId) || entry.name.includes("/")) throw new ExportError("export_scope_violation");
          if (!entry.id) { folders.push(path); continue; }
          if (Number(entry.metadata?.size ?? 0) > 50 * 1024 * 1024) throw new ExportError("export_too_large", 413);
          const { data: blob, error: downloadError } = await client.storage.from(bucket).download(path);
          if (downloadError || !blob) throw new ExportError("export_files_unavailable");
          if (blob.size > 50 * 1024 * 1024) throw new ExportError("export_too_large", 413);
          const bytes = Buffer.from(await blob.arrayBuffer());
          const file = { bucket, path, encoding: "base64", sha256: createHash("sha256").update(bytes).digest("hex"), content: bytes.toString("base64") };
          reserve(file); files.push(file);
        }
        if (data.length < 100) break;
      }
    }
  }
  return { manifest: { version: 1, scope: "owner_account_and_all_owned_organizations", startedAt, completedAt: new Date().toISOString(),
    instructions: "Decompress this .json.gz file to read the JSON. Records are grouped by table. Files contain original bytes encoded as base64; decode content to restore each file at its bucket/path. SHA-256 checksums verify restored bytes.",
    consistency: "Reads are collected over this time interval, not an atomic database snapshot. Export while imports and edits are idle.",
    recordCounts: Object.fromEntries(Object.entries(records).map(([table, rows]) => [table, rows.length])), fileCount: files.length,
    exclusions: ["Integration credentials and OAuth state", "Other users' accounts and files (shared conversation text is included)", "Provider content not stored by BookSmart", "Internal operational logs and backups"] },
    records: sanitizeExport(records) as Record<string, Row[]>, files };
}
