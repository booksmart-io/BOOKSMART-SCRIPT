import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateFinancialReport, type FinancialCategory, type FinancialSubCategory, type FinancialTransaction } from "../../../booksmart/src/lib/financial-engine";
import { buildCanonicalHomeSummaryPair, CANONICAL_FINANCIAL_SUMMARY_VERSION, type CanonicalStatementDocument } from "./canonical-financial-summary";
import type { DeductionRule, DeductionRuleGroup, OrgRow } from "../../../booksmart/src/lib/deduction-calculation";
import { evaluateConnectionHealth, evaluateTrustedSummary, signalCreatesTask, taskDueDate, type SignalCandidate } from "./monitoring";
import { loadConnectionStatus } from "./connection-status";
import { evaluateApprovedJobberCandidates, isJobberLifecycleKey, jobberMonitoringEnabled, type JobberMonitoringRecord } from "./jobber-monitoring";
import { trustedTransactions } from "../../../booksmart/src/lib/trusted-transactions";
import { monitoringRunStatus } from "./monitoring-scheduler";
import { contractorMonitoringEnabled, evaluateContractorSignals, isContractorLifecycleKey } from "./contractor-monitoring";

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
    cpa_review_level: candidate.cpaReviewLevel, calculation_version: candidate.calculationVersion ?? "monitoring-rules-v1",
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
  if (error?.code === "23505") {
    const { data: concurrent, error: concurrentError } = await admin.from("business_signals").select("id")
      .eq("organization_id", organizationId).eq("signal_key", candidate.signalKey).eq("status", "active").maybeSingle();
    if (concurrentError) throw concurrentError;
    if (concurrent) {
      const { error: updateError } = await admin.from("business_signals").update(payload).eq("id", concurrent.id);
      if (updateError) throw updateError;
      return { id: Number(concurrent.id), created: false, actionable: true };
    }
  }
  if (error) throw error;
  return { id: Number(data.id), created: true, actionable: true };
}

async function ensureTask(admin: SupabaseClient, organizationId: number, signalId: number, candidate: SignalCandidate) {
  if (!signalCreatesTask(candidate)) return null;
  const sourceId = String(signalId);
  const { data: sameConditionTasks, error: sameConditionError } = await admin.from("financial_tasks").select("id,status,source_id,metadata")
    .eq("organization_id", organizationId).eq("source", "signal").contains("metadata", { signal_key: candidate.signalKey })
    .in("status", ["open", "in_progress", "waiting"]).order("created_at", { ascending: true });
  if (sameConditionError) throw sameConditionError;
  if ((sameConditionTasks ?? []).length) {
    const duplicates = (sameConditionTasks ?? []).slice(1);
    const completedAt = new Date().toISOString();
    for (const duplicate of duplicates) {
      const { error: duplicateError } = await admin.from("financial_tasks").update({ status: "completed", completed_at: completedAt, updated_at: completedAt,
        metadata: { ...(duplicate.metadata && typeof duplicate.metadata === "object" ? duplicate.metadata : {}), resolution: "duplicate_signal_task", completed_by: "monitoring_runner" } })
        .eq("id", duplicate.id).eq("organization_id", organizationId);
      if (duplicateError) throw duplicateError;
      const { error: eventError } = await admin.from("financial_task_events").insert({ organization_id: organizationId, task_id: duplicate.id,
        actor_user_id: null, event_type: "completed", from_status: duplicate.status, to_status: "completed",
        note: "Duplicate monitoring task completed automatically; the original task remains active.", metadata: { source: "monitoring_runner", resolution: "duplicate_signal_task" } });
      if (eventError) throw eventError;
    }
    return null;
  }
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
    assignment_role: "owner", metadata: { signal_key: candidate.signalKey, calculation_version: candidate.calculationVersion ?? "monitoring-rules-v1", provider: candidate.provider ?? "booksmart", accounting_effect: "none" },
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
  const { data: organization, error: organizationError } = await admin.from("organizations").select("*").eq("id", organizationId).single();
  if (organizationError) throw organizationError;
  const [transactionResult, documentResult, ruleGroupResult, ruleResult] = await Promise.all([
    admin.from("transactions")
    .select("id,title,amount,type,date_time,description,deductible,category_id,sub_category_id,pending")
    .eq("org_id", organizationId).gte("date_time", previousStart.toISOString()).lte("date_time", new Date().toISOString()),
    admin.from("user_documents").select("id,name,category,tax_year,parsed_data").eq("user_id", organization.owner_id).limit(500),
    admin.from("deduction_rule_groups").select("*"),
    admin.from("deduction_rules").select("*"),
  ]);
  const loadError = transactionResult.error ?? documentResult.error ?? ruleGroupResult.error ?? ruleResult.error;
  if (loadError) throw loadError;
  const transactions = trustedTransactions("transactions", (transactionResult.data ?? []) as FinancialTransaction[]);
  const currentReport = calculateFinancialReport({ transactions, categories, subCategories, start: currentStart, end: new Date() });
  const previousReport = calculateFinancialReport({ transactions, categories, subCategories, start: previousStart, end: previousEnd });
  const { current, previous } = buildCanonicalHomeSummaryPair({
    organizationId,
    currentStart,
    currentEnd: new Date(),
    previousStart,
    previousEnd,
    transactions,
    categories,
    subCategories,
    documents: (documentResult.data ?? []) as CanonicalStatementDocument[],
    organization: organization as OrgRow,
    deductionRuleGroups: (ruleGroupResult.data ?? []) as DeductionRuleGroup[],
    deductionRules: (ruleResult.data ?? []) as DeductionRule[],
  });
  const connectionStatus = await loadConnectionStatus(admin, organizationId, Number(organization.owner_id));
  const documentRows = documentResult.data ?? [];
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
    netCashMovement: current.netCashMovement, unclassifiedTransactionCount: current.completeness.uncategorizedTransactionCount,
    healthScore: current.health.score, comparison: { revenue: previous.revenue, accountingExpenses: previous.accountingExpenses, netIncome: previous.netIncome },
    categorySpending, largeApprovedTransactions,
    pendingDocumentReview: { count: pendingDocumentIds.length, sourceIds: pendingDocumentIds },
  }).map(candidate => ({ ...candidate, calculationVersion: current.calculationVersion })), ...evaluateConnectionHealth(connectionStatus.providers)];
  const jobberEnabled = jobberMonitoringEnabled(organizationId);
  const contractorEnabled = contractorMonitoringEnabled();
  let jobberCandidates: SignalCandidate[] = [];
  let normalizedJobberRows: JobberMonitoringRecord[] = [];
  if (jobberEnabled || contractorEnabled) {
    const { data: jobberRows, error: jobberError } = await admin.from("jobber_records")
      .select("external_id,object_type,record_number,status,title,amount,starts_at,ends_at,source_created_at,source_updated_at,direct_url,is_archived,payload")
      .eq("organization_id", organizationId).in("object_type", ["jobs", "scheduled_items", "quotes", "invoices"]);
    if (jobberError) throw jobberError;
    normalizedJobberRows = (jobberRows ?? []) as JobberMonitoringRecord[];
    if (jobberEnabled) jobberCandidates = evaluateApprovedJobberCandidates(normalizedJobberRows);
  }
  let contractorCandidates: SignalCandidate[] = [];
  if (contractorEnabled) {
    const [settingsResult, assignmentsResult, matchesResult, linksResult] = await Promise.all([
      admin.from("contractor_financial_settings").select("target_gross_margin").eq("organization_id", organizationId).maybeSingle(),
      admin.from("contractor_job_cost_assignments").select("jobber_job_id,amount,source_record_id").eq("organization_id", organizationId),
      admin.from("contractor_financial_matches").select("id,source_record_id").eq("organization_id", organizationId).eq("requires_confirmation", true).eq("status", "suggested"),
      admin.from("contractor_source_links").select("right_record_id").eq("organization_id", organizationId).eq("right_record_type", "transaction").eq("status", "confirmed"),
    ]);
    const contractorError = settingsResult.error ?? assignmentsResult.error ?? matchesResult.error ?? linksResult.error;
    if (contractorError) throw contractorError;
    const assignmentsByJob = new Map<string, { total: number; count: number }>();
    for (const row of assignmentsResult.data ?? []) {
      const jobId = String(row.jobber_job_id); const existing = assignmentsByJob.get(jobId) ?? { total: 0, count: 0 };
      existing.total += Number(row.amount ?? 0); existing.count++; assignmentsByJob.set(jobId, existing);
    }
    const confirmedReceiptTransactionIds = new Set((linksResult.data ?? []).map(row => String(row.right_record_id)));
    const assignedTransactionIds = new Set((assignmentsResult.data ?? []).map(row => String(row.source_record_id)));
    const receiptReviewTransactionIds = transactions.filter(transaction => transaction.amount < 0
      && Math.abs(transaction.amount) >= 500 && !confirmedReceiptTransactionIds.has(String(transaction.id))).map(transaction => String(transaction.id));
    const currentExpenseTransactionIds = currentExpenses.map(transaction => String(transaction.id));
    const unassignedExpenseTransactionIds = currentExpenseTransactionIds.filter(id => !assignedTransactionIds.has(id));
    contractorCandidates = evaluateContractorSignals({
      targetGrossMargin: settingsResult.data?.target_gross_margin == null ? null : Number(settingsResult.data.target_gross_margin),
      jobs: normalizedJobberRows.filter(row => row.object_type === "jobs" && !row.is_archived).map(row => ({ id: row.external_id,
        title: row.title, status: row.status, invoiced: Number(row.payload.invoicedTotal ?? 0), trackedCosts: assignmentsByJob.get(row.external_id)?.total ?? 0,
        costCount: assignmentsByJob.get(row.external_id)?.count ?? 0 })),
      invoices: normalizedJobberRows.filter(row => row.object_type === "invoices" && !row.is_archived).map(row => ({ id: row.external_id,
        number: row.record_number, balance: Number((row.payload.amounts as Record<string, unknown> | undefined)?.invoiceBalance ?? row.amount ?? 0),
        dueDate: typeof row.payload.dueDate === "string" ? row.payload.dueDate : null,
        jobId: typeof (row.payload.job as Record<string, unknown> | undefined)?.id === "string" ? String((row.payload.job as Record<string, unknown>).id) : typeof row.payload.jobId === "string" ? row.payload.jobId : null,
        clientId: typeof (row.payload.client as Record<string, unknown> | undefined)?.id === "string" ? String((row.payload.client as Record<string, unknown>).id) : typeof row.payload.clientId === "string" ? row.payload.clientId : null })),
      confirmationMatches: (matchesResult.data ?? []).map(row => ({ id: String(row.id), sourceId: String(row.source_record_id) })),
      receiptReviewTransactionIds,
      unassignedExpenseTransactionIds,
    });
  }
  const candidates = [...financialCandidates, ...jobberCandidates, ...contractorCandidates];
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
  const openManaged = (openSignals ?? []).filter(signal => managedKeys.includes(String(signal.signal_key)) || String(signal.signal_key).startsWith("category-spike:") || String(signal.signal_key).startsWith("large-transaction:") || signal.signal_type === "connection" || (jobberEnabled && isJobberLifecycleKey(String(signal.signal_key))) || (contractorEnabled && isContractorLifecycleKey(String(signal.signal_key))));
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
    const managed = managedKeys.includes(key) || key.startsWith("category-spike:") || key.startsWith("large-transaction:") || signal.signal_type === "connection" || (jobberEnabled && isJobberLifecycleKey(key)) || (contractorEnabled && isContractorLifecycleKey(key));
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

export async function runMonitoring(admin: SupabaseClient, trigger: Trigger, organizationId?: number, options: {
  idempotencyKey?: string;
  beforeEvaluateOrganization?: (organizationId: number) => Promise<unknown>;
} = {}) {
  if (options.idempotencyKey) {
    const { data: existingRun, error: existingRunError } = await admin.from("monitoring_runs").select("*").eq("idempotency_key", options.idempotencyKey).maybeSingle();
    if (existingRunError) throw existingRunError;
    if (existingRun) return existingRun;
  }
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  const { error: staleRunError } = await admin.from("monitoring_runs").update({
    status: "failed", completed_at: new Date().toISOString(), error_count: 1,
    errors: [{ message: "Monitoring run exceeded the 30-minute execution lease." }],
  }).eq("status", "running").lt("started_at", staleBefore);
  if (staleRunError) throw staleRunError;
  const { data: run, error: runError } = await admin.from("monitoring_runs").insert({
    organization_id: organizationId ?? null, trigger_type: trigger, status: "running",
    idempotency_key: options.idempotencyKey ?? null,
    calculation_version: CANONICAL_FINANCIAL_SUMMARY_VERSION, metadata: { notifications_enabled: false, transaction_writes_enabled: false },
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
      const currentOrganizationId = Number(organization.id);
      if (options.beforeEvaluateOrganization) await options.beforeEvaluateOrganization(currentOrganizationId);
      const result = await evaluateOrganization(admin, currentOrganizationId, runId, (categoryRows ?? []) as FinancialCategory[], (subCategoryRows ?? []) as FinancialSubCategory[]);
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
