import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { jobberQuery } from "../lib/jobber-client";
import { buildJobberExpenseDraft, JOBBER_EXPENSE_CREATE_MUTATION, jobberExpenseWriteEnabled, parseJobberExpenseCreate } from "../lib/jobber-expense-write";
import { matchContractorFinancialRecord } from "../lib/contractor-job-matcher";
import {
  isMatchableContractorExpense,
  jobberRecordToCandidate,
  transactionToFinancialRecord,
  type MatchableContractorTransaction,
} from "../lib/contractor-transaction-job-matching";

const router = Router();
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://pvppwmkswnluidlwnnck.supabase.co";
const adminClient = (): SupabaseClient => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Contractor job-cost review is unavailable.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
};

async function requireOrganizationOwner(admin: SupabaseClient, organizationId: number, authUserId: string) {
  const { data: user, error: userError } = await admin.from("users").select("id").eq("auth_id", authUserId).maybeSingle();
  if (userError) throw userError;
  if (!user) return null;
  const { data: organization, error } = await admin.from("organizations").select("id").eq("id", organizationId).eq("owner_id", user.id).maybeSingle();
  if (error) throw error;
  return organization ? user : null;
}

async function loadApprovedExpenses(admin: SupabaseClient, organizationId: number) {
  const rows: unknown[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin.from("transactions")
      .select("id,org_id,title,description,receipt_number,amount,date_time,pending,quickbooks_external_id,plaid_transaction_id")
      .eq("org_id", organizationId).eq("pending", false).lt("amount", 0)
      .order("date_time", { ascending: false }).range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return { data: rows, error: null };
  }
}

async function loadExpenseWriteContext(admin: SupabaseClient, organizationId: number, assignmentId: number) {
  const { data: assignment, error: assignmentError } = await admin.from("contractor_job_cost_assignments")
    .select("id,source_record_id,jobber_job_id,amount").eq("id", assignmentId).eq("organization_id", organizationId)
    .eq("source_record_type", "transaction").maybeSingle();
  if (assignmentError) throw assignmentError;
  if (!assignment) throw new Error("Confirmed job cost not found.");
  const [{ data: transaction, error: transactionError }, { data: job, error: jobError }] = await Promise.all([
    admin.from("transactions").select("id,title,description,date_time,amount,pending").eq("id", Number(assignment.source_record_id)).eq("org_id", organizationId).maybeSingle(),
    admin.from("jobber_records").select("external_id,record_number,title").eq("organization_id", organizationId).eq("object_type", "jobs").eq("external_id", assignment.jobber_job_id).eq("is_archived", false).maybeSingle(),
  ]);
  if (transactionError) throw transactionError;
  if (jobError) throw jobError;
  if (!transaction || transaction.pending || Number(transaction.amount) >= 0) throw new Error("The source is no longer an approved expense.");
  if (!job) throw new Error("The linked Jobber job is unavailable.");
  const label = [job.record_number, job.title].filter(Boolean).join(" ");
  return { assignment, transaction, job, draft: buildJobberExpenseDraft({ assignmentId, transactionTitle: transaction.title, transactionDescription: transaction.description, transactionDate: transaction.date_time, amount: Number(assignment.amount), jobberJobId: assignment.jobber_job_id, jobLabel: label }) };
}

router.get("/organizations/:organizationId/contractor-job-costs/review-queue", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) { res.status(400).json({ error: "invalid_request" }); return; }
  try {
    const admin = adminClient();
    const owner = await requireOrganizationOwner(admin, organizationId, req.supabaseUserId!);
    if (!owner) { res.status(403).json({ error: "forbidden" }); return; }
    const [transactionsResult, jobsResult, assignmentsResult, matchesResult] = await Promise.all([
      loadApprovedExpenses(admin, organizationId),
      admin.from("jobber_records")
        .select("external_id,record_number,title,amount,payload")
        .eq("organization_id", organizationId).eq("object_type", "jobs").eq("is_archived", false),
      admin.from("contractor_job_cost_assignments")
        .select("id,jobber_job_id,source_provider,source_record_id,amount,confidence,created_at")
        .eq("organization_id", organizationId).eq("source_record_type", "transaction")
        .order("created_at", { ascending: false }),
      admin.from("contractor_financial_matches")
        .select("source_provider,source_record_id,status")
        .eq("organization_id", organizationId).eq("source_record_type", "transaction"),
    ]);
    const error = transactionsResult.error ?? jobsResult.error ?? assignmentsResult.error ?? matchesResult.error;
    if (error) throw error;

    const assignedIds = new Set((assignmentsResult.data ?? []).map(row => String(row.source_record_id)));
    const existingByTransaction = new Map((matchesResult.data ?? []).map(row => [String(row.source_record_id), row]));
    const jobs = (jobsResult.data ?? []).map(jobberRecordToCandidate);
    const transactions = (transactionsResult.data ?? []) as Array<MatchableContractorTransaction & { date_time: string }>;
    const upserts: Record<string, unknown>[] = [];
    for (const transaction of transactions) {
      if (!isMatchableContractorExpense(transaction, organizationId) || assignedIds.has(String(transaction.id))) continue;
      const existing = existingByTransaction.get(String(transaction.id));
      if (existing?.status === "confirmed" || existing?.status === "rejected") continue;
      const record = transactionToFinancialRecord(transaction);
      const match = matchContractorFinancialRecord(record, jobs);
      upserts.push({
        organization_id: organizationId, source_provider: record.source, source_record_type: "transaction",
        source_record_id: String(transaction.id), jobber_job_id: match.matchedJobId,
        confidence: match.confidence, score: match.score, match_reasons: match.matchReasons,
        source_ids: match.sourceIds, requires_confirmation: match.matchedJobId !== null,
        status: match.matchedJobId ? "suggested" : "unmatched",
        calculation_version: match.calculationVersion, updated_at: new Date().toISOString(),
      });
    }
    if (upserts.length) {
      const { error: upsertError } = await admin.from("contractor_financial_matches").upsert(upserts, {
        onConflict: "organization_id,source_provider,source_record_type,source_record_id",
      });
      if (upsertError) throw upsertError;
    }

    const [suggestionResult, receiptLinksResult] = await Promise.all([
      admin.from("contractor_financial_matches")
        .select("source_provider,source_record_id,jobber_job_id,confidence,score,match_reasons,requires_confirmation,updated_at")
        .eq("organization_id", organizationId).eq("source_record_type", "transaction").eq("status", "suggested")
        .order("score", { ascending: false }),
      admin.from("contractor_source_links").select("right_record_id")
        .eq("organization_id", organizationId).eq("left_provider", "receipt")
        .eq("right_record_type", "transaction").eq("status", "confirmed"),
    ]);
    if (suggestionResult.error) throw suggestionResult.error;
    if (receiptLinksResult.error) throw receiptLinksResult.error;
    const receiptLinkedTransactionIds = new Set((receiptLinksResult.data ?? []).map(row => String(row.right_record_id)));
    const transactionById = new Map(transactions.map(row => [String(row.id), row]));
    const jobById = new Map((jobsResult.data ?? []).map(row => [String(row.external_id), row]));
    const suggestions = (suggestionResult.data ?? []).map(match => ({
      transaction: transactionById.get(String(match.source_record_id)) ?? null,
      job: match.jobber_job_id ? jobById.get(String(match.jobber_job_id)) ?? { external_id: match.jobber_job_id } : null,
      sourceProvider: match.source_provider, confidence: match.confidence, score: Number(match.score),
      reasons: match.match_reasons, requiresConfirmation: match.requires_confirmation, updatedAt: match.updated_at,
    })).filter(row => row.transaction && row.job);
    if (suggestions.length) {
      const { error: notificationError } = await admin.from("account_activity_notifications").upsert(
        suggestions.map(suggestion => {
          const job = suggestion.job as { external_id: string; record_number?: string | null; title?: string | null };
          return {
          organization_id: organizationId,
          event_key: `job-match:${organizationId}:${suggestion.transaction!.id}:${job.external_id}`,
          event_type: "job_match_found",
          title: "Job match needs review",
          description: `${suggestion.transaction!.title || suggestion.transaction!.description || "Expense"} may belong to ${job.record_number || "Job"} ${job.title || job.external_id}.`,
          amount: suggestion.transaction!.amount,
          route: "/user/tasks",
          metadata: { transaction_id: suggestion.transaction!.id, jobber_job_id: job.external_id },
        };
        }),
        { onConflict: "event_key", ignoreDuplicates: true },
      );
      if (notificationError) throw notificationError;
    }
    res.json({
      suggestions,
      approved: (assignmentsResult.data ?? []).map(assignment => ({
        assignmentId: Number(assignment.id),
        transaction: transactionById.get(String(assignment.source_record_id)) ?? {
          id: Number(assignment.source_record_id), title: null, description: null,
          amount: -Math.abs(Number(assignment.amount)), date_time: assignment.created_at,
        },
        job: jobById.get(String(assignment.jobber_job_id)) ?? { external_id: assignment.jobber_job_id },
        sourceProvider: assignment.source_provider, amount: Number(assignment.amount),
        confidence: assignment.confidence, confirmedAt: assignment.created_at,
        receiptLinked: receiptLinkedTransactionIds.has(String(assignment.source_record_id)),
      })),
    });
  } catch (error) {
    res.status(503).json({ error: "transaction_job_cost_queue_unavailable", message: error instanceof Error ? error.message : "Transaction job-cost suggestions are unavailable." });
  }
});

router.post("/organizations/:organizationId/contractor-job-costs/confirm", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  const transactionId = Number(req.body?.transactionId);
  const jobberJobId = String(req.body?.jobberJobId ?? "").trim().slice(0, 300);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !Number.isSafeInteger(transactionId) || transactionId <= 0 || !jobberJobId) {
    res.status(400).json({ error: "invalid_confirmation" }); return;
  }
  try {
    const admin = adminClient();
    const { data, error } = await admin.rpc("confirm_contractor_transaction_job_cost", {
      requested_organization_id: organizationId, requested_auth_user_id: req.supabaseUserId!,
      requested_transaction_id: transactionId, requested_jobber_job_id: jobberJobId,
    });
    if (error) throw error;
    const assignment = data?.[0];
    if (!assignment) throw new Error("The confirmed job cost was not returned.");
    res.json({ confirmed: true, assignmentId: assignment.assignment_id, amount: Number(assignment.assigned_amount), sourceProvider: assignment.source_provider, accountingEffect: "none" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The job cost could not be confirmed.";
    res.status(/not found|pending|only expense|suggestion/i.test(message) ? 422 : 503).json({ error: "confirmation_rejected", message });
  }
});

router.post("/organizations/:organizationId/contractor-job-costs/reject", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  const transactionId = Number(req.body?.transactionId);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !Number.isSafeInteger(transactionId) || transactionId <= 0) {
    res.status(400).json({ error: "invalid_rejection" }); return;
  }
  try {
    const admin = adminClient();
    const owner = await requireOrganizationOwner(admin, organizationId, req.supabaseUserId!);
    if (!owner) { res.status(403).json({ error: "forbidden" }); return; }
    const { data, error } = await admin.from("contractor_financial_matches").update({ status: "rejected", requires_confirmation: false, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId).eq("source_record_type", "transaction").eq("source_record_id", String(transactionId)).eq("status", "suggested").select("id").maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: "suggestion_not_found" }); return; }
    res.json({ rejected: true, accountingEffect: "none" });
  } catch (error) {
    res.status(503).json({ error: "rejection_unavailable", message: error instanceof Error ? error.message : "The suggestion could not be rejected." });
  }
});

router.post("/organizations/:organizationId/contractor-job-costs/remove", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  const assignmentId = Number(req.body?.assignmentId);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !Number.isSafeInteger(assignmentId) || assignmentId <= 0) {
    res.status(400).json({ error: "invalid_removal" }); return;
  }
  try {
    const admin = adminClient();
    const { data, error } = await admin.rpc("remove_contractor_transaction_job_cost", {
      requested_organization_id: organizationId,
      requested_auth_user_id: req.supabaseUserId!,
      requested_assignment_id: assignmentId,
    });
    if (error) throw error;
    const removed = data?.[0];
    if (!removed) throw new Error("The removed job cost was not returned.");
    res.json({
      removed: true, assignmentId: Number(removed.removed_assignment_id),
      transactionId: String(removed.transaction_id), jobberJobId: String(removed.jobber_job_id),
      accountingEffect: "none", receiptEffect: "none",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The job assignment could not be removed.";
    res.status(/not found/i.test(message) ? 404 : 503).json({ error: "removal_unavailable", message });
  }
});

router.get("/organizations/:organizationId/contractor-job-costs/:assignmentId/jobber-expense-preview", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  const assignmentId = Number(req.params.assignmentId);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !Number.isSafeInteger(assignmentId) || assignmentId <= 0) { res.status(400).json({ error: "invalid_request" }); return; }
  try {
    const admin = adminClient();
    if (!await requireOrganizationOwner(admin, organizationId, req.supabaseUserId!)) { res.status(403).json({ error: "forbidden" }); return; }
    const context = await loadExpenseWriteContext(admin, organizationId, assignmentId);
    const { data: prior, error: priorError } = await admin.from("jobber_expense_write_audit").select("status,external_expense_id,created_at").eq("organization_id", organizationId).eq("assignment_id", assignmentId).maybeSingle();
    if (priorError) throw priorError;
    res.json({ enabled: jobberExpenseWriteEnabled(organizationId), alreadySent: prior?.status === "succeeded", prior: prior ?? null, expense: context.draft, job: context.job, warning: "This creates one expense in Jobber. It does not change the BookSmart transaction." });
  } catch (error) {
    res.status(/not found|unavailable|no longer/i.test(error instanceof Error ? error.message : "") ? 422 : 503).json({ error: "jobber_expense_preview_unavailable", message: error instanceof Error ? error.message : "The preview is unavailable." });
  }
});

router.post("/organizations/:organizationId/contractor-job-costs/:assignmentId/send-to-jobber", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  const assignmentId = Number(req.params.assignmentId);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !Number.isSafeInteger(assignmentId) || assignmentId <= 0 || req.body?.confirmed !== true) { res.status(400).json({ error: "explicit_confirmation_required", message: "Review the expense and confirm before sending." }); return; }
  if (!jobberExpenseWriteEnabled(organizationId)) { res.status(403).json({ error: "jobber_expense_write_disabled", message: "Sending expenses to Jobber is not enabled for this organization." }); return; }
  try {
    const admin = adminClient();
    const owner = await requireOrganizationOwner(admin, organizationId, req.supabaseUserId!);
    if (!owner) { res.status(403).json({ error: "forbidden" }); return; }
    const context = await loadExpenseWriteContext(admin, organizationId, assignmentId);
    const { data: reservation, error: reservationError } = await admin.from("jobber_expense_write_audit").insert({ organization_id: organizationId, assignment_id: assignmentId, requested_by: owner.id, status: "pending", request_payload: context.draft }).select("id").maybeSingle();
    if (reservationError) {
      if (reservationError.code === "23505") { res.status(409).json({ error: "jobber_expense_already_requested", message: "This confirmed cost has already been sent or is being processed." }); return; }
      throw reservationError;
    }
    const { data: connection, error: connectionError } = await admin.from("jobber_connections").select("*").eq("organization_id", organizationId).eq("status", "active").maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection) throw new Error("An active Jobber connection is required.");
    try {
      const result = await jobberQuery<any>(admin, connection as any, JOBBER_EXPENSE_CREATE_MUTATION, { input: context.draft });
      const expense = parseJobberExpenseCreate(result);
      const { error: auditError } = await admin.from("jobber_expense_write_audit").update({ status: "succeeded", external_expense_id: expense.id, response_payload: expense, completed_at: new Date().toISOString() }).eq("id", reservation!.id);
      if (auditError) throw auditError;
      res.json({ sent: true, expense, accountingEffect: "none" });
    } catch (error) {
      await admin.from("jobber_expense_write_audit").update({ status: "failed", error_message: error instanceof Error ? error.message.slice(0, 1000) : "Jobber request failed", completed_at: new Date().toISOString() }).eq("id", reservation!.id);
      throw error;
    }
  } catch (error) {
    res.status(503).json({ error: "jobber_expense_send_failed", message: error instanceof Error ? error.message : "The expense could not be sent to Jobber." });
  }
});

export default router;
