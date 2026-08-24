import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { requireAdmin } from "../middlewares/require-admin";
import { buildCanonicalFinancialSummary, type CanonicalStatementDocument } from "../lib/canonical-financial-summary";
import { contractorDiagnosticQuality } from "../lib/contractor-diagnostics";
import type { FinancialCategory, FinancialSubCategory, FinancialTransaction } from "../../../booksmart/src/lib/financial-engine";
import type { DeductionRule, DeductionRuleGroup, OrgRow } from "../../../booksmart/src/lib/deduction-calculation";

const router = Router();
router.use("/admin/contractor-diagnostics", requireAuth, requireAdmin);
const adminClient = () => { const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error("Supabase admin client is not configured"); return createClient(url, key, { auth: { persistSession: false } }); };
const count = async (query: any) => { const { count, error } = await query; if (error) throw error; return count ?? 0; };

router.get("/admin/contractor-diagnostics/:organizationId", async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) { res.status(400).json({ error: "invalid_organization" }); return; }
  try {
    const admin = adminClient(); const now = new Date(); const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const { data: organization, error: organizationError } = await admin.from("organizations").select("*").eq("id", organizationId).maybeSingle();
    if (organizationError) throw organizationError; if (!organization) { res.status(404).json({ error: "organization_not_found" }); return; }
    const [plaid, quickbooks, jobber, transactions, categories, subCategories, documents, ruleGroups, rules, jobberRows, matches, assignments, receipts, signals, tasks,
      approvedCount, plaidCount, quickBooksCount] = await Promise.all([
      admin.from("plaid_items").select("status,last_sync_status,last_synced_at,last_sync_error").eq("org_id", organizationId),
      admin.from("quickbooks_connections").select("status,updated_at").eq("organization_id", organizationId).maybeSingle(),
      admin.from("jobber_connections").select("status,last_successful_sync_at,last_sync_error").eq("organization_id", organizationId).maybeSingle(),
      admin.from("transactions").select("id,title,amount,type,date_time,description,deductible,category_id,sub_category_id,pending").eq("org_id", organizationId).gte("date_time", start.toISOString()).lte("date_time", now.toISOString()),
      admin.from("category").select("id,name"), admin.from("sub_category").select("id,name,category_id"),
      admin.from("user_documents").select("id,name,category,tax_year,parsed_data").eq("user_id", organization.owner_id),
      admin.from("deduction_rule_groups").select("*"), admin.from("deduction_rules").select("*"),
      admin.from("jobber_records").select("id,external_id,object_type,status,amount,payload").eq("organization_id", organizationId).eq("is_archived", false),
      admin.from("contractor_financial_matches").select("id,confidence,status,requires_confirmation").eq("organization_id", organizationId),
      admin.from("contractor_job_cost_assignments").select("id,amount,jobber_job_id,source_record_id").eq("organization_id", organizationId),
      admin.from("contractor_receipt_extractions").select("id,source_id").eq("organization_id", organizationId),
      admin.from("business_signals").select("id,category,severity,requires_cpa_review,status").eq("organization_id", organizationId).eq("status", "active"),
      admin.from("financial_tasks").select("id,status,priority").eq("organization_id", organizationId),
      count(admin.from("transactions").select("id", { count: "exact", head: true }).eq("org_id", organizationId).eq("pending", false)),
      count(admin.from("transactions").select("id", { count: "exact", head: true }).eq("org_id", organizationId).not("plaid_transaction_id", "is", null)),
      count(admin.from("quickbooks_staged_entities").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("import_status", "imported")),
    ]);
    const results = [plaid, quickbooks, jobber, transactions, categories, subCategories, documents, ruleGroups, rules, jobberRows, matches, assignments, receipts, signals, tasks];
    const error = results.map(result => result.error).find(Boolean); if (error) throw error;
    const canonical = buildCanonicalFinancialSummary({ organizationId, start, end: now, transactions: (transactions.data ?? []) as FinancialTransaction[],
      categories: (categories.data ?? []) as FinancialCategory[], subCategories: (subCategories.data ?? []) as FinancialSubCategory[],
      documents: (documents.data ?? []) as CanonicalStatementDocument[], organization: organization as OrgRow,
      deductionRuleGroups: (ruleGroups.data ?? []) as DeductionRuleGroup[], deductionRules: (rules.data ?? []) as DeductionRule[] });
    const records = jobberRows.data ?? []; const matchRows = matches.data ?? []; const taskRows = tasks.data ?? []; const signalRows = signals.data ?? [];
    const invoiceRows = records.filter(row => row.object_type === "invoices");
    const assignedTransactionIds = new Set((assignments.data ?? []).map(row => String((row as any).source_record_id)));
    const currentExpenseRows = (transactions.data ?? []).filter(row => row.pending !== true && Number(row.amount) < 0);
    const confirmedReceiptMatches = matchRows.filter(row => row.status === "confirmed");
    const outstanding = invoiceRows.reduce((sum, row) => sum + Math.max(0, Number((row.payload as any)?.amounts?.invoiceBalance ?? row.amount ?? 0)), 0);
    const connected = [...((plaid.data ?? []).some(row => row.status === "active") ? ["plaid"] : []), ...(quickbooks.data?.status === "active" ? ["quickbooks"] : []), ...(jobber.data?.status === "active" ? ["jobber"] : [])];
    const stale = [...((plaid.data ?? []).some(row => row.status === "active" && row.last_sync_status !== "completed") ? ["plaid"] : []), ...(quickbooks.data?.status === "error" ? ["quickbooks"] : []), ...(jobber.data?.status === "error" ? ["jobber"] : [])];
    const by = (rows: any[], key: string) => rows.reduce((all, row) => ({ ...all, [String(row[key])]: (all[String(row[key])] ?? 0) + 1 }), {} as Record<string, number>);
    res.json({ organization: { id: organization.id, name: organization.name }, period: { start: start.toISOString(), end: now.toISOString() },
      connections: { plaid: plaid.data ?? [], quickbooks: quickbooks.data ?? null, jobber: jobber.data ?? null,
        gmail: { status: "connector_required", metadataEnrichmentAvailable: true } },
      dataCounts: { approvedTransactions: approvedCount, jobberJobs: records.filter(row => row.object_type === "jobs").length,
        jobberInvoices: invoiceRows.length, jobberCustomers: records.filter(row => row.object_type === "clients").length,
        plaidTransactions: plaidCount, quickBooksImportedRecords: quickBooksCount, receipts: receipts.data?.length ?? 0, matchedReceipts: confirmedReceiptMatches.length,
        unmatchedReceipts: matchRows.filter(row => row.status === "unmatched").length,
        jobAssignedExpenses: assignments.data?.length ?? 0,
        unassignedCandidateExpenses: currentExpenseRows.filter(row => Math.abs(Number(row.amount)) >= 500 && !assignedTransactionIds.has(String(row.id))).length },
      matching: { byConfidence: by(matchRows, "confidence"), byStatus: by(matchRows, "status"), requiresConfirmation: matchRows.filter(row => row.requires_confirmation).length },
      metrics: { revenue: canonical.revenue, expenses: canonical.accountingExpenses, netIncome: canonical.netIncome, outstandingInvoices: outstanding,
        trackedJobCosts: (assignments.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
        jobsWithMarginAvailable: new Set((assignments.data ?? []).map(row => row.jobber_job_id)).size },
      signals: { active: signalRows.length, byCategory: by(signalRows, "category"), requiringCpaReview: signalRows.filter(row => row.requires_cpa_review).length },
      tasks: { byStatus: by(taskRows, "status"), highPriority: taskRows.filter(row => ["high", "critical"].includes(row.priority)).length },
      dataQuality: contractorDiagnosticQuality({ connected, stale, approvedTransactions: approvedCount, jobs: records.filter(row => row.object_type === "jobs").length }),
      calculationVersion: canonical.calculationVersion });
  } catch (error) { res.status(503).json({ error: "contractor_diagnostic_unavailable", message: error instanceof Error ? error.message : "Diagnostic unavailable" }); }
});

export default router;
