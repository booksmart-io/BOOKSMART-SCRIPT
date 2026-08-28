import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { buildCanonicalFinancialSummary, parseFinancialSummaryInstantPeriod, parseFinancialSummaryPeriod, type CanonicalStatementDocument } from "../lib/canonical-financial-summary";
import { buildContractorFinancialIntelligence, type IntelligenceSource } from "../lib/contractor-financial-intelligence";
import type { FinancialCategory, FinancialSubCategory, FinancialTransaction } from "../../../booksmart/src/lib/financial-engine";
import type { DeductionRule, DeductionRuleGroup, OrgRow } from "../../../booksmart/src/lib/deduction-calculation";
import { verifiedContractorCashPosition } from "../lib/contractor-cash-position";
import type { BalanceSnapshot } from "../lib/verified-cash-balance";
import { parseContractorMarginSetting } from "../lib/contractor-settings";

const router = Router();
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://pvppwmkswnluidlwnnck.supabase.co";
const adminClient = (): SupabaseClient => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Contractor financial intelligence is unavailable.");
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

router.get("/organizations/:organizationId/contractor-financial-settings", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) { res.status(400).json({ error: "invalid_organization" }); return; }
  try {
    const admin = adminClient();
    if (!await requireOrganizationOwner(admin, organizationId, req.supabaseUserId!)) { res.status(403).json({ error: "forbidden" }); return; }
    const { data, error } = await admin.from("contractor_financial_settings").select("target_gross_margin,target_margin_source,updated_at").eq("organization_id", organizationId).maybeSingle();
    if (error) throw error;
    res.json({ targetGrossMargin: data?.target_gross_margin == null ? null : Number(data.target_gross_margin),
      targetMarginSource: data?.target_margin_source ?? null, updatedAt: data?.updated_at ?? null });
  } catch (error) {
    res.status(503).json({ error: "contractor_settings_unavailable", message: error instanceof Error ? error.message : "Settings unavailable." });
  }
});

router.put("/organizations/:organizationId/contractor-financial-settings", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) { res.status(400).json({ error: "invalid_organization" }); return; }
  let setting;
  try { setting = parseContractorMarginSetting(req.body); }
  catch (error) { res.status(400).json({ error: "invalid_margin_setting", message: error instanceof Error ? error.message : "Invalid setting." }); return; }
  try {
    const admin = adminClient();
    if (!await requireOrganizationOwner(admin, organizationId, req.supabaseUserId!)) { res.status(403).json({ error: "forbidden" }); return; }
    const updatedAt = new Date().toISOString();
    const { error } = await admin.from("contractor_financial_settings").upsert({ organization_id: organizationId,
      target_gross_margin: setting.targetGrossMargin, target_margin_source: setting.targetMarginSource, updated_at: updatedAt }, { onConflict: "organization_id" });
    if (error) throw error;
    res.json({ ...setting, updatedAt });
  } catch (error) {
    res.status(503).json({ error: "contractor_settings_unavailable", message: error instanceof Error ? error.message : "Settings unavailable." });
  }
});

router.get("/organizations/:organizationId/contractor-financial-intelligence", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  const period = parseFinancialSummaryInstantPeriod(req.query.startInstant, req.query.endInstant)
    ?? parseFinancialSummaryPeriod(req.query.start, req.query.end);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) { res.status(400).json({ error: "invalid_organization" }); return; }
  if (!period) { res.status(400).json({ error: "invalid_period" }); return; }

  try {
    const periodDuration = period.end.getTime() - period.start.getTime();
    const previousEnd = new Date(period.start.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - periodDuration);
    const yearToDateStart = new Date(Date.UTC(period.end.getUTCFullYear(), 0, 1));
    const priorYearStart = new Date(period.start); priorYearStart.setUTCFullYear(priorYearStart.getUTCFullYear() - 1);
    const priorYearEnd = new Date(period.end); priorYearEnd.setUTCFullYear(priorYearEnd.getUTCFullYear() - 1);
    const earliestTransactionStart = new Date(Math.min(previousStart.getTime(), yearToDateStart.getTime(), priorYearStart.getTime()));
    const admin = adminClient();
    const { data: user, error: userError } = await admin.from("users").select("id").eq("auth_id", req.supabaseUserId!).maybeSingle();
    if (userError) throw userError;
    if (!user) { res.status(403).json({ error: "forbidden" }); return; }
    const { data: organization, error: organizationError } = await admin.from("organizations").select("*").eq("id", organizationId).eq("owner_id", user.id).maybeSingle();
    if (organizationError) throw organizationError;
    if (!organization) { res.status(403).json({ error: "forbidden" }); return; }

    const [transactions, categories, subCategories, documents, ruleGroups, rules, jobberRecords,
      jobberConnection, quickBooksConnection, plaidItems, balanceSnapshots, settings, assignments, matches, receiptLinks, signals] = await Promise.all([
      admin.from("transactions").select("id,title,amount,type,date_time,description,deductible,category_id,sub_category_id,pending").eq("org_id", organizationId).gte("date_time", earliestTransactionStart.toISOString()).lte("date_time", period.end.toISOString()),
      admin.from("category").select("id,name"),
      admin.from("sub_category").select("id,name,category_id"),
      admin.from("user_documents").select("id,name,category,tax_year,parsed_data").eq("user_id", user.id),
      admin.from("deduction_rule_groups").select("*"), admin.from("deduction_rules").select("*"),
      admin.from("jobber_records").select("external_id,object_type,related_client_id,record_number,status,title,amount,source_created_at,payload,last_seen_at").eq("organization_id", organizationId).eq("is_archived", false),
      admin.from("jobber_connections").select("status,last_successful_sync_at").eq("organization_id", organizationId).eq("status", "active").maybeSingle(),
      admin.from("quickbooks_connections").select("status,updated_at").eq("organization_id", organizationId).eq("status", "active").maybeSingle(),
      admin.from("plaid_items").select("status,last_sync_status,last_synced_at").eq("org_id", organizationId).eq("status", "active"),
      admin.from("account_balance_snapshots").select("external_account_id,account_type,current_balance,available_balance,currency,balance_timestamp").eq("organization_id", organizationId).eq("provider", "plaid").order("balance_timestamp", { ascending: false }).limit(250),
      admin.from("contractor_financial_settings").select("target_gross_margin,target_margin_source").eq("organization_id", organizationId).maybeSingle(),
      admin.from("contractor_job_cost_assignments").select("jobber_job_id,amount,confidence,source_record_id,created_at").eq("organization_id", organizationId),
      admin.from("contractor_financial_matches").select("source_provider,source_record_type,status").eq("organization_id", organizationId),
      admin.from("contractor_source_links").select("left_record_id,right_record_id,status").eq("organization_id", organizationId)
        .eq("left_provider", "receipt").eq("right_record_type", "transaction").eq("status", "confirmed"),
      admin.from("business_signals").select("id,signal_key,category,severity,title,description,amount,status,requires_cpa_review,cpa_review_level,metadata").eq("organization_id", organizationId).eq("status", "active"),
    ]);
    const error = transactions.error ?? categories.error ?? subCategories.error ?? documents.error ?? ruleGroups.error ?? rules.error
      ?? jobberRecords.error ?? jobberConnection.error ?? quickBooksConnection.error ?? plaidItems.error ?? balanceSnapshots.error ?? settings.error
      ?? assignments.error ?? matches.error ?? receiptLinks.error ?? signals.error;
    if (error) throw error;

    const canonical = buildCanonicalFinancialSummary({ organizationId, start: period.start, end: period.end,
      transactions: (transactions.data ?? []) as FinancialTransaction[], categories: (categories.data ?? []) as FinancialCategory[],
      subCategories: (subCategories.data ?? []) as FinancialSubCategory[], documents: (documents.data ?? []) as CanonicalStatementDocument[],
      organization: organization as OrgRow, deductionRuleGroups: (ruleGroups.data ?? []) as DeductionRuleGroup[], deductionRules: (rules.data ?? []) as DeductionRule[] });
    const previousCanonical = buildCanonicalFinancialSummary({ organizationId, start: previousStart, end: previousEnd,
      transactions: (transactions.data ?? []) as FinancialTransaction[], categories: (categories.data ?? []) as FinancialCategory[],
      subCategories: (subCategories.data ?? []) as FinancialSubCategory[], documents: (documents.data ?? []) as CanonicalStatementDocument[],
      organization: organization as OrgRow, deductionRuleGroups: (ruleGroups.data ?? []) as DeductionRuleGroup[], deductionRules: (rules.data ?? []) as DeductionRule[] });
    const yearToDateCanonical = buildCanonicalFinancialSummary({ organizationId, start: yearToDateStart, end: period.end,
      transactions: (transactions.data ?? []) as FinancialTransaction[], categories: (categories.data ?? []) as FinancialCategory[],
      subCategories: (subCategories.data ?? []) as FinancialSubCategory[], documents: (documents.data ?? []) as CanonicalStatementDocument[],
      organization: organization as OrgRow, deductionRuleGroups: (ruleGroups.data ?? []) as DeductionRuleGroup[], deductionRules: (rules.data ?? []) as DeductionRule[] });
    const priorYearCanonical = buildCanonicalFinancialSummary({ organizationId, start: priorYearStart, end: priorYearEnd,
      transactions: (transactions.data ?? []) as FinancialTransaction[], categories: (categories.data ?? []) as FinancialCategory[],
      subCategories: (subCategories.data ?? []) as FinancialSubCategory[], documents: (documents.data ?? []) as CanonicalStatementDocument[],
      organization: organization as OrgRow, deductionRuleGroups: (ruleGroups.data ?? []) as DeductionRuleGroup[], deductionRules: (rules.data ?? []) as DeductionRule[] });
    const records = jobberRecords.data ?? [];
    const connectedSources: IntelligenceSource[] = [];
    if (jobberConnection.data) connectedSources.push("jobber");
    if (quickBooksConnection.data) connectedSources.push("quickbooks");
    if ((plaidItems.data ?? []).length) connectedSources.push("plaid");
    const matchRows = matches.data ?? [];
    const unmatchedTransactions = matchRows.filter(row => row.source_record_type === "transaction" && row.status === "unmatched").length;
    const unmatchedReceipts = matchRows.filter(row => row.source_provider === "receipt" && row.status === "unmatched").length;
    const plaidFreshness = (plaidItems.data ?? []).map(row => row.last_synced_at).filter(Boolean).sort().at(-1) ?? null;
    const healthyPlaid = (plaidItems.data ?? []).length > 0 && (plaidItems.data ?? []).every(row => row.last_sync_status === "completed" && !!row.last_synced_at);
    const cash = verifiedContractorCashPosition({ snapshots: (balanceSnapshots.data ?? []) as BalanceSnapshot[], hasHealthyPlaidConnection: healthyPlaid });

    res.json(buildContractorFinancialIntelligence({ organizationId, start: period.start, end: period.end, canonical,
      previousCanonical, yearToDateCanonical, priorYearCanonical, cash,
      connectedSources, jobberJobs: records.filter(row => row.object_type === "jobs"),
      jobberInvoices: records.filter(row => row.object_type === "invoices"), jobberPayments: records.filter(row => row.object_type === "payments"),
      jobberClients: records.filter(row => row.object_type === "clients"),
      assignments: assignments.data ?? [], receiptTransactionLinks: receiptLinks.data ?? [], signals: signals.data ?? [], unmatchedTransactions, unmatchedReceipts,
      targetGrossMargin: settings.data?.target_gross_margin == null ? null : Number(settings.data.target_gross_margin),
      targetSource: settings.data?.target_margin_source ?? null,
      transactions: (transactions.data ?? []).filter(row => {
        const timestamp = new Date(row.date_time).getTime(); return timestamp >= period.start.getTime() && timestamp <= period.end.getTime();
      }),
      sourceFreshness: { jobber: jobberConnection.data?.last_successful_sync_at ?? null, quickbooks: quickBooksConnection.data?.updated_at ?? null, plaid: plaidFreshness, plaidBalance: cash.latestBalanceAt },
    }));
  } catch (error) {
    res.status(503).json({ error: "contractor_financial_intelligence_unavailable", message: error instanceof Error ? error.message : "Contractor financial intelligence is unavailable." });
  }
});

export default router;
