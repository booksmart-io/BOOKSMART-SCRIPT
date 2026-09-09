import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { requireApprovedCpa } from "../middlewares/require-approved-cpa";
import { calculateFinancialReport, type FinancialCategory, type FinancialSubCategory, type FinancialTransaction } from "../../../booksmart/src/lib/financial-engine";
import { buildCanonicalFinancialSummary, type CanonicalStatementDocument } from "../lib/canonical-financial-summary";
import type { DeductionRule, DeductionRuleGroup, OrgRow } from "../../../booksmart/src/lib/deduction-calculation";
import { trustedTransactions } from "../../../booksmart/src/lib/trusted-transactions";
import { CPA_MONITORING_ENGAGEMENT_STATUSES } from "../lib/cpa-monitoring-access";
import { buildFinancialPlanningSummary, type PlanningItem, type PlanningSettings } from "../lib/financial-planning-summary";
import type { BalanceSnapshot } from "../lib/verified-cash-balance";

const router = Router();
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://pvppwmkswnluidlwnnck.supabase.co";
const expenseClasses = new Set(["cogs", "opex", "other_expense", "income_tax", "interest"]);

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("CPA financial summary is unavailable.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthEnd = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
const pctChange = (current: number, previous: number) => previous === 0 ? null : Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;

router.get("/cpa/clients/:clientId/financial-summary", requireAuth, requireApprovedCpa, async (req, res) => {
  const clientId = Number(req.params.clientId);
  const requestedOrganizationId = req.query.org_id === undefined || req.query.org_id === "all" ? null : Number(req.query.org_id);
  if (!Number.isSafeInteger(clientId) || clientId <= 0) { res.status(400).json({ error: "invalid_client" }); return; }
  if (requestedOrganizationId !== null && (!Number.isSafeInteger(requestedOrganizationId) || requestedOrganizationId <= 0)) { res.status(400).json({ error: "invalid_organization" }); return; }
  try {
    const admin = adminClient();
    const [{ data: engagement, error: engagementError }, { data: organizations, error: organizationError }] = await Promise.all([
      admin.from("orders").select("id").eq("client_authorized", true).eq("cpa_id", req.cpaUserId!).eq("user_id", clientId)
        .in("status", [...CPA_MONITORING_ENGAGEMENT_STATUSES]).limit(1).maybeSingle(),
      admin.from("organizations").select("*").eq("owner_id", clientId).order("id"),
    ]);
    if (engagementError || organizationError) throw engagementError ?? organizationError;
    if (!engagement || !organizations?.length) { res.status(403).json({ error: "forbidden" }); return; }
    const ownedOrganizations = organizations.map(row => ({ id: Number(row.id), name: row.name ?? "Organization" }));
    if (requestedOrganizationId !== null && !ownedOrganizations.some(row => row.id === requestedOrganizationId)) { res.status(403).json({ error: "forbidden" }); return; }
    const selectedOrganizations = requestedOrganizationId === null ? ownedOrganizations : ownedOrganizations.filter(row => row.id === requestedOrganizationId);
    const organizationIds = selectedOrganizations.map(row => row.id).filter(id => Number.isSafeInteger(id) && id > 0);
    if (!organizationIds.length) { res.status(403).json({ error: "forbidden" }); return; }
    const now = new Date(); const ytdStart = new Date(now.getFullYear(), 0, 1);
    const sixMonthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const fetchStart = ytdStart < sixMonthStart ? ytdStart : sixMonthStart;
    const [transactionResult, categoryResult, subCategoryResult, documentResult, ruleGroupResult, ruleResult] = await Promise.all([
      admin.from("transactions").select("id,org_id,title,amount,type,date_time,description,deductible,category_id,sub_category_id,pending")
        .in("org_id", organizationIds).gte("date_time", fetchStart.toISOString()).lte("date_time", now.toISOString()).order("date_time", { ascending: false }),
      admin.from("category").select("id,name"), admin.from("sub_category").select("id,name,category_id"),
      admin.from("user_documents").select("id,name,category,tax_year,parsed_data").eq("user_id", clientId),
      admin.from("deduction_rule_groups").select("*"), admin.from("deduction_rules").select("*"),
    ]);
    const loadError = transactionResult.error ?? categoryResult.error ?? subCategoryResult.error ?? documentResult.error ?? ruleGroupResult.error ?? ruleResult.error;
    if (loadError) throw loadError;
    const transactions = trustedTransactions("transactions", (transactionResult.data ?? []) as FinancialTransaction[]);
    const categories = (categoryResult.data ?? []) as FinancialCategory[]; const subCategories = (subCategoryResult.data ?? []) as FinancialSubCategory[];
    const canonicalOrganization = selectedOrganizations.length === 1
      ? (organizations.find(row => Number(row.id) === selectedOrganizations[0]!.id) as OrgRow | undefined) ?? null
      : null;
    const summarize = (start: Date, end: Date) => {
      const report = calculateFinancialReport({ transactions, categories, subCategories, start, end });
      const summary = buildCanonicalFinancialSummary({
        organizationId: organizationIds[0]!, start, end, transactions, categories, subCategories,
        documents: (documentResult.data ?? []) as CanonicalStatementDocument[], organization: canonicalOrganization,
        deductionRuleGroups: (ruleGroupResult.data ?? []) as DeductionRuleGroup[], deductionRules: (ruleResult.data ?? []) as DeductionRule[],
      });
      return { report, summary };
    };
    const currentMonth = summarize(monthStart(now), now); const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonth = summarize(monthStart(previousDate), monthEnd(previousDate)); const ytd = summarize(ytdStart, now);
    const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1); const result = summarize(monthStart(date), index === 5 ? now : monthEnd(date)).summary;
      return { month: date.toLocaleDateString("en-US", { month: "short" }), cashIn: result.moneyIn, cashOut: result.moneyOut, netCashMovement: result.netCashMovement };
    });
    const expenseMap = new Map<string, number>();
    for (const tx of ytd.report.classifiedTransactions.filter(tx => !tx.isTransfer && tx.amount < 0 && expenseClasses.has(tx.classification))) {
      const label = tx.sub_category_name ?? tx.category_name ?? tx.classification.replaceAll("_", " ");
      expenseMap.set(label, (expenseMap.get(label) ?? 0) + Math.abs(tx.amount));
    }
    const expenseCategories = [...expenseMap].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, amount]) => ({ name, amount }));
    const current = currentMonth.summary; const previous = previousMonth.summary;
    res.json({
      organization_ids: organizationIds, organizations: ownedOrganizations, selected_organization_id: requestedOrganizationId, generated_at: new Date().toISOString(), last_transaction_at: transactions[0]?.date_time ?? null,
      current_month: current, year_to_date: ytd.summary, health: ytd.summary.completeness.approvedTransactionCount > 0 ? ytd.summary.health : null, monthly_trend: monthlyTrend, expense_categories: expenseCategories,
      changes: { revenue: pctChange(current.revenue, previous.revenue), expenses: pctChange(current.accountingExpenses, previous.accountingExpenses), net_income: pctChange(current.netIncome, previous.netIncome), cash_movement: pctChange(current.netCashMovement, previous.netCashMovement) },
      recent_transactions: transactions.slice(0, 25), income_source_count: new Set(currentMonth.report.classifiedTransactions.filter(tx => tx.classification === "revenue").map(tx => tx.category_name ?? tx.type ?? "Revenue")).size,
      tax_readiness: { available: false, missing_inputs: ["tax_reserve_settings", "estimated_tax_strategy", "filing_schedule"] },
    });
  } catch (error) {
    console.error("[cpa/client-financial-summary]", error);
    res.status(503).json({ error: "cpa_financial_summary_unavailable", message: error instanceof Error ? error.message : "Could not load client financials." });
  }
});

router.get("/cpa/clients/:clientId/planning-summary", requireAuth, requireApprovedCpa, async (req, res) => {
  const clientId = Number(req.params.clientId); const requestedId = req.query.org_id === "all" || req.query.org_id === undefined ? null : Number(req.query.org_id);
  if (!Number.isSafeInteger(clientId) || clientId <= 0 || (requestedId !== null && (!Number.isSafeInteger(requestedId) || requestedId <= 0))) { res.status(400).json({ error: "invalid_request" }); return; }
  try {
    const admin = adminClient();
    const [{ data: engagement, error: engagementError }, { data: organizations, error: organizationError }] = await Promise.all([
      admin.from("orders").select("id").eq("client_authorized", true).eq("cpa_id", req.cpaUserId!).eq("user_id", clientId).in("status", [...CPA_MONITORING_ENGAGEMENT_STATUSES]).limit(1).maybeSingle(),
      admin.from("organizations").select("id,name").eq("owner_id", clientId).order("id"),
    ]);
    if (engagementError || organizationError) throw engagementError ?? organizationError;
    if (!engagement || !organizations?.length) { res.status(403).json({ error: "forbidden" }); return; }
    if (requestedId !== null && !organizations.some(row => Number(row.id) === requestedId)) { res.status(403).json({ error: "forbidden" }); return; }
    const selected = requestedId === null ? organizations : organizations.filter(row => Number(row.id) === requestedId); const ids = selected.map(row => Number(row.id));
    const [settings, items, snapshots, plaid] = await Promise.all([
      admin.from("financial_planning_settings").select("*").in("organization_id", ids), admin.from("financial_planning_items").select("*").in("organization_id", ids).eq("status", "active").order("due_date"),
      admin.from("account_balance_snapshots").select("organization_id,external_account_id,account_type,current_balance,available_balance,currency,balance_timestamp").in("organization_id", ids).eq("provider", "plaid").order("balance_timestamp", { ascending: false }).limit(500),
      admin.from("plaid_items").select("org_id,status,last_sync_status").in("org_id", ids),
    ]);
    const error = settings.error ?? items.error ?? snapshots.error ?? plaid.error; if (error) throw error;
    const results = selected.map(org => {
      const id = Number(org.id);
      const config = (settings.data?.find(row => Number(row.organization_id) === id) ?? null) as PlanningSettings | null;
      const rows = (items.data?.filter(row => Number(row.organization_id) === id) ?? []) as PlanningItem[];
      const summary = buildFinancialPlanningSummary({
        settings: config, items: rows,
        snapshots: (snapshots.data?.filter(row => Number(row.organization_id) === id) ?? []) as BalanceSnapshot[],
        connections: (plaid.data ?? []).filter(row => Number(row.org_id) === id),
      });
      return { organization: { id, name: org.name ?? "Organization" }, ...summary, inputs: { settings: config ?? {}, items: rows } };
    });
    res.json({ mode: requestedId === null ? "per_organization" : "single_organization", results, generated_at: new Date().toISOString() });
  } catch (error) { console.error("[cpa/client-planning-summary]", error); res.status(503).json({ error: "cpa_planning_summary_unavailable", message: error instanceof Error ? error.message : "Could not load planning summary." }); }
});

export default router;
