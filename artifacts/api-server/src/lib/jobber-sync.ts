import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jobberContentHash, jobberQuery, type JobberConnection } from "./jobber-client";

type AdminClient = SupabaseClient<any, any, any>;
type Node = Record<string, any> & { id: string };
type Page = { nodes: Node[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
type Kind = "clients" | "jobs" | "scheduled_items" | "quotes" | "invoices" | "payments";
type TopKind = "clients" | "jobs" | "quotes" | "invoices";
type SyncMode = "full" | "incremental";
const INCREMENTAL_OVERLAP_MS = 5 * 60 * 1000;

export function jobberOverlapWatermark(watermark: string | null): string | null {
  if (!watermark) return null;
  const timestamp = new Date(watermark).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp - INCREMENTAL_OVERLAP_MS).toISOString() : watermark;
}

const QUERIES: Record<TopKind, string> = {
  clients: `query BookSmartClients($first:Int!,$after:String,$filter:ClientFilterAttributes,$sort:ClientsSortInput){clients(first:$first,after:$after,filter:$filter,sort:$sort){nodes{id name firstName lastName companyName isArchived createdAt updatedAt jobberWebUri} pageInfo{hasNextPage endCursor}}}`,
  jobs: `query BookSmartJobs($first:Int!,$after:String,$sort:[JobsSortInput!]){jobs(first:$first,after:$after,sort:$sort){nodes{id jobNumber title jobStatus total uninvoicedTotal invoicedTotal completedAt completedAndUninvoicedVisitsCount completedAndUninvoicedVisitsTotal startAt endAt createdAt updatedAt jobberWebUri client{id}} pageInfo{hasNextPage endCursor}}}`,
  quotes: `query BookSmartQuotes($first:Int!,$after:String,$filter:QuoteFilterAttributes){quotes(first:$first,after:$after,filter:$filter){nodes{id quoteNumber title quoteStatus createdAt updatedAt transitionedAt jobberWebUri client{id}} pageInfo{hasNextPage endCursor}}}`,
  invoices: `query BookSmartInvoices($first:Int!,$after:String,$filter:InvoiceFilterAttributes){invoices(first:$first,after:$after,filter:$filter){nodes{id invoiceNumber subject invoiceStatus amounts{invoiceBalance total} createdAt updatedAt issuedDate dueDate receivedDate jobberWebUri client{id}} pageInfo{hasNextPage endCursor}}}`,
};
const VISITS_QUERY = `query BookSmartJobVisits($id:EncodedId!,$first:Int!,$after:String){job(id:$id){visits(first:$first,after:$after){nodes{id title visitStatus startAt endAt createdAt client{id} job{id}} pageInfo{hasNextPage endCursor}}}}`;
const PAYMENTS_QUERY = `query BookSmartInvoicePayments($id:EncodedId!,$first:Int!,$after:String){invoice(id:$id){paymentRecords(first:$first,after:$after){nodes{id amount} pageInfo{hasNextPage endCursor}}}}`;

export function jobberSyncVariables(kind: TopKind, mode: SyncMode, watermark: string | null, cursor: string | null) {
  const variables: Record<string, unknown> = { first: 25, after: cursor };
  if (kind === "clients") {
    variables.sort = { key: "UPDATED_AT", direction: "DESCENDING" };
    if (mode === "incremental" && watermark) variables.filter = { updatedAt: { after: watermark } };
  } else if (kind === "jobs") {
    variables.sort = [{ key: "UPDATED_AT", direction: "DESCENDING" }];
  } else if (mode === "incremental" && watermark) {
    variables.filter = { updatedAt: { after: watermark } };
  }
  return variables;
}

export function shouldStopJobPages(kind: TopKind, mode: SyncMode, watermark: string | null, nodes: Node[]) {
  return kind === "jobs" && mode === "incremental" && !!watermark && nodes.length > 0 &&
    nodes.every((node) => !!node.updatedAt && new Date(node.updatedAt).getTime() <= new Date(watermark).getTime());
}

function snapshot(kind: Kind, node: Node, connection: JobberConnection, runId: string) {
  const payload = { ...node };
  delete payload._parentId;
  return {
    organization_id: connection.organization_id, connection_id: connection.id, object_type: kind,
    external_id: node.id, related_client_id: node.client?.id ?? null,
    parent_id: node.job?.id ?? node._parentId ?? null,
    record_number: String(node.jobNumber ?? node.quoteNumber ?? node.invoiceNumber ?? "") || null,
    status: node.jobStatus ?? node.visitStatus ?? node.quoteStatus ?? node.invoiceStatus ?? null,
    title: node.name ?? node.title ?? node.subject ?? null,
    starts_at: node.startAt ?? node.issuedDate ?? null, ends_at: node.endAt ?? node.dueDate ?? null,
    source_created_at: node.createdAt ?? null, source_updated_at: node.updatedAt ?? node.transitionedAt ?? null,
    direct_url: node.jobberWebUri ?? null,
    amount: typeof node.amounts?.invoiceBalance === "number" ? node.amounts.invoiceBalance : typeof node.total === "number" ? node.total : typeof node.amount === "number" ? node.amount : null,
    payload, content_hash: jobberContentHash(payload), last_seen_at: new Date().toISOString(),
    last_seen_run_id: runId, is_archived: node.isArchived === true, archived_at: node.isArchived === true ? new Date().toISOString() : null,
  };
}

async function save(admin: AdminClient, rows: ReturnType<typeof snapshot>[]) {
  if (!rows.length) return 0;
  const { data: existing, error: readError } = await admin.from("jobber_records").select("external_id,content_hash,is_archived")
    .eq("connection_id", rows[0].connection_id).eq("object_type", rows[0].object_type).in("external_id", rows.map((row) => row.external_id));
  if (readError) throw readError;
  const old = new Map((existing ?? []).map((row: any) => [row.external_id, `${row.content_hash}:${row.is_archived}`]));
  const changed = rows.filter((row) => old.get(row.external_id) !== `${row.content_hash}:${row.is_archived}`).length;
  const { error } = await admin.from("jobber_records").upsert(rows, { onConflict: "connection_id,object_type,external_id" });
  if (error) throw error;
  return changed;
}

async function state(admin: AdminClient, connection: JobberConnection, kind: Kind, values: Record<string, unknown>) {
  const { error } = await admin.from("jobber_sync_state").upsert({ organization_id: connection.organization_id, connection_id: connection.id, object_type: kind, updated_at: new Date().toISOString(), ...values }, { onConflict: "connection_id,object_type" });
  if (error) throw error;
}

async function nestedPages(admin: AdminClient, connection: JobberConnection, parentId: string, kind: "scheduled_items" | "payments", runId: string) {
  let cursor: string | null = null; let seen = 0; let changed = 0;
  do {
    const data: any = await jobberQuery<any>(admin, connection, kind === "scheduled_items" ? VISITS_QUERY : PAYMENTS_QUERY, { id: parentId, first: 25, after: cursor });
    const page: Page | undefined = kind === "scheduled_items" ? data.job?.visits : data.invoice?.paymentRecords;
    if (!page) throw new Error(`Jobber did not return ${kind} for ${parentId}`);
    const rows = page.nodes.map((node) => snapshot(kind, { ...node, _parentId: parentId }, connection, runId));
    changed += await save(admin, rows); seen += rows.length;
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return { seen, changed };
}

async function reconcile(admin: AdminClient, connectionId: number, kind: Kind, runId: string) {
  const { error } = await admin.from("jobber_records").update({ is_archived: true, archived_at: new Date().toISOString() })
    .eq("connection_id", connectionId).eq("object_type", kind).eq("is_archived", false)
    .or(`last_seen_run_id.is.null,last_seen_run_id.neq.${runId}`);
  if (error) throw error;
}

export async function syncJobberReadOnly(admin: AdminClient, connection: JobberConnection, requestedMode?: SyncMode) {
  const now = new Date();
  const { data: previousStates, error: previousError } = await admin.from("jobber_sync_state").select("*").eq("connection_id", connection.id);
  if (previousError) throw previousError;
  const previous = new Map((previousStates ?? []).map((row: any) => [row.object_type, row]));
  const hasWatermarks = ["clients", "jobs", "quotes", "invoices"].every((kind) => previous.get(kind)?.watermark);
  const mode: SyncMode = requestedMode ?? (hasWatermarks ? "incremental" : "full");
  const cutoff = now.getTime() - 365 * 24 * 60 * 60 * 1000;
  const counts: Record<Kind, number> = { clients: 0, jobs: 0, scheduled_items: 0, quotes: 0, invoices: 0, payments: 0 };
  const changed: Record<Kind, number> = { clients: 0, jobs: 0, scheduled_items: 0, quotes: 0, invoices: 0, payments: 0 };
  const runIds = new Map<TopKind, string>();

  for (const kind of Object.keys(QUERIES) as TopKind[]) {
    const old: any = previous.get(kind);
    const resuming = old?.status === "failed" && old.sync_mode === mode && old.cursor && old.run_id;
    const runId = resuming ? old.run_id : randomUUID();
    runIds.set(kind, runId);
    const watermark = old?.watermark ?? null;
    const queryWatermark = mode === "incremental" ? jobberOverlapWatermark(watermark) : watermark;
    let cursor: string | null = resuming ? old.cursor : null;
    let pages = resuming ? Number(old.pages_processed ?? 0) : 0;
    counts[kind] = resuming ? Number(old.records_seen ?? 0) : 0;
    changed[kind] = resuming ? Number(old.records_changed ?? 0) : 0;
    const windowStartedAt = resuming ? old.window_started_at : now.toISOString();
    await state(admin, connection, kind, { status: "running", sync_mode: mode, run_id: runId, cursor, window_started_at: windowStartedAt, started_at: resuming ? old.started_at : now.toISOString(), completed_at: null, last_error: null, records_seen: counts[kind], records_changed: changed[kind], pages_processed: pages });
    try {
      let stop = false;
      do {
        const variables = jobberSyncVariables(kind, mode, queryWatermark, cursor);
        const data = await jobberQuery<Record<string, Page>>(admin, connection, QUERIES[kind], variables);
        const page = data[kind]; if (!page) throw new Error(`Jobber did not return ${kind}`);
        stop = shouldStopJobPages(kind, mode, queryWatermark, page.nodes);
        const eligible = page.nodes.filter((node) => {
          const date = node.updatedAt ?? node.createdAt ?? node.startAt ?? node.issuedDate;
          if (mode === "incremental" && queryWatermark && kind === "jobs" && date) return new Date(date).getTime() > new Date(queryWatermark).getTime();
          return mode === "incremental" || kind === "clients" || !date || new Date(date).getTime() >= cutoff;
        });
        const rows = eligible.map((node) => snapshot(kind, node, connection, runId));
        changed[kind] += await save(admin, rows); counts[kind] += rows.length;
        for (const node of eligible) {
          if (kind === "jobs") { const nested = await nestedPages(admin, connection, node.id, "scheduled_items", runId); counts.scheduled_items += nested.seen; changed.scheduled_items += nested.changed; }
          if (kind === "invoices") { const nested = await nestedPages(admin, connection, node.id, "payments", runId); counts.payments += nested.seen; changed.payments += nested.changed; }
        }
        pages += 1; cursor = !stop && page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
        await state(admin, connection, kind, { cursor, records_seen: counts[kind], records_changed: changed[kind], pages_processed: pages });
      } while (cursor);
      if (mode === "full") await reconcile(admin, connection.id, kind, runId);
      await state(admin, connection, kind, { status: "succeeded", cursor: null, watermark: windowStartedAt, completed_at: new Date().toISOString(), records_seen: counts[kind], records_changed: changed[kind], pages_processed: pages });
    } catch (error) {
      await state(admin, connection, kind, { status: "failed", cursor, completed_at: new Date().toISOString(), records_seen: counts[kind], records_changed: changed[kind], pages_processed: pages, last_error: error instanceof Error ? error.message.slice(0, 500) : "Unknown sync error" });
      throw error;
    }
  }
  for (const kind of ["scheduled_items", "payments"] as Kind[]) {
    const runId = runIds.get(kind === "scheduled_items" ? "jobs" : "invoices")!;
    if (mode === "full") await reconcile(admin, connection.id, kind, runId);
    await state(admin, connection, kind, { status: "succeeded", sync_mode: mode, run_id: runId, watermark: now.toISOString(), completed_at: new Date().toISOString(), records_seen: counts[kind], records_changed: changed[kind], last_error: null });
  }
  return { counts, changed, mode };
}
