const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Supabase service configuration is unavailable");

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

async function readAll(table, select) {
  const rows = [];
  const pageSize = 1_000;
  for (let offset = 0; ; offset += pageSize) {
    const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=id.asc&offset=${offset}&limit=${pageSize}`;
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`${table} audit query failed (${response.status})`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function containsForbiddenKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) =>
    /(token|secret|authorization|code|client.?id|client.?name|email|phone|address|amount|invoice.?balance)/i.test(key)
      || containsForbiddenKey(nested),
  );
}

const [connections, states, records, audits] = await Promise.all([
  readAll("jobber_connections", "id,organization_id,status,last_successful_sync_at,last_full_sync_at,last_sync_error,api_version_warning"),
  readAll("jobber_sync_state", "id,organization_id,connection_id,object_type,status,sync_mode,watermark,cursor,last_error,records_seen,records_changed,pages_processed,completed_at"),
  readAll("jobber_records", "id,organization_id,connection_id,object_type,external_id,content_hash,is_archived"),
  readAll("jobber_audit_events", "id,organization_id,connection_id,event_type,outcome,metadata"),
]);

const connectionById = new Map(connections.map((connection) => [connection.id, connection]));
const duplicateKeys = [];
const seenKeys = new Set();
const recordCounts = {};
let missingHashes = 0;
let organizationScopeMismatches = 0;
for (const record of records) {
  const key = `${record.connection_id}:${record.object_type}:${record.external_id}`;
  if (seenKeys.has(key)) duplicateKeys.push(key);
  seenKeys.add(key);
  if (!record.content_hash) missingHashes += 1;
  const connection = connectionById.get(record.connection_id);
  if (!connection || Number(connection.organization_id) !== Number(record.organization_id)) organizationScopeMismatches += 1;
  const counts = recordCounts[record.object_type] ?? { active: 0, archived: 0 };
  counts[record.is_archived ? "archived" : "active"] += 1;
  recordCounts[record.object_type] = counts;
}

const requiredKinds = ["clients", "jobs", "scheduled_items", "quotes", "invoices", "payments"];
const stateByConnection = Object.fromEntries(connections.map((connection) => [connection.id, states.filter((state) => state.connection_id === connection.id)]));
const unhealthyConnections = connections.filter((connection) => connection.status !== "active" || connection.last_sync_error);
const failedStates = states.filter((state) => state.status === "failed" || state.last_error || state.cursor);
const incompleteConnections = connections.filter((connection) => {
  const kinds = new Set(stateByConnection[connection.id].filter((state) => state.status === "succeeded" && state.watermark).map((state) => state.object_type));
  return requiredKinds.some((kind) => !kinds.has(kind));
});
const unsafeAuditMetadata = audits.filter((event) => containsForbiddenKey(event.metadata)).map((event) => event.id);
const auditScopeMismatches = audits.filter((event) => {
  if (event.connection_id == null) return false;
  const connection = connectionById.get(event.connection_id);
  return !connection || Number(connection.organization_id) !== Number(event.organization_id);
}).length;

const checks = {
  activeConnectionPresent: connections.some((connection) => connection.status === "active"),
  successfulSyncPresent: connections.some((connection) => connection.last_successful_sync_at),
  allConnectionStatesHealthy: unhealthyConnections.length === 0,
  allRequiredKindsSynchronized: incompleteConnections.length === 0,
  noFailedOrResumableStates: failedStates.length === 0,
  noDuplicateExternalKeys: duplicateKeys.length === 0,
  allRecordsHaveContentHashes: missingHashes === 0,
  allRecordsMatchConnectionOrganization: organizationScopeMismatches === 0,
  auditMetadataContainsNoForbiddenKeys: unsafeAuditMetadata.length === 0,
  allAuditsMatchConnectionOrganization: auditScopeMismatches === 0,
};

const result = {
  target: new URL(supabaseUrl).hostname,
  checkedAt: new Date().toISOString(),
  connectionCount: connections.length,
  activeConnectionCount: connections.filter((connection) => connection.status === "active").length,
  activeOrganizationIds: [...new Set(connections
    .filter((connection) => connection.status === "active")
    .map((connection) => Number(connection.organization_id)))].sort((a, b) => a - b),
  synchronizedRecordCounts: recordCounts,
  syncStateCount: states.length,
  auditEventCount: audits.length,
  checks,
  issueCounts: {
    unhealthyConnections: unhealthyConnections.length,
    incompleteConnections: incompleteConnections.length,
    failedOrResumableStates: failedStates.length,
    duplicateExternalKeys: duplicateKeys.length,
    missingContentHashes: missingHashes,
    recordOrganizationScopeMismatches: organizationScopeMismatches,
    unsafeAuditMetadata: unsafeAuditMetadata.length,
    auditOrganizationScopeMismatches: auditScopeMismatches,
  },
  passed: Object.values(checks).every(Boolean),
};

console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 2;
