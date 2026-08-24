import { createClient } from "@supabase/supabase-js";

const organizationId = Number(process.argv[2]);
if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
  throw new Error("Usage: audit-contractor-organization.mjs <organization-id>");
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase audit credentials are not configured");
const admin = createClient(url, key, { auth: { persistSession: false } });
const now = new Date();
const isFresh = value => typeof value === "string" && !Number.isNaN(Date.parse(value))
  && now.getTime() - new Date(value).getTime() <= 3 * 86_400_000;

const count = async query => {
  const result = await query;
  if (result.error) throw result.error;
  return result.count ?? 0;
};

const [organization, plaid, quickbooks, jobber, approvedTransactions, plaidTransactions,
  quickbooksTransactions, dualProvenanceTransactions, importedQuickbooksRecords, jobberJobs,
  jobberInvoices, receipts, confirmedReceiptLinks, confirmedMatches, pendingMatches, assignments,
  linkedAssignments, untraceableAssignments] = await Promise.all([
  admin.from("organizations").select("id").eq("id", organizationId).maybeSingle(),
  admin.from("plaid_items").select("status,last_sync_status,last_synced_at,last_sync_error").eq("org_id", organizationId),
  admin.from("quickbooks_connections").select("status,last_synced_at,last_sync_status,last_sync_error,updated_at").eq("organization_id", organizationId).maybeSingle(),
  admin.from("jobber_connections").select("status,last_successful_sync_at,last_sync_error,updated_at").eq("organization_id", organizationId).maybeSingle(),
  count(admin.from("transactions").select("id", { count: "exact", head: true }).eq("org_id", organizationId).eq("pending", false)),
  count(admin.from("transactions").select("id", { count: "exact", head: true }).eq("org_id", organizationId).eq("pending", false).not("plaid_transaction_id", "is", null)),
  count(admin.from("transactions").select("id", { count: "exact", head: true }).eq("org_id", organizationId).eq("pending", false).not("quickbooks_external_id", "is", null)),
  count(admin.from("transactions").select("id", { count: "exact", head: true }).eq("org_id", organizationId).eq("pending", false).not("plaid_transaction_id", "is", null).not("quickbooks_external_id", "is", null)),
  count(admin.from("quickbooks_staged_entities").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("import_status", "imported")),
  count(admin.from("jobber_records").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("object_type", "jobs").eq("is_archived", false)),
  count(admin.from("jobber_records").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("object_type", "invoices").eq("is_archived", false)),
  count(admin.from("contractor_receipt_extractions").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)),
  count(admin.from("contractor_source_links").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("left_provider", "receipt").eq("right_record_type", "transaction").eq("status", "confirmed")),
  count(admin.from("contractor_financial_matches").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "confirmed")),
  count(admin.from("contractor_financial_matches").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("requires_confirmation", true)),
  count(admin.from("contractor_job_cost_assignments").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)),
  count(admin.from("contractor_job_cost_assignments").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).not("match_id", "is", null)),
  count(admin.from("contractor_job_cost_assignments").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("confidence", "confirmed").is("match_id", null)),
]);

for (const result of [organization, plaid, quickbooks, jobber]) if (result.error) throw result.error;
if (!organization.data) throw new Error("Organization not found");

const plaidRows = plaid.data ?? [];
const plaidConnected = plaidRows.some(row => row.status === "active");
const plaidHealthy = plaidRows.some(row => row.status === "active" && row.last_sync_status === "completed" && isFresh(row.last_synced_at));
const quickbooksConnected = quickbooks.data?.status === "active";
const quickbooksHealthy = quickbooksConnected && quickbooks.data?.last_sync_status !== "failed"
  && isFresh(quickbooks.data?.last_synced_at ?? quickbooks.data?.updated_at);
const jobberConnected = jobber.data?.status === "active";
const jobberHealthy = jobberConnected && !jobber.data?.last_sync_error && isFresh(jobber.data?.last_successful_sync_at);
const accountingSource = quickbooksHealthy ? "quickbooks_canonical" : plaidHealthy ? "plaid_fallback" : "none";
const supportedMode = jobberHealthy
  ? quickbooksHealthy && plaidHealthy ? "jobber_quickbooks_plaid"
    : quickbooksHealthy ? "jobber_quickbooks"
      : plaidHealthy ? "jobber_plaid" : "jobber_only"
  : quickbooksHealthy && plaidHealthy ? "quickbooks_plaid_jobber_stale_or_missing"
    : quickbooksHealthy ? "quickbooks_only_jobber_stale_or_missing"
      : plaidHealthy ? "plaid_only_jobber_stale_or_missing" : "no_live_sources";

const result = {
  checkedAt: new Date().toISOString(), organizationId,
  supportedMode, accountingSource,
  connections: {
    plaid: { connected: plaidConnected, healthy: plaidHealthy, itemCount: plaidRows.length,
      latestSyncAt: plaidRows.map(row => row.last_synced_at).filter(Boolean).sort().at(-1) ?? null,
      hasSyncError: plaidRows.some(row => Boolean(row.last_sync_error)) },
    quickbooks: { connected: quickbooksConnected, healthy: quickbooksHealthy,
      lastSyncAt: quickbooks.data?.last_synced_at ?? null, hasSyncError: Boolean(quickbooks.data?.last_sync_error) },
    jobber: { connected: jobberConnected, healthy: jobberHealthy,
      lastSyncAt: jobber.data?.last_successful_sync_at ?? null, hasSyncError: Boolean(jobber.data?.last_sync_error) },
  },
  counts: { approvedTransactions, plaidTransactions, quickbooksTransactions, dualProvenanceTransactions,
    importedQuickbooksRecords, jobberJobs, jobberInvoices, receipts, confirmedReceiptTransactionLinks: confirmedReceiptLinks,
    confirmedMatches, pendingMatches, jobCostAssignments: assignments, assignmentsWithMatches: linkedAssignments,
    confirmedAssignmentsWithoutMatches: untraceableAssignments },
  checks: {
    operationalSourceAvailable: jobberHealthy,
    accountingOrCashSourceAvailable: quickbooksHealthy || plaidHealthy,
    canonicalPrecedenceSelected: accountingSource !== "none",
    noUntraceableConfirmedAssignments: untraceableAssignments === 0,
    confirmedReceiptChainPresent: confirmedReceiptLinks > 0 && confirmedMatches > 0 && linkedAssignments > 0,
  },
};
result.passed = Object.values(result.checks).every(Boolean);
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 2;
