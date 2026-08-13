import { Router } from "express";
import { scheduleMonitoringEvaluation } from "../lib/monitoring-runner";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import {
  normalizeStatementType,
  parseStructuredStatement,
  periodsOverlap,
  validateAccounting,
} from "../lib/financial-statements";

const router = Router();
const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";
const STATEMENT_CATEGORIES = ["Profit & Loss", "Income Statement", "Balance Sheet", "Cash Flow Statement"];

type JsonMap = Record<string, unknown>;

function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Statement persistence is unavailable.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

function objectValue(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

function workflowOf(parsedData: unknown): JsonMap {
  return objectValue(objectValue(parsedData).statement_workflow);
}

async function ownership(admin: SupabaseClient, authId: string, organizationId: number) {
  const { data: user } = await admin.from("users").select("id").eq("auth_id", authId).maybeSingle();
  if (!user) return null;
  const { data: org } = await admin.from("organizations").select("id").eq("id", organizationId).eq("owner_id", user.id).maybeSingle();
  return org ? { userId: Number(user.id), organizationId: Number(org.id) } : null;
}

function publicStatement(document: JsonMap) {
  const workflow = workflowOf(document.parsed_data);
  return {
    ...workflow,
    id: Number(document.id),
    document_id: Number(document.id),
    normalized_draft: workflow.normalized_draft,
    validation_results: workflow.validation_results ?? [],
    extraction_warnings: workflow.extraction_warnings ?? [],
  };
}

function transactionDate(type: "pnl" | "bs" | "cf", statement: ReturnType<typeof parseStructuredStatement>) {
  return type === "bs" ? statement.metadata.as_of_date : statement.metadata.period_end;
}

function summarizedTransactions(
  type: "pnl" | "bs" | "cf",
  statement: ReturnType<typeof parseStructuredStatement>,
  documentName: string,
) {
  const scale = statement.metadata.scale === "millions" ? 1_000_000 : statement.metadata.scale === "thousands" ? 1_000 : 1;
  const n = (field: string) => (statement.values[field] ?? 0) * scale;
  if (type === "pnl") {
    return [
      { title: `[Revenue] ${documentName}`, amount: n("revenue") },
      { title: `[COGS] ${documentName}`, amount: -Math.abs(n("cost_of_goods_sold")) },
      { title: `[OpEx] ${documentName}`, amount: -Math.abs(n("operating_expenses")) },
    ];
  }
  if (type === "bs") {
    return [
      { title: `[Asset:Current] ${documentName}`, amount: n("current_assets") },
      { title: `[Asset:Non-Current] ${documentName}`, amount: n("non_current_assets") },
      { title: `[Liab:Current] ${documentName}`, amount: -Math.abs(n("current_liabilities")) },
      { title: `[Liab:Long-Term] ${documentName}`, amount: -Math.abs(n("long_term_liabilities")) },
      { title: `[Equity] ${documentName}`, amount: n("equity") },
    ];
  }
  return [
    { title: `[CF:Operating] ${documentName}`, amount: n("operating_activities") },
    { title: `[CF:Investing] ${documentName}`, amount: n("investing_activities") },
    { title: `[CF:Financing] ${documentName}`, amount: n("financing_activities") },
  ];
}

router.get("/financial-statements/review", requireAuth, async (req, res) => {
  const organizationId = Number(req.query.organization_id);
  if (!Number.isInteger(organizationId) || organizationId <= 0) { res.status(400).json({ error: "organization_required" }); return; }
  const admin = adminClient();
  const owner = await ownership(admin, req.supabaseUserId!, organizationId);
  if (!owner) { res.status(403).json({ error: "forbidden" }); return; }
  const { data, error } = await admin.from("user_documents").select("id,name,category,parsed_data,created_at")
    .eq("user_id", owner.userId).in("category", STATEMENT_CATEGORIES).order("created_at", { ascending: false });
  if (error) { res.status(500).json({ error: "load_failed" }); return; }
  const statements = (data ?? []).filter(row => {
    const workflow = workflowOf(row.parsed_data);
    return Number(workflow.organization_id) === organizationId
      && ["uploaded", "extracting", "needs_review", "failed"].includes(String(workflow.lifecycle_status));
  }).map(row => publicStatement(row as JsonMap));
  res.json({ statements });
});

router.post("/financial-statements", requireAuth, async (req, res) => {
  const {
    organization_id, document_id, idempotency_key, file_hash, extraction,
    raw_response, model, model_version, prompt_version, schema_version,
  } = req.body as JsonMap;
  const organizationId = Number(organization_id);
  const documentId = Number(document_id);
  if (!Number.isInteger(organizationId) || organizationId <= 0 || !Number.isInteger(documentId) || documentId <= 0) {
    res.status(400).json({ error: "organization_and_document_required" }); return;
  }
  const admin = adminClient();
  const owner = await ownership(admin, req.supabaseUserId!, organizationId);
  if (!owner) { res.status(403).json({ error: "forbidden" }); return; }
  const { data: document } = await admin.from("user_documents").select("id,user_id,name,category,parsed_data,created_at")
    .eq("id", documentId).eq("user_id", owner.userId).maybeSingle();
  if (!document) { res.status(404).json({ error: "document_not_found" }); return; }
  const type = normalizeStatementType(document.category);
  if (!type) { res.status(400).json({ error: "not_financial_statement" }); return; }
  let normalized;
  try { normalized = parseStructuredStatement(extraction, type); }
  catch (error) { res.status(422).json({ error: "invalid_extraction", message: error instanceof Error ? error.message : "Invalid extraction." }); return; }
  const key = String(idempotency_key ?? "");
  const hash = String(file_hash ?? "");
  if (!/^[a-f0-9]{64}$/.test(hash) || key.length < 8 || key.length > 200) {
    res.status(400).json({ error: "invalid_idempotency" }); return;
  }
  const existingWorkflow = workflowOf(document.parsed_data);
  if (existingWorkflow.idempotency_key === key) {
    res.json({ statement: publicStatement(document as JsonMap), idempotent: true }); return;
  }
  const { data: candidates } = await admin.from("user_documents").select("id,category,parsed_data")
    .eq("user_id", owner.userId).in("category", STATEMENT_CATEGORIES);
  let duplicateId: number | null = null;
  const overlapIds: number[] = [];
  for (const candidate of candidates ?? []) {
    if (Number(candidate.id) === documentId) continue;
    const workflow = workflowOf(candidate.parsed_data);
    if (Number(workflow.organization_id) !== organizationId || workflow.lifecycle_status === "abandoned") continue;
    if (workflow.file_hash === hash) duplicateId = Number(candidate.id);
    const candidateType = normalizeStatementType(candidate.category);
    const candidateDraft = objectValue(workflow.confirmed_result ?? workflow.normalized_draft);
    const metadata = objectValue(candidateDraft.metadata);
    if (candidateType === type && periodsOverlap(type, normalized.metadata, {
      period_start: typeof metadata.period_start === "string" ? metadata.period_start : null,
      period_end: typeof metadata.period_end === "string" ? metadata.period_end : null,
      as_of_date: typeof metadata.as_of_date === "string" ? metadata.as_of_date : null,
    })) overlapIds.push(Number(candidate.id));
  }
  const warnings = [...normalized.warnings];
  if (duplicateId) warnings.push(`Exact duplicate file of document ${duplicateId}.`);
  if (overlapIds.length) warnings.push(`Overlaps statement document(s): ${overlapIds.join(", ")}.`);
  const validation = validateAccounting(normalized);
  const workflow: JsonMap = {
    organization_id: organizationId,
    lifecycle_status: "needs_review",
    statement_type: type,
    file_hash: hash,
    idempotency_key: key,
    raw_ai_response: raw_response,
    normalized_draft: normalized,
    source_evidence: normalized.evidence,
    extraction_warnings: warnings,
    validation_results: validation,
    extraction_model: model,
    extraction_model_version: model_version,
    prompt_version,
    schema_version,
    duplicate_of_document_id: duplicateId,
    overlap_document_ids: overlapIds,
    created_at: new Date().toISOString(),
  };
  const parsedData = { ...objectValue(document.parsed_data), statement_workflow: workflow };
  const { data, error } = await admin.from("user_documents").update({ parsed_data: parsedData, updated_at: new Date().toISOString() })
    .eq("id", documentId).eq("user_id", owner.userId).select("id,name,category,parsed_data,created_at").single();
  if (error) { res.status(409).json({ error: "statement_create_failed", message: error.message }); return; }
  res.status(201).json({ statement: publicStatement(data as JsonMap), idempotent: false });
});

router.patch("/financial-statements/:id", requireAuth, async (req, res) => {
  const documentId = Number(req.params.id);
  const organizationId = Number(req.body?.organization_id);
  const action = String(req.body?.action ?? "");
  if (!Number.isInteger(documentId) || !Number.isInteger(organizationId)) { res.status(400).json({ error: "invalid_request" }); return; }
  const admin = adminClient();
  const owner = await ownership(admin, req.supabaseUserId!, organizationId);
  if (!owner) { res.status(403).json({ error: "forbidden" }); return; }
  const { data: document } = await admin.from("user_documents").select("id,user_id,name,category,parsed_data,created_at")
    .eq("id", documentId).eq("user_id", owner.userId).maybeSingle();
  if (!document) { res.status(404).json({ error: "not_found" }); return; }
  const workflow = workflowOf(document.parsed_data);
  if (Number(workflow.organization_id) !== organizationId) { res.status(403).json({ error: "forbidden" }); return; }
  if (action === "abandon") {
    const parsedData = {
      ...objectValue(document.parsed_data),
      statement_workflow: { ...workflow, lifecycle_status: "abandoned", updated_at: new Date().toISOString() },
    };
    await admin.from("user_documents").update({ parsed_data: parsedData, updated_at: new Date().toISOString() }).eq("id", documentId);
    res.json({ statement: publicStatement({ ...document, parsed_data: parsedData }) }); return;
  }
  if (!["save_draft", "confirm"].includes(action)) { res.status(400).json({ error: "invalid_action" }); return; }
  const type = normalizeStatementType(document.category);
  if (!type) { res.status(409).json({ error: "invalid_stored_type" }); return; }
  let normalized;
  try { normalized = parseStructuredStatement(req.body?.statement, type); }
  catch (error) { res.status(422).json({ error: "invalid_statement", message: error instanceof Error ? error.message : "Invalid statement." }); return; }
  const validation = validateAccounting(normalized, Number(req.body?.tolerance) || 1);
  const blocking = validation.filter(v => v.severity === "error");
  if (action === "confirm" && blocking.length) { res.status(422).json({ error: "validation_blocked", validation }); return; }
  if (action === "confirm" && validation.length && req.body?.acknowledge_warnings !== true) {
    res.status(422).json({ error: "warning_acknowledgment_required", validation }); return;
  }
  const corrections = Array.isArray(workflow.user_corrections) ? workflow.user_corrections : [];
  corrections.push({ at: new Date().toISOString(), by: req.supabaseUserId, statement: normalized });
  const decision = String(req.body?.reporting_decision ?? "review_later");
  const nextWorkflow: JsonMap = {
    ...workflow,
    normalized_draft: normalized,
    validation_results: validation,
    user_corrections: corrections,
    lifecycle_status: action === "confirm" ? "confirmed" : "needs_review",
    updated_at: new Date().toISOString(),
  };
  if (action === "confirm") {
    Object.assign(nextWorkflow, {
      confirmed_result: normalized,
      confirmed_at: new Date().toISOString(),
      confirmed_by: req.supabaseUserId,
      is_authoritative: decision === "use_uploaded",
      reconciliation_status: decision,
      reconciliation_decision: decision,
    });
    const sourceMarker = `Financial statement upload document:${documentId}`;
    const { error: deleteError } = await admin.from("transactions").delete()
      .eq("user_id", owner.userId).eq("org_id", organizationId).eq("description", sourceMarker);
    if (deleteError) { res.status(500).json({ error: "transaction_cleanup_failed", message: deleteError.message }); return; }
    if (decision === "use_uploaded") {
      const date = transactionDate(type, normalized);
      if (!date) { res.status(422).json({ error: "statement_date_required" }); return; }
      const rows = summarizedTransactions(type, normalized, String(document.name)).map(row => ({
        user_id: owner.userId,
        org_id: organizationId,
        title: row.title,
        amount: row.amount,
        type: "Business",
        date_time: new Date(`${date}T12:00:00Z`).toISOString(),
        description: sourceMarker,
      }));
      const { error: transactionError } = await admin.from("transactions").insert(rows);
      if (transactionError) { res.status(500).json({ error: "transaction_save_failed", message: transactionError.message }); return; }
      nextWorkflow.generated_transaction_count = rows.length;
    } else {
      nextWorkflow.generated_transaction_count = 0;
    }
  }
  const parsedData = { ...objectValue(document.parsed_data), statement_workflow: nextWorkflow };
  const { data, error } = await admin.from("user_documents").update({ parsed_data: parsedData, updated_at: new Date().toISOString() })
    .eq("id", documentId).eq("user_id", owner.userId).select("id,name,category,parsed_data,created_at").single();
  if (error) { res.status(500).json({ error: "save_failed", message: error.message }); return; }
  if (action === "confirm") scheduleMonitoringEvaluation(admin, organizationId, "financial_statement_approved");
  res.json({ statement: publicStatement(data as JsonMap), validation });
});

export default router;
