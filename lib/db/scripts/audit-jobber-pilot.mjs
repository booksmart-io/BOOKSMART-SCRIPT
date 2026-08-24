const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const organizationId = 63;
if (!supabaseUrl || !serviceKey) throw new Error("Supabase service configuration is unavailable");

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

async function readOrganizationRows(table, select) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  url.searchParams.set("select", select);
  url.searchParams.set("organization_id", `eq.${organizationId}`);
  url.searchParams.set("order", "id.asc");
  url.searchParams.set("limit", "1000");
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${table} pilot audit query failed (${response.status})`);
  return response.json();
}

const [signals, tasks, notifications, records] = await Promise.all([
  readOrganizationRows("business_signals", "id,signal_key,status,severity,current_value,source_ids,requires_cpa_review,cpa_review_level,metadata,created_at,updated_at"),
  readOrganizationRows("financial_tasks", "id,source,source_id,status,requires_cpa,assignment_role,assigned_user_id,metadata,created_at,updated_at"),
  readOrganizationRows("monitoring_notification_events", "id,signal_id,task_id,event_key,event_type,delivery_status,payload,created_at"),
  readOrganizationRows("jobber_records", "id,external_id,object_type,status,is_archived,payload"),
]);

const approvedKey = (key) => key.startsWith("jobber:requires-invoicing:") || key === "jobber:unscheduled-active-jobs";
const jobberSignals = signals.filter((signal) => String(signal.signal_key).startsWith("jobber:") || signal.metadata?.provider === "jobber");
const jobberSignalIds = new Set(jobberSignals.map((signal) => String(signal.id)));
const jobberTasks = tasks.filter((task) => task.metadata?.provider === "jobber" || (task.source === "signal" && jobberSignalIds.has(String(task.source_id))));
const jobberTaskIds = new Set(jobberTasks.map((task) => String(task.id)));
const jobberNotifications = notifications.filter((event) => jobberSignalIds.has(String(event.signal_id)) || jobberTaskIds.has(String(event.task_id)));

const duplicateActiveSignalKeys = [];
const activeKeys = new Set();
for (const signal of jobberSignals.filter((item) => item.status === "active")) {
  if (activeKeys.has(signal.signal_key)) duplicateActiveSignalKeys.push(signal.signal_key);
  activeKeys.add(signal.signal_key);
}
const duplicateEventKeys = [];
const eventKeys = new Set();
for (const event of jobberNotifications) {
  if (eventKeys.has(event.event_key)) duplicateEventKeys.push(event.event_key);
  eventKeys.add(event.event_key);
}

const activeJobberSignals = jobberSignals.filter((signal) => signal.status === "active");
const recordByExternalId = new Map(records.map((record) => [String(record.external_id), record]));
const evidence = activeJobberSignals.map((signal) => {
  const sourceIds = Array.isArray(signal.source_ids) ? signal.source_ids.map(String) : [];
  const sourceRecords = sourceIds.map((sourceId) => recordByExternalId.get(sourceId)).filter(Boolean);
  if (String(signal.signal_key).startsWith("jobber:requires-invoicing:")) {
    const source = sourceRecords[0];
    const rawAmount = source?.payload?.uninvoicedTotal;
    const amount = typeof rawAmount === "number" || typeof rawAmount === "string" ? Number(rawAmount) : Number.NaN;
    const matches = sourceIds.length === 1 && sourceRecords.length === 1 && source.object_type === "jobs" &&
      source.status === "requires_invoicing" && source.is_archived === false && Number.isFinite(amount) && amount > 0 &&
      Math.abs(amount - Number(signal.current_value)) < 0.01;
    return { key: signal.signal_key, evidence: "explicit_uninvoiced_total", sourceCount: sourceRecords.length, matches };
  }
  if (signal.signal_key === "jobber:unscheduled-active-jobs") {
    const matches = sourceIds.length > 0 && sourceRecords.length === sourceIds.length &&
      sourceRecords.every((source) => source.object_type === "jobs" && source.status === "unscheduled" && source.is_archived === false) &&
      sourceRecords.length === Number(signal.current_value);
    return { key: signal.signal_key, evidence: "active_unscheduled_jobs", sourceCount: sourceRecords.length, matches };
  }
  return { key: signal.signal_key, evidence: "unapproved", sourceCount: sourceRecords.length, matches: false };
});
const checks = {
  onlyApprovedActiveSignalKeys: activeJobberSignals.every((signal) => approvedKey(String(signal.signal_key))),
  activeSignalsMatchSynchronizedEvidence: evidence.every((item) => item.matches),
  signalsOwnerOnly: jobberSignals.every((signal) => signal.requires_cpa_review === false && signal.cpa_review_level === "none"),
  signalsHaveNoAccountingEffect: jobberSignals.every((signal) => signal.metadata?.accounting_effect === "none"),
  tasksOwnerOnly: jobberTasks.every((task) => task.requires_cpa === false && task.assignment_role === "owner" && task.assigned_user_id != null),
  tasksHaveNoAccountingEffect: jobberTasks.every((task) => task.metadata?.accounting_effect === "none"),
  notificationsSuppressed: jobberNotifications.every((event) => event.delivery_status === "suppressed" && event.payload?.delivery_enabled === false),
  noDuplicateActiveSignalKeys: duplicateActiveSignalKeys.length === 0,
  noDuplicateNotificationEventKeys: duplicateEventKeys.length === 0,
};

const result = {
  target: new URL(supabaseUrl).hostname,
  checkedAt: new Date().toISOString(),
  organizationId,
  counts: {
    jobberSignals: jobberSignals.length,
    activeJobberSignals: activeJobberSignals.length,
    jobberTasks: jobberTasks.length,
    openJobberTasks: jobberTasks.filter((task) => ["open", "in_progress", "waiting"].includes(task.status)).length,
    suppressedNotificationEvents: jobberNotifications.filter((event) => event.delivery_status === "suppressed").length,
  },
  signals: jobberSignals.map((signal) => ({ key: signal.signal_key, status: signal.status, severity: signal.severity })),
  activeEvidence: evidence,
  tasks: jobberTasks.map((task) => ({ id: task.id, status: task.status, assignmentRole: task.assignment_role })),
  checks,
  issueCounts: {
    unapprovedActiveSignalKeys: activeJobberSignals.filter((signal) => !approvedKey(String(signal.signal_key))).length,
    activeSignalsWithoutMatchingEvidence: evidence.filter((item) => !item.matches).length,
    cpaVisibleSignals: jobberSignals.filter((signal) => signal.requires_cpa_review !== false || signal.cpa_review_level !== "none").length,
    nonOwnerTasks: jobberTasks.filter((task) => task.requires_cpa !== false || task.assignment_role !== "owner" || task.assigned_user_id == null).length,
    deliverableNotifications: jobberNotifications.filter((event) => event.delivery_status !== "suppressed" || event.payload?.delivery_enabled !== false).length,
    duplicateActiveSignalKeys: duplicateActiveSignalKeys.length,
    duplicateNotificationEventKeys: duplicateEventKeys.length,
  },
  passed: Object.values(checks).every(Boolean),
};

console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 2;
