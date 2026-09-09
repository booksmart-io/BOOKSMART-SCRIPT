import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateFinancialReport, type FinancialCategory, type FinancialSubCategory, type FinancialTransaction } from "../../../booksmart/src/lib/financial-engine";
import { buildCanonicalHomeSummaryPair, CANONICAL_FINANCIAL_SUMMARY_VERSION, type CanonicalStatementDocument } from "./canonical-financial-summary";
import type { DeductionRule, DeductionRuleGroup, OrgRow } from "../../../booksmart/src/lib/deduction-calculation";
import { evaluateConnectionHealth, evaluateTrustedSummary, signalCreatesTask, taskDueDate, type SignalCandidate } from "./monitoring";
import { loadConnectionStatus } from "./connection-status";
import { evaluateApprovedJobberCandidates, isJobberLifecycleKey, jobberMonitoringEnabled, type JobberMonitoringRecord } from "./jobber-monitoring";
import { trustedTransactions } from "../../../booksmart/src/lib/trusted-transactions";
import { monitoringRunStatus } from "./monitoring-scheduler";
import { contractorMonitoringEnabled, evaluateContractorSignals, isContractorLifecycleKey, mergeUpcomingObligations } from "./contractor-monitoring";
import { extractUpcomingObligations } from "./contractor-obligations";

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
    metadata: {
      ...(candidate.provider ? { provider: candidate.provider, direct_url: candidate.directUrl ?? null, source_record_type: candidate.sourceRecordType ?? null, accounting_effect: "none" } : {}),
      evidence: candidate.evidence ?? [], calculation: candidate.calculation ?? null,
    },
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
    .select("id,title,amount,type,date_time,description,deductible,category_id,sub_category_id,pending,plaid_category,plaid_transaction_id")
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
  const duplicateExpenseMap = new Map<string, { amount: number; title: string; sourceIds: number[] }>();
  for (const transaction of currentExpenses) {
    const title = String(transaction.title ?? "").trim();
    const description = String(transaction.description ?? "").trim();
    // QuickBooks import descriptions contain the unique provider record ID;
    // use the normalized display title as the business identity in that case.
    const identityText = /^Imported from QuickBooks /i.test(description) ? title : `${title} ${description}`;
    const normalizedText = identityText.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const date = new Date(transaction.date_time).toISOString().slice(0, 10);
    const key = `${date}|${Math.abs(transaction.amount).toFixed(2)}|${normalizedText}`;
    const group = duplicateExpenseMap.get(key) ?? { amount: Math.abs(transaction.amount), title: title || description || "Expense", sourceIds: [] };
    group.sourceIds.push(Number(transaction.id)); duplicateExpenseMap.set(key, group);
  }
  const duplicateExpenseGroups = [...duplicateExpenseMap.values()].filter(group => group.sourceIds.length > 1);
  const financialCandidates = [...evaluateTrustedSummary({
    revenue: current.revenue, accountingExpenses: current.accountingExpenses, netIncome: current.netIncome,
    netCashMovement: current.netCashMovement, unclassifiedTransactionCount: current.completeness.uncategorizedTransactionCount,
    healthScore: current.health.score, comparison: { revenue: previous.revenue, accountingExpenses: previous.accountingExpenses, netIncome: previous.netIncome },
    categorySpending, largeApprovedTransactions,
    duplicateExpenseGroups,
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
    const [settingsResult, assignmentsResult, matchesResult, linksResult, quickBooksInvoiceResult, gmailMessagesResult, cashBalanceResult] = await Promise.all([
      admin.from("contractor_financial_settings").select("target_gross_margin").eq("organization_id", organizationId).maybeSingle(),
      admin.from("contractor_job_cost_assignments").select("jobber_job_id,amount,source_record_id").eq("organization_id", organizationId),
      admin.from("contractor_financial_matches").select("id,source_record_id").eq("organization_id", organizationId).eq("requires_confirmation", true).eq("status", "suggested"),
      admin.from("contractor_source_links").select("right_record_id").eq("organization_id", organizationId).eq("right_record_type", "transaction").eq("status", "confirmed"),
      admin.from("quickbooks_staged_entities").select("external_id,entity_type,display_name,payload").eq("organization_id", organizationId).in("entity_type", ["Invoice", "Bill", "Payment", "Purchase"]),
      admin.from("contractor_gmail_financial_messages").select("gmail_message_id,sender,subject,message_date,detected_document_type,confidence,status").eq("organization_id", organizationId),
      admin.from("account_balance_snapshots").select("available_balance,balance_timestamp,fetched_at").eq("organization_id", organizationId).eq("provider", "plaid").order("balance_timestamp", { ascending: false }).limit(25),
    ]);
    const contractorError = settingsResult.error ?? assignmentsResult.error ?? matchesResult.error ?? linksResult.error ?? quickBooksInvoiceResult.error ?? gmailMessagesResult.error ?? cashBalanceResult.error;
    if (contractorError) throw contractorError;
    const assignmentsByJob = new Map<string, { total: number; count: number; sourceIds: string[] }>();
    for (const row of assignmentsResult.data ?? []) {
      const jobId = String(row.jobber_job_id); const existing = assignmentsByJob.get(jobId) ?? { total: 0, count: 0, sourceIds: [] };
      existing.total += Number(row.amount ?? 0); existing.count++; existing.sourceIds.push(String(row.source_record_id)); assignmentsByJob.set(jobId, existing);
    }
    const confirmedReceiptTransactionIds = new Set((linksResult.data ?? []).map(row => String(row.right_record_id)));
    const assignedTransactionIds = new Set((assignmentsResult.data ?? []).map(row => String(row.source_record_id)));
    const receiptReviewTransactionIds = transactions.filter(transaction => transaction.amount < 0
      && Math.abs(transaction.amount) >= 500 && !confirmedReceiptTransactionIds.has(String(transaction.id))).map(transaction => String(transaction.id));
    const currentExpenseTransactionIds = currentExpenses.map(transaction => String(transaction.id));
    const unassignedExpenseTransactionIds = currentExpenseTransactionIds.filter(id => !assignedTransactionIds.has(id));
    const gmailObligations = extractUpcomingObligations((gmailMessagesResult.data ?? []).map(row => ({ id: String(row.gmail_message_id), sender: row.sender,
      subject: row.subject, messageDate: row.message_date, documentType: String(row.detected_document_type), confidence: row.confidence as "high" | "medium" | "low", status: row.status })), today);
    const quickBooksObligations = (quickBooksInvoiceResult.data ?? []).filter(row => row.entity_type === "Bill").flatMap(row => {
      const payload = row.payload as Record<string, unknown>;
      if (String(payload.status ?? "").toLowerCase() !== "open") return [];
      const amount = Number(payload.amount ?? 0); const dueDate = typeof payload.dueDate === "string" ? payload.dueDate : null;
      if (!(amount > 0) || !dueDate) return [];
      const kind = String(payload.kind ?? "").toLowerCase() === "payroll" ? "payroll" as const : "vendor_bill" as const;
      return [{ id: `quickbooks:${row.external_id}`, kind, amount, dueDate, confidence: "high" as const, provider: "quickbooks" as const }];
    });
    const upcomingObligations = mergeUpcomingObligations(gmailObligations.map(row => ({ ...row, provider: "gmail" as const })), quickBooksObligations);
    const availableCash = (cashBalanceResult.data ?? []).reduce((sum, row) => sum + Number(row.available_balance ?? 0), 0);
    const allRawTransactions = ((transactionResult.data ?? []) as Array<Record<string, unknown>>).filter(row => row.pending !== true);
    const currentRawTransactions = allRawTransactions.filter(row => new Date(String(row.date_time)).getTime() >= currentStart.getTime());
    const customerPayments = currentRawTransactions.filter(row => Array.isArray(row.plaid_category) && row.plaid_category.includes("customer_payment")
      && !row.plaid_category.some(value => typeof value === "string" && value.startsWith("original:")) && Number(row.amount) > 0)
      .map(row => ({ id: String(row.id), amount: Number(row.amount) }));
    const currentNetMovement = currentRawTransactions.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const ignoredMatchTokens = new Set(["zelle", "payment", "receipt", "invoice", "customer", "materials", "confirmation", "debit", "credit", "card", "bank"]);
    const matchTokens = (value: unknown) => String(value ?? "").toLowerCase().match(/[a-z0-9]+/g)?.filter(token => token.length >= 4 && !ignoredMatchTokens.has(token)) ?? [];
    const subjectAmount = (value: unknown) => { const matched = String(value ?? "").match(/\$\s*([\d,]+(?:\.\d{1,2})?)/); return matched ? Number(matched[1]!.replaceAll(",", "")) : null; };
    const bankEmailMatches = currentRawTransactions.flatMap(row => {
      const amount = Math.abs(Number(row.amount ?? 0)); const tokens = new Set(matchTokens(`${row.title ?? ""} ${row.description ?? ""}`));
      if (!(amount > 0) || !tokens.size) return [];
      const candidates = (gmailMessagesResult.data ?? []).filter(message => Math.abs(Number(subjectAmount(message.subject)) - amount) <= .01
        && matchTokens(message.subject).some(token => tokens.has(token)));
      if (candidates.length !== 1) return [];
      const email = candidates[0]!; const shared = matchTokens(email.subject).find(token => tokens.has(token))!;
      return [{ id: `${row.id}-${email.gmail_message_id}`, bankRecordId: String(row.plaid_transaction_id ?? row.id), emailRecordId: String(email.gmail_message_id), amount, label: shared.replace(/^./, char => char.toUpperCase()) }];
    });
    const quickBooksPayments = (quickBooksInvoiceResult.data ?? []).filter(row => row.entity_type === "Payment").map(row => {
      const payload = row.payload as Record<string, unknown>;
      return { id: String(row.external_id), amount: Number(payload.amount ?? 0), customerName: String(payload.customerName ?? ""), tokens: matchTokens(payload.customerName) };
    });
    const economicEventEvidence = (() => {
      const staged = (quickBooksInvoiceResult.data ?? []).filter(row => row.entity_type === "Payment").map(row => ({ id: String(row.external_id), payload: row.payload as Record<string, unknown> }));
      const qbRefunds = staged.filter(row => String(row.payload.reason ?? "").toLowerCase().includes("refund") && typeof row.payload.paymentId === "string");
      const bankRefunds = allRawTransactions.filter(row => Array.isArray(row.plaid_category) && row.plaid_category.includes("refund"));
      const evidence: import("./contractor-economic-event-reconciler").EconomicEventEvidence[] = [];
      for (const qbRefund of qbRefunds) {
        const qbPayment = staged.find(row => row.id === String(qbRefund.payload.paymentId));
        if (!qbPayment) continue;
        const qbPaymentAmount = Number(qbPayment.payload.amount ?? 0); const qbRefundAmount = Number(qbRefund.payload.amount ?? 0);
        for (const bankRefund of bankRefunds) {
          const related = Array.isArray(bankRefund.plaid_category) ? bankRefund.plaid_category.find(value => typeof value === "string" && value.startsWith("related:"))?.slice(8) : null;
          if (!related) continue;
          const bankPayment = allRawTransactions.find(row => String(row.plaid_transaction_id ?? "").endsWith(`-${related}`));
          if (!bankPayment || Math.abs(Number(bankPayment.amount ?? 0) - qbPaymentAmount) > .01 || Math.abs(Math.abs(Number(bankRefund.amount ?? 0)) - qbRefundAmount) > .01) continue;
          const bankPaymentExternalId = String(bankPayment.plaid_transaction_id ?? bankPayment.id);
          const providerPrefix = bankPaymentExternalId.endsWith(related) ? bankPaymentExternalId.slice(0, -related.length) : "";
          const bankRefundExternalId = String(bankRefund.plaid_transaction_id ?? bankRefund.id);
          const normalizedBankRefundId = providerPrefix && bankRefundExternalId.startsWith(providerPrefix) ? bankRefundExternalId.slice(providerPrefix.length) : bankRefundExternalId;
          const correlationKey = `verified-refund-chain:${qbPayment.id}:${bankPaymentExternalId}`;
          evidence.push(
            { id: qbPayment.id, source: "quickbooks", kind: "customer_payment", amount: qbPaymentAmount, date: String(qbPayment.payload.date ?? ""), correlationKey },
            { id: related, source: "plaid", kind: "customer_payment", amount: Number(bankPayment.amount), date: String(bankPayment.date_time), correlationKey },
            { id: qbRefund.id, source: "quickbooks", kind: "refund", amount: qbRefundAmount, date: String(qbRefund.payload.date ?? ""), correlationKey, reverses: correlationKey },
            { id: normalizedBankRefundId, source: "plaid", kind: "refund", amount: Math.abs(Number(bankRefund.amount)), date: String(bankRefund.date_time), correlationKey, reverses: correlationKey },
          );
        }
      }
      const manualRows = allRawTransactions.filter(row => Array.isArray(row.plaid_category) && row.plaid_category.some(value => typeof value === "string" && value.startsWith("original:")));
      for (const manual of manualRows) {
        const originalId = (manual.plaid_category as string[]).find(value => value.startsWith("original:"))!.slice(9);
        const bank = allRawTransactions.find(row => String(row.plaid_transaction_id ?? "").endsWith(`-${originalId}`));
        if (!bank || Math.abs(Number(bank.amount ?? 0) - Number(manual.amount ?? 0)) > .01) continue;
        const qbCandidates = staged.filter(row => !row.payload.reason && Math.abs(Number(row.payload.amount ?? 0) - Number(bank.amount ?? 0)) <= .01);
        const emails = (gmailMessagesResult.data ?? []).filter(message => Math.abs(Number(subjectAmount(message.subject)) - Math.abs(Number(bank.amount ?? 0))) <= .01 && /payment/i.test(String(message.subject)));
        if (qbCandidates.length !== 1 || emails.length !== 1) continue;
        const prefix = String(bank.plaid_transaction_id ?? "").slice(0, -originalId.length);
        const manualExternal = String(manual.plaid_transaction_id ?? manual.id); const manualId = prefix && manualExternal.startsWith(prefix) ? manualExternal.slice(prefix.length) : manualExternal;
        const correlationKey = `verified-payment-chain:${qbCandidates[0]!.id}:${originalId}`; const amount = Math.abs(Number(bank.amount));
        evidence.push(
          { id: qbCandidates[0]!.id, source: "quickbooks", kind: "customer_payment", amount, date: String(qbCandidates[0]!.payload.date ?? ""), correlationKey },
          { id: originalId, source: "plaid", kind: "customer_payment", amount, date: String(bank.date_time), correlationKey },
          { id: manualId, source: "manual_statement", kind: "customer_payment", amount, date: String(manual.date_time), correlationKey },
          { id: String(emails[0]!.gmail_message_id), source: "gmail", kind: "customer_payment", amount, date: String(emails[0]!.message_date), correlationKey, evidenceOnly: true },
        );
      }
      const purchases = (quickBooksInvoiceResult.data ?? []).filter(row => row.entity_type === "Purchase").map(row => ({ id: String(row.external_id), payload: row.payload as Record<string, unknown> }));
      for (const purchase of purchases) {
        const amount = Math.abs(Number(purchase.payload.amount ?? 0)); const date = String(purchase.payload.date ?? "").slice(0, 10); const vendorTokens = new Set(matchTokens(purchase.payload.vendor));
        const banks = allRawTransactions.filter(row => typeof row.plaid_transaction_id === "string" && Array.isArray(row.plaid_category)
          && !row.plaid_category.some(value => typeof value === "string" && value.startsWith("original:"))
          && Number(row.amount ?? 0) < 0 && String(row.date_time).slice(0, 10) === date
          && matchTokens(`${row.title ?? ""} ${row.description ?? ""}`).some(token => vendorTokens.has(token)));
        if (banks.length !== 1) continue;
        const bank = banks[0]!; const bankAmount = Math.abs(Number(bank.amount));
        const emails = (gmailMessagesResult.data ?? []).filter(message => Math.abs(Number(subjectAmount(message.subject)) - bankAmount) <= .01
          && matchTokens(message.subject).some(token => vendorTokens.has(token)));
        if (emails.length !== 1 || Math.abs(amount - bankAmount) <= .01) continue;
        const bankExternal = String(bank.plaid_transaction_id ?? bank.id); const bankId = bankExternal.replace(/^.*-((?:conflict|expense)[a-z0-9-]*)$/i, "$1");
        const correlationKey = `review-expense:${purchase.id}:${date}`;
        evidence.push(
          { id: purchase.id, source: "quickbooks", kind: "expense", amount, date, correlationKey },
          { id: bankId, source: "plaid", kind: "expense", amount: bankAmount, date, correlationKey },
          { id: String(emails[0]!.gmail_message_id), source: "gmail", kind: "expense", amount: bankAmount, date, correlationKey, evidenceOnly: true },
        );
      }
      return evidence;
    })();
    const splitPaymentGroups = (gmailMessagesResult.data ?? []).flatMap(message => {
      const contractTotal = subjectAmount(message.subject); const emailTokens = new Set(matchTokens(message.subject));
      if (!(contractTotal && contractTotal > 0) || !emailTokens.size) return [];
      const payments = quickBooksPayments.filter(payment => payment.tokens.some(token => emailTokens.has(token)));
      if (payments.length < 2 || Math.abs(payments.reduce((sum, payment) => sum + payment.amount, 0) - contractTotal) > .01) return [];
      const bankRecords = payments.map(payment => currentRawTransactions.filter(row => Math.abs(Number(row.amount ?? 0) - payment.amount) <= .01
        && matchTokens(`${row.title ?? ""} ${row.description ?? ""}`).some(token => emailTokens.has(token))));
      if (bankRecords.some(matches => matches.length !== 1)) return [];
      const shared = payments[0]!.tokens.find(token => emailTokens.has(token))!;
      return [{ id: `${shared}-${message.gmail_message_id}`, label: shared.replace(/^./, char => char.toUpperCase()), total: contractTotal,
        recordIds: [...payments.map(payment => payment.id), ...bankRecords.map(matches => String(matches[0]!.plaid_transaction_id ?? matches[0]!.id)), String(message.gmail_message_id)] }];
    });
    const jobberJobs = normalizedJobberRows.filter(row => row.object_type === "jobs" && !row.is_archived);
    const ambiguousJobMatches = currentRawTransactions.flatMap(row => {
      const amount = Math.abs(Number(row.amount ?? 0));
      if (!(Number(row.amount ?? 0) < 0) || !(amount > 0)) return [];
      const bankTokens = new Set(matchTokens(`${row.title ?? ""} ${row.description ?? ""}`));
      const emails = (gmailMessagesResult.data ?? []).filter(message => Math.abs(Number(subjectAmount(message.subject)) - amount) <= .01
        && matchTokens(message.subject).some(token => bankTokens.has(token)));
      if (emails.length !== 1) return [];
      const sharedTokens = new Set(matchTokens(emails[0]!.subject).filter(token => bankTokens.has(token)));
      const candidates = jobberJobs.filter(job => matchTokens(`${job.title ?? ""} ${job.record_number ?? ""}`).some(token => sharedTokens.has(token)));
      if (candidates.length < 2) return [];
      const label = [...sharedTokens][0] ?? "Project";
      return [{ id: `${row.id}-${emails[0]!.gmail_message_id}`, amount, transactionId: String(row.plaid_transaction_id ?? row.id), emailId: String(emails[0]!.gmail_message_id),
        jobIds: candidates.map(job => job.external_id), label: label.replace(/^./, char => char.toUpperCase()) }];
    });
    const jobberJobIdByNumber = new Map(jobberJobs.filter(row => row.record_number).map(row => [String(row.record_number), row.external_id]));
    const jobberInvoices = normalizedJobberRows.filter(row => row.object_type === "invoices" && !row.is_archived).map(row => ({ id: row.external_id,
      number: row.record_number, total: Number((row.payload.amounts as Record<string, unknown> | undefined)?.total ?? row.amount ?? 0), balance: Number((row.payload.amounts as Record<string, unknown> | undefined)?.invoiceBalance ?? row.amount ?? 0),
      dueDate: typeof row.payload.dueDate === "string" ? row.payload.dueDate : null,
      jobId: typeof (row.payload.job as Record<string, unknown> | undefined)?.id === "string" ? String((row.payload.job as Record<string, unknown>).id) : typeof row.payload.jobId === "string" ? row.payload.jobId : null,
      clientId: typeof (row.payload.client as Record<string, unknown> | undefined)?.id === "string" ? String((row.payload.client as Record<string, unknown>).id) : typeof row.payload.clientId === "string" ? row.payload.clientId : null,
      provider: "jobber" as const }));
    const quickBooksInvoices = (quickBooksInvoiceResult.data ?? []).filter(row => row.entity_type === "Invoice").map(row => { const payload = row.payload as Record<string, unknown>;
      const projectId = typeof payload.projectId === "string" ? payload.projectId : null;
      return { id: `quickbooks:${row.external_id}`, number: String(payload.invoiceNumber ?? row.display_name ?? row.external_id),
        total: Number(payload.total ?? 0), balance: Number(payload.balance ?? 0), dueDate: typeof payload.dueDate === "string" ? payload.dueDate : null,
        jobId: projectId == null ? null : jobberJobIdByNumber.get(projectId) ?? projectId, clientId: typeof payload.customerId === "string" ? payload.customerId : null,
        provider: "quickbooks" as const }; });
    const contractorInvoices = jobberInvoices.length ? jobberInvoices : quickBooksInvoices;
    const quickBooksHealth = connectionStatus.providers.find(provider => provider.type === "quickbooks");
    const staleSyncCandidates = quickBooksHealth?.stale ? quickBooksInvoices.flatMap(invoice => {
      if (!(invoice.balance > 0) || !invoice.jobId) return [];
      const payments = currentRawTransactions.filter(row => Number(row.amount ?? 0) > 0
        && Array.isArray(row.plaid_category) && row.plaid_category.includes("customer_payment")
        && Math.abs(Number(row.amount ?? 0) - invoice.balance) <= .01);
      if (payments.length !== 1) return [];
      const payment = payments[0]!;
      return [{ id: `${payment.id}-${invoice.id}`, amount: invoice.balance, transactionId: String(payment.plaid_transaction_id ?? payment.id),
        invoiceId: invoice.id.replace(/^quickbooks:/, ""), jobId: invoice.jobId, lastRefresh: quickBooksHealth.lastDataRefresh }];
    }) : [];
    const invoicedByJob = contractorInvoices.reduce((map, invoice) => {
      if (!invoice.jobId) return map; map.set(invoice.jobId, (map.get(invoice.jobId) ?? 0) + Number(invoice.total ?? 0)); return map;
    }, new Map<string, number>());
    contractorCandidates = evaluateContractorSignals({
      targetGrossMargin: settingsResult.data?.target_gross_margin == null ? null : Number(settingsResult.data.target_gross_margin),
      jobs: jobberJobs.map(row => ({ id: row.external_id,
        title: row.title, status: row.status, value: Number(row.amount ?? row.payload.total ?? 0), invoiced: invoicedByJob.get(row.external_id) ?? 0, trackedCosts: assignmentsByJob.get(row.external_id)?.total ?? 0,
        costCount: assignmentsByJob.get(row.external_id)?.count ?? 0, costSourceIds: assignmentsByJob.get(row.external_id)?.sourceIds ?? [],
        estimatedCost: row.payload.estimatedCosts && typeof row.payload.estimatedCosts === "object"
          ? Number((row.payload.estimatedCosts as Record<string, unknown>).materials ?? 0) + Number((row.payload.estimatedCosts as Record<string, unknown>).labor ?? 0) : undefined })),
      invoices: contractorInvoices,
      confirmationMatches: (matchesResult.data ?? []).map(row => ({ id: String(row.id), sourceId: String(row.source_record_id) })),
      receiptReviewTransactionIds,
      unassignedExpenseTransactionIds,
      upcomingObligations,
      availableCash: cashBalanceResult.data?.length ? availableCash : null,
      accountingConfirmationUnavailable: connectionStatus.providers.some(provider => provider.type === "quickbooks" && provider.status !== "healthy"),
      bankActivity: { customerPayments, transactionCount: currentRawTransactions.length, supportedEmailCount: gmailMessagesResult.data?.length ?? 0,
        startingCash: cashBalanceResult.data?.length ? availableCash - currentNetMovement : null },
      bankEmailMatches,
      splitPaymentGroups,
      ambiguousJobMatches,
      staleSyncCandidates,
      economicEventEvidence,
    });
    const jobberInvoicesByNumber = new Map(normalizedJobberRows.filter(row => row.object_type === "invoices" && row.record_number)
      .map(row => [String(row.record_number), row]));
    for (const row of (quickBooksInvoiceResult.data ?? []).filter(row => row.entity_type === "Invoice")) {
      const payload = row.payload as Record<string, unknown>;
      const number = String(payload.invoiceNumber ?? row.display_name ?? "");
      const jobberInvoice = jobberInvoicesByNumber.get(number);
      if (!jobberInvoice) continue;
      const jobberBalance = Number((jobberInvoice.payload.amounts as Record<string, unknown> | undefined)?.invoiceBalance ?? jobberInvoice.amount ?? 0);
      const quickBooksBalance = Number(payload.balance ?? 0);
      if (Math.abs(jobberBalance - quickBooksBalance) <= .01) continue;
      contractorCandidates.push({ signalKey: `contractor:invoice-status-conflict:${number}`, signalType: "bookkeeping", category: "bookkeeping", severity: "high",
        title: `Invoice ${number} has conflicting payment status`,
        description: `QuickBooks shows ${quickBooksBalance.toLocaleString("en-US", { style: "currency", currency: "USD" })} outstanding while Jobber shows ${jobberBalance.toLocaleString("en-US", { style: "currency", currency: "USD" })}. BookSmart cannot determine which source is current.`,
        currentValue: quickBooksBalance, comparisonValue: jobberBalance, percentage: null,
        recommendedAction: "Reconcile the invoice in QuickBooks and Jobber before relying on its collection status.", ctaLabel: "Review sources", ctaRoute: "/user/settings",
        requiresCpaReview: false, cpaReviewLevel: "none", sourceIds: [`quickbooks:${row.external_id}`, jobberInvoice.external_id], confidence: 1,
        provider: "contractor_intelligence", calculationVersion: "contractor-invoice-conflict-v1",
        evidence: [
          { provider: "quickbooks", recordType: "invoice", recordId: String(row.external_id), label: `QuickBooks invoice ${number}`, state: "conflicting", route: "/user/money", reason: "QuickBooks outstanding balance" },
          { provider: "jobber", recordType: "invoice", recordId: jobberInvoice.external_id, label: `Jobber invoice ${number}`, state: "conflicting", route: `/user/jobber-records?object_type=invoices&record_id=${encodeURIComponent(jobberInvoice.external_id)}`, reason: "Jobber outstanding balance" },
        ], calculation: { summary: "Compare the outstanding balance reported by each connected source.", operands: [
          { label: "QuickBooks balance", value: quickBooksBalance, format: "currency", operation: "compare" },
          { label: "Jobber balance", value: jobberBalance, format: "currency", operation: "compare" },
        ] } });
    }
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
