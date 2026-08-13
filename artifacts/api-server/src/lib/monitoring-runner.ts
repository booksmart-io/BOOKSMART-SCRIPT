import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateFinancialReport, type FinancialCategory, type FinancialSubCategory, type FinancialTransaction } from "../../../booksmart/src/lib/financial-engine";
import { createFinancialSummary } from "../../../booksmart/src/lib/financial-summary";
import { evaluateConnectionHealth, evaluateTrustedSummary, signalCreatesTask, taskDueDate, type SignalCandidate } from "./monitoring";
import { loadConnectionStatus } from "./connection-status";
import { evaluateJobberOperationalPlanning, evaluateJobberOperationalRecords, jobberMonitoringEnabled, type JobberMonitoringRecord } from "./jobber-monitoring";
import { trustedTransactions } from "../../../booksmart/src/lib/trusted-transactions";
import { monitoringRunStatus } from "./monitoring-scheduler";

type Trigger = "manual" | "scheduled" | "event";
type RunCounters = { organizations_evaluated: number; signals_created: number; signals_updated: number; signals_resolved: number; tasks_created: number; notification_events_created: number; error_count: number };
const managedKeys = ["revenue-trend", "expense-trend", "net-income-trend", "uncategorized-transactions", "documents-needing-review", "negative-cash-movement"];

function canonicalSpendingKey(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
}

const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

type EvaluationTrace = {
  periodStart: string; periodEnd: string; comparisonStart: string; comparisonEnd: string;
  sourceIds: Array<number | string>; exclusions: string[];
};

async function persistCandidate(admin: SupabaseClient, organizationId: number, runId: number, candidate: SignalCandidate, trace: EvaluationTrace) {
  const now = new Date().toISOString();
  const payload = {
    organization_id: organizationId, signal_key: candidate.signalKey, signal_type: candidate.signalType,
    category: candidate.category, severity: candidate.severity, title: candidate.title, description: candidate.description,
    amount: candidate.currentValue, current_value: candidate.currentValue, comparison_value: candidate.comparisonValue,
    percentage: candidate.percentage, recommended_action: candidate.recommendedAction,
    cta_label: candidate.ctaLabel, cta_route: candidate.ctaRoute, requires_cpa_review: candidate.requiresCpaReview,
    cpa_review_level: candidate.cpaReviewLevel, calculation_version: candidate.calculationVersion ?? "financial-summary-v1",
    cpa_review_reason: candidate.requiresCpaReview ? candidate.recommendedAction : null,
    confidence: candidate.confidence ?? 1, last_seen_run_id: runId, updated_at: now, last_evaluated_at: now, expires_at: null,
    period_start: trace.periodStart, period_end: trace.periodEnd,
    comparison_start: trace.comparisonStart, comparison_end: trace.comparisonEnd,
    source_ids: candidate.sourceIds ?? trace.sourceIds, exclusions: candidate.exclusions ?? trace.exclusions,
    metadata: candidate.provider ? { provider: candidate.provider, direct_url: candidate.directUrl ?? null, source_record_type: candidate.sourceRecordType ?? null, accounting_effect: "none" } : {},
  };
  const { data: existing } = await admin.from("business_signals").select("id,status,dismissed_at,condition_cleared_at")
    .eq("organization_id", organizationId).eq("signal_key", candidate.signalKey)
    .order("detected_at", { ascending: false }).limit(1).maybeSingle();
  if (existing?.status === "active") {
    const { error } = await admin.from("business_signals").update(payload).eq("id", existing.id);
    if (error) throw error;
    return { id: Number(existing.id), created: false, actionable: true };
  }
  if (existing?.status === "dismissed" && existing.dismissed_at && Date.now() - new Date(existing.dismissed_at).getTime() < 30 * 86_400_000) {
    const { error } = await admin.from("business_signals").update({ last_evaluated_at: now, last_seen_run_id: runId }).eq("id", existing.id);
    if (error) throw error;
    return { id: Number(existing.id), created: false, actionable: false };
  }
  if (existing?.status === "resolved" && !existing.condition_cleared_at) {
    const { error } = await admin.from("business_signals").update({ last_evaluated_at: now, last_seen_run_id: runId }).eq("id", existing.id);
    if (error) throw error;
    return { id: Number(existing.id), created: false, actionable: false };
  }
  const { data, error } = await admin.from("business_signals").insert({ ...payload, status: "active", detected_at: now })
    .select("id").single();
  if (error) throw error;
  return { id: Number(data.id), created: true, actionable: true };
}

async function ensureTask(admin: SupabaseClient, organizationId: number, signalId: number, candidate: SignalCandidate) {
  if (!signalCreatesTask(candidate)) return null;
  const sourceId = String(signalId);
  const { data: existing } = await admin.from("financial_tasks").select("id,status").eq("organization_id", organizationId)
    .eq("source", "signal").eq("source_id", sourceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing) return null;
  const { data: organization } = await admin.from("organizations").select("owner_id").eq("id", organizationId).single();
  const { data: createdTask, error } = await admin.from("financial_tasks").insert({
    organization_id: organizationId, source: "signal", source_id: sourceId, category: candidate.category,
    priority: candidate.severity === "critical" ? "critical" : candidate.severity === "high" ? "high" : "medium",
    title: candidate.title, description: candidate.recommendedAction, status: "open", cta_label: candidate.ctaLabel,
    cta_route: candidate.ctaRoute, requires_cpa: candidate.requiresCpaReview, assigned_user_id: organization?.owner_id ?? null,
    due_date: taskDueDate(candidate),
    assignment_role: "owner", metadata: { signal_key: candidate.signalKey, calculation_version: candidate.calculationVersion ?? "financial-summary-v1", provider: candidate.provider ?? "booksmart", accounting_effect: "none" },
  }).select("id").single();
  if (error?.code === "23505") return null;
  if (error) throw error;
  const { error: eventError } = await admin.from("financial_task_events").insert({
    organization_id: organizationId, task_id: createdTask.id, actor_user_id: null,
    event_type: "created", from_status: null, to_status: "open",
    metadata: { source: "monitoring_runner", signal_id: signalId },
  });
  if (eventError) throw eventError;
  return Number(createdTask.id);
}

async function evaluateOrganization(admin: SupabaseClient, organizationId: number, runId: number, categories: FinancialCategory[], subCategories: FinancialSubCategory[]) {
  const today = dayStart(new Date());
  const currentStart = new Date(today); currentStart.setDate(currentStart.getDate() - 29);
  const previousStart = new Date(currentStart); previousStart.setDate(previousStart.getDate() - 30);
  const previousEnd = new Date(currentStart); previousEnd.setMilliseconds(-1);
  const [{ data, error }, { data: organization, error: organizationError }] = await Promise.all([
    admin.from("transactions")
    .select("id,title,amount,type,date_time,description,deductible,category_id,sub_category_id")
    .eq("org_id", organizationId).gte("date_time", previousStart.toISOString()).lte("date_time", new Date().toISOString()),
    admin.from("organizations").select("owner_id").eq("id", organizationId).single(),
  ]);
  if (error || organizationError) throw error ?? organizationError;
  const transactions = trustedTransactions("transactions", (data ?? []) as FinancialTransaction[]);
  const currentReport = calculateFinancialReport({ transactions, categories, subCategories, start: currentStart, end: new Date() });
  const previousReport = calculateFinancialReport({ transactions, categories, subCategories, start: previousStart, end: previousEnd });
  const current = createFinancialSummary({ report: currentReport });
  const previous = createFinancialSummary({ report: previousReport });
  const connectionStatus = await loadConnectionStatus(admin, organizationId, Number(organization.owner_id));
  const { data: documentRows, error: documentError } = await admin.from("user_documents")
    .select("id,parsed_data").eq("user_id", organization.owner_id).limit(500);
  if (documentError) throw documentError;
  const pendingDocumentIds = (documentRows ?? []).filter(row => {
    const parsed = row.parsed_data && typeof row.parsed_data === "object" ? row.parsed_data as Record<string, unknown> : {};
    const workflow = parsed.statement_workflow && typeof parsed.statement_workflow === "object" ? parsed.statement_workflow as Record<string, unknown> : {};
    return Number(workflow.organization_id) === organizationId && String(workflow.lifecycle_status) === "needs_review";
  }).map(row => Number(row.id));
  const expenseClasses = new Set(["cogs", "opex", "other_expense", "income_tax", "interest"]);
  const currentExpenses = currentReport.classifiedTransactions.filter(transaction => !transaction.isTransfer && transaction.amount < 0 && expenseClasses.has(transaction.classification));
  const previousExpenses = previousReport.classifiedTransactions.filter(transaction => !transaction.isTransfer && transaction.amount < 0 && expenseClasses.has(transaction.classification));
  const spending = (rows: typeof currentExpenses) => rows.reduce((map, transaction) => {
    const label = transaction.sub_category_name ?? transaction.category_name ?? transaction.classification.replaceAll("_", " ");
    const key = canonicalSpendingKey(label);
    const existing = map.get(key) ?? { key, label, amount: 0, sourceIds: [] as number[] };
    existing.amount += Math.abs(transaction.amount); existing.sourceIds.push(Number(transaction.id)); map.set(key, existing); return map;
  }, new Map<string, { key: string; label: string; amount: number; sourceIds: number[] }>());
  const currentSpending = spending(currentExpenses); const previousSpending = spending(previousExpenses);
  const categorySpending = [...currentSpending.values()].map(item => ({ key: item.key, label: item.label, current: item.amount, previous: previousSpending.get(item.key)?.amount ?? 0, sourceIds: item.sourceIds }));
  const absoluteAmounts = currentReport.classifiedTransactions.filter(transaction => !transaction.isTransfer).map(transaction => Math.abs(transaction.amount)).sort((a, b) => a - b);
  const median = absoluteAmounts.length ? absoluteAmounts[Math.floor(absoluteAmounts.length / 2)]! : 0;
  const largeThreshold = Math.max(2_500, median * 3);
  const largeApprovedTransactions = currentReport.classifiedTransactions.filter(transaction => !transaction.isTransfer && Math.abs(transaction.amount) >= largeThreshold)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 3)
    .map(transaction => ({ id: Number(transaction.id), title: transaction.title ?? transaction.description ?? "Transaction", amount: transaction.amount }));
  const financialCandidates = [...evaluateTrustedSummary({
    revenue: current.revenue, accountingExpenses: current.accountingExpenses, netIncome: current.netIncome,
    netCashMovement: current.netCashMovement, unclassifiedTransactionCount: current.unclassifiedTransactionCount,
    healthScore: current.health.score, comparison: { revenue: previous.revenue, accountingExpenses: previous.accountingExpenses, netIncome: previous.netIncome },
    categorySpending, largeApprovedTransactions,
    pendingDocumentReview: { count: pendingDocumentIds.length, sourceIds: pendingDocumentIds },
  }), ...evaluateConnectionHealth(connectionStatus.providers)];
  const jobberEnabled = jobberMonitoringEnabled();
  let jobberCandidates: SignalCandidate[] = [];
  if (jobberEnabled) {
    const { data: jobberRows, error: jobberError } = await admin.from("jobber_records")
      .select("external_id,object_type,record_number,status,title,amount,starts_at,ends_at,source_created_at,source_updated_at,direct_url,is_archived,payload")
      .eq("organization_id", organizationId).in("object_type", ["jobs", "scheduled_items", "quotes", "invoices"]);
    if (jobberError) throw jobberError;
    const normalizedJobberRows = (jobberRows ?? []) as JobberMonitoringRecord[];
    jobberCandidates = [...evaluateJobberOperationalRecords(normalizedJobberRows), ...evaluateJobberOperationalPlanning(normalizedJobberRows)];
  }
  const candidates = [...financialCandidates, ...jobberCandidates];
  let created = 0, updated = 0, tasks = 0, notificationEvents = 0;
  const trace: EvaluationTrace = {
    periodStart: currentStart.toISOString(), periodEnd: new Date().toISOString(),
    comparisonStart: previousStart.toISOString(), comparisonEnd: previousEnd.toISOString(),
    sourceIds: transactions.filter(transaction => {
      const at = new Date(transaction.date_time).getTime();
      return at >= currentStart.getTime() && at <= Date.now();
    }).map(transaction => Number(transaction.id)),
    exclusions: ["internal_transfers", "unapproved_records"],
  };
  for (const candidate of candidates) {
    const signal = await persistCandidate(admin, organizationId, runId, candidate, trace);
    signal.created ? created++ : updated++;
    if (!signal.actionable) continue;
    const createdTaskId = await ensureTask(admin, organizationId, signal.id, candidate);
    if (createdTaskId) tasks++;
    if (signal.created) {
      const { error: notificationError } = await admin.from("monitoring_notification_events").upsert({
        organization_id: organizationId, run_id: runId, signal_id: signal.id,
        event_key: `signal:${signal.id}:created`, event_type: "signal_created",
        delivery_status: "suppressed",
        payload: { title: candidate.title, severity: candidate.severity, category: candidate.category, cta_label: candidate.ctaLabel, cta_route: candidate.ctaRoute, delivery_enabled: false },
      }, { onConflict: "event_key", ignoreDuplicates: true });
      if (notificationError) throw notificationError;
      notificationEvents++;
    }
    if (createdTaskId) {
      const { error: taskNotificationError } = await admin.from("monitoring_notification_events").upsert({
        organization_id: organizationId, run_id: runId, signal_id: signal.id, task_id: createdTaskId,
        event_key: `task:${createdTaskId}:created`, event_type: "task_created",
        delivery_status: "suppressed",
        payload: { title: candidate.title, priority: candidate.severity, cta_label: candidate.ctaLabel, cta_route: candidate.ctaRoute, delivery_enabled: false },
      }, { onConflict: "event_key", ignoreDuplicates: true });
      if (taskNotificationError) throw taskNotificationError;
      notificationEvents++;
    }
  }
  const presentKeys = new Set(candidates.map(candidate => candidate.signalKey));
  const { data: openSignals, error: openError } = await admin.from("business_signals").select("id,signal_key,signal_type")
    .eq("organization_id", organizationId).eq("status", "active");
  if (openError) throw openError;
  const openManaged = (openSignals ?? []).filter(signal => managedKeys.includes(String(signal.signal_key)) || String(signal.signal_key).startsWith("category-spike:") || String(signal.signal_key).startsWith("large-transaction:") || signal.signal_type === "connection" || (jobberEnabled && String(signal.signal_key).startsWith("jobber:")));
  const staleIds = (openManaged ?? []).filter(signal => !presentKeys.has(String(signal.signal_key))).map(signal => signal.id);
  const staleSignalIds = staleIds.map(String);
  const recoveredConnectionIds = openManaged
    .filter(signal => signal.signal_type === "connection" && !presentKeys.has(String(signal.signal_key)))
    .map(signal => String(signal.id));
  let resolvedCount = 0;
  if (staleIds.length) {
    const clearedAt = new Date().toISOString();
    const { data: resolved, error: resolveError } = await admin.from("business_signals")
      .update({ status: "resolved", resolved_at: clearedAt, condition_cleared_at: clearedAt, updated_at: clearedAt })
      .in("id", staleIds).select("id");
    if (resolveError) throw resolveError;
    resolvedCount = resolved?.length ?? 0;
  }
  const { data: awaitingClear, error: awaitingClearError } = await admin.from("business_signals")
    .select("id,signal_key,signal_type").eq("organization_id", organizationId).eq("status", "resolved").is("condition_cleared_at", null);
  if (awaitingClearError) throw awaitingClearError;
  const clearedResolvedIds = (awaitingClear ?? []).filter(signal => {
    const key = String(signal.signal_key);
    const managed = managedKeys.includes(key) || key.startsWith("category-spike:") || key.startsWith("large-transaction:") || signal.signal_type === "connection" || (jobberEnabled && key.startsWith("jobber:"));
    return managed && !presentKeys.has(key);
  }).map(signal => signal.id);
  if (clearedResolvedIds.length) {
    const clearedAt = new Date().toISOString();
    const { error: clearError } = await admin.from("business_signals").update({ condition_cleared_at: clearedAt, updated_at: clearedAt }).in("id", clearedResolvedIds);
    if (clearError) throw clearError;
  }
  if (staleSignalIds.length > 0) {
    const { data: recoveredTasks, error: recoveredTaskError } = await admin.from("financial_tasks")
      .select("id,status,source_id,metadata").eq("organization_id", organizationId).eq("source", "signal")
      .in("source_id", staleSignalIds).in("status", ["open", "in_progress", "waiting"]);
    if (recoveredTaskError) throw recoveredTaskError;
    const completedAt = new Date().toISOString();
    for (const task of recoveredTasks ?? []) {
      const connectionRecovered = recoveredConnectionIds.includes(String(task.source_id));
      const resolution = connectionRecovered ? "connection_recovered" : "signal_resolved";
      const { error: completionError } = await admin.from("financial_tasks").update({
        status: "completed", completed_at: completedAt, updated_at: completedAt,
        metadata: { ...(task.metadata && typeof task.metadata === "object" ? task.metadata : {}), resolution, completed_by: "monitoring_runner" },
      }).eq("id", task.id).eq("organization_id", organizationId);
      if (completionError) throw completionError;
      const { error: eventError } = await admin.from("financial_task_events").insert({
        organization_id: organizationId, task_id: task.id, actor_user_id: null,
        event_type: "completed", from_status: task.status, to_status: "completed",
        note: connectionRecovered ? "Connection recovered; task completed automatically." : "Underlying signal is no longer active; task completed automatically.",
        metadata: { source: "monitoring_runner", resolution },
      });
      if (eventError) throw eventError;
      if (connectionRecovered) {
        const { error: recoveryNotificationError } = await admin.from("monitoring_notification_events").upsert({
          organization_id: organizationId, run_id: runId, task_id: task.id,
          event_key: `task:${task.id}:connection-recovered`, event_type: "connection_recovered",
          delivery_status: "suppressed",
          payload: { title: "Connection recovered", task_id: task.id, delivery_enabled: false },
        }, { onConflict: "event_key", ignoreDuplicates: true });
        if (recoveryNotificationError) throw recoveryNotificationError;
        notificationEvents++;
      }
    }
  }
  return { created, updated, resolved: resolvedCount, tasks, notificationEvents };
}

export async function runMonitoring(admin: SupabaseClient, trigger: Trigger, organizationId?: number, options: { idempotencyKey?: string } = {}) {
  if (options.idempotencyKey) {
    const { data: existingRun, error: existingRunError } = await admin.from("monitoring_runs").select("*").eq("idempotency_key", options.idempotencyKey).maybeSingle();
    if (existingRunError) throw existingRunError;
    if (existingRun) return existingRun;
  }
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  await admin.from("monitoring_runs").update({
    status: "failed", completed_at: new Date().toISOString(), error_count: 1,
    errors: [{ message: "Monitoring run exceeded the 30-minute execution lease." }],
  }).eq("status", "running").lt("started_at", staleBefore);
  const { data: run, error: runError } = await admin.from("monitoring_runs").insert({
    organization_id: organizationId ?? null, trigger_type: trigger, status: "running",
    idempotency_key: options.idempotencyKey ?? null,
    calculation_version: "financial-summary-v1", metadata: { notifications_enabled: false, transaction_writes_enabled: false },
  }).select("id").single();
  if (runError?.code === "23505" && options.idempotencyKey) {
    const { data: existingRun, error: retryError } = await admin.from("monitoring_runs").select("*").eq("idempotency_key", options.idempotencyKey).maybeSingle();
    if (retryError) throw retryError;
    if (existingRun) return existingRun;
  }
  if (runError) throw runError;
  const runId = Number(run.id);
  try {
  const counters: RunCounters = { organizations_evaluated: 0, signals_created: 0, signals_updated: 0, signals_resolved: 0, tasks_created: 0, notification_events_created: 0, error_count: 0 };
  const errors: Array<{ organization_id: number; message: string }> = [];
  const [{ data: organizations, error: organizationsError }, { data: categoryRows, error: categoryError }, { data: subCategoryRows, error: subCategoryError }] = await Promise.all([
    organizationId ? admin.from("organizations").select("id").eq("id", organizationId) : admin.from("organizations").select("id").order("id"),
    admin.from("category").select("id,name"), admin.from("sub_category").select("id,name,category_id"),
  ]);
  if (organizationsError || categoryError || subCategoryError) throw organizationsError ?? categoryError ?? subCategoryError;
  for (const organization of organizations ?? []) {
    try {
      const result = await evaluateOrganization(admin, Number(organization.id), runId, (categoryRows ?? []) as FinancialCategory[], (subCategoryRows ?? []) as FinancialSubCategory[]);
      counters.organizations_evaluated++; counters.signals_created += result.created; counters.signals_updated += result.updated;
      counters.signals_resolved += result.resolved; counters.tasks_created += result.tasks;
      counters.notification_events_created += result.notificationEvents;
    } catch (error) {
      counters.error_count++; errors.push({ organization_id: Number(organization.id), message: error instanceof Error ? error.message : "Evaluation failed" });
    }
  }
  const status = monitoringRunStatus(counters.organizations_evaluated, counters.error_count);
  const { data: completed, error: completeError } = await admin.from("monitoring_runs").update({
    ...counters, status, errors, completed_at: new Date().toISOString(),
  }).eq("id", runId).select("*").single();
  if (completeError) throw completeError;
  return completed;
  } catch (error) {
    await admin.from("monitoring_runs").update({
      status: "failed", completed_at: new Date().toISOString(), error_count: 1,
      errors: [{ message: error instanceof Error ? error.message : "Monitoring run failed." }],
    }).eq("id", runId).eq("status", "running");
    throw error;
  }
}

export function scheduleMonitoringEvaluation(admin: SupabaseClient, organizationId: number, reason: string) {
  const bucket = Math.floor(Date.now() / (5 * 60_000));
  const idempotencyKey = `event:${reason}:${organizationId}:${bucket}`;
  void runMonitoring(admin, "event", organizationId, { idempotencyKey }).catch(error => {
    console.error(`[monitoring/event/${reason}]`, error instanceof Error ? error.message : error);
  });
}
