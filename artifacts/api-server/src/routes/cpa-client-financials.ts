import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { requireApprovedCpa } from "../middlewares/require-approved-cpa";
import { calculateFinancialReport, type FinancialCategory, type FinancialSubCategory, type FinancialTransaction } from "../../../booksmart/src/lib/financial-engine";
import { createFinancialSummary } from "../../../booksmart/src/lib/financial-summary";
import { trustedTransactions } from "../../../booksmart/src/lib/trusted-transactions";
import { CPA_MONITORING_ENGAGEMENT_STATUSES } from "../lib/cpa-monitoring-access";
import { calculateSafeToSpend, calculateThirtyDayForecast, taxReserveAvailability } from "../../../booksmart/src/lib/future-financial-services";
import { verifiedCashBalance, type BalanceSnapshot } from "../lib/verified-cash-balance";

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
      admin.from("orders").select("id").eq("cpa_id", req.cpaUserId!).eq("user_id", clientId)
        .in("status", [...CPA_MONITORING_ENGAGEMENT_STATUSES]).limit(1).maybeSingle(),
      admin.from("organizations").select("id,name").eq("owner_id", clientId).order("id"),
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
    const [{ data: txRows, error: txError }, { data: categoryRows, error: categoryError }, { data: subRows, error: subError }] = await Promise.all([
      admin.from("transactions").select("id,org_id,title,amount,type,date_time,description,deductible,category_id,sub_category_id")
        .in("org_id", organizationIds).gte("date_time", fetchStart.toISOString()).lte("date_time", now.toISOString()).order("date_time", { ascending: false }),
      admin.from("category").select("id,name"), admin.from("sub_category").select("id,name,category_id"),
    ]);
    if (txError || categoryError || subError) throw txError ?? categoryError ?? subError;
    const transactions = trustedTransactions("transactions", (txRows ?? []) as FinancialTransaction[]);
    const categories = (categoryRows ?? []) as FinancialCategory[]; const subCategories = (subRows ?? []) as FinancialSubCategory[];
    const summarize = (start: Date, end: Date) => {
      const report = calculateFinancialReport({ transactions, categories, subCategories, start, end });
      const deductibleAmount = report.classifiedTransactions.filter(tx => !tx.isTransfer && tx.amount < 0 && tx.deductible === true && expenseClasses.has(tx.classification)).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      return { report, summary: createFinancialSummary({ report, deductibleAmount }) };
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
      current_month: current, year_to_date: ytd.summary, health: ytd.summary.transactionCount > 0 ? ytd.summary.health : null, monthly_trend: monthlyTrend, expense_categories: expenseCategories,
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
      admin.from("orders").select("id").eq("cpa_id", req.cpaUserId!).eq("user_id", clientId).in("status", [...CPA_MONITORING_ENGAGEMENT_STATUSES]).limit(1).maybeSingle(),
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
      const id = Number(org.id); const config: any = settings.data?.find(row => Number(row.organization_id) === id) ?? {}; const rows: any[] = items.data?.filter(row => Number(row.organization_id) === id) ?? [];
      const cash = verifiedCashBalance({ snapshots: (snapshots.data?.filter(row => Number(row.organization_id) === id) ?? []) as BalanceSnapshot[], hasHealthyPlaidConnection: (plaid.data ?? []).some(row => Number(row.org_id) === id && row.status === "active" && row.last_sync_status !== "failed") });
      const obligations = rows.filter(row => row.item_type === "obligation"); const filings = rows.filter(row => row.item_type === "filing_schedule"); const taxRequirement = config.tax_effective_rate == null || config.projected_taxable_income == null || config.tax_amount_set_aside == null ? undefined : Math.max(0, Number(config.projected_taxable_income) * Number(config.tax_effective_rate) / 100 - Number(config.tax_amount_set_aside));
      return { organization: { id, name: org.name ?? "Organization" }, verified_cash: { available: cash.available, amount: cash.cashAvailable ?? null, refreshed_at: cash.latestBalanceAt }, inputs: { settings: config, items: rows }, readiness: {
        safe_to_spend: calculateSafeToSpend({ cashAvailable: cash.cashAvailable, balanceFresh: cash.balanceFresh, knownObligations: obligations.length ? obligations.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) : undefined, payrollRequirement: config.payroll_amount == null ? undefined : Number(config.payroll_amount), taxReserveRequirement: taxRequirement, operatingBuffer: config.operating_buffer == null ? undefined : Number(config.operating_buffer) }),
        tax_reserve: taxReserveAvailability({ taxStrategyConfigured: filings.length > 0, effectiveRate: config.tax_effective_rate == null ? undefined : Number(config.tax_effective_rate), projectedTaxableIncome: config.projected_taxable_income == null ? undefined : Number(config.projected_taxable_income), amountSetAside: config.tax_amount_set_aside == null ? undefined : Number(config.tax_amount_set_aside) }),
        forecast: calculateThirtyDayForecast({ openingCash: cash.cashAvailable, balanceFresh: cash.balanceFresh, payrollAmount: config.payroll_amount == null ? undefined : Number(config.payroll_amount), payrollCadence: config.payroll_cadence ?? undefined, nextPayrollDate: config.next_payroll_date ?? undefined, items: rows.map(row => ({ id: Number(row.id), itemType: row.item_type, name: row.name, amount: Number(row.amount ?? 0), dueDate: row.due_date, recurrence: row.recurrence })) }),
      } };
    });
    res.json({ mode: requestedId === null ? "per_organization" : "single_organization", results, generated_at: new Date().toISOString() });
  } catch (error) { console.error("[cpa/client-planning-summary]", error); res.status(503).json({ error: "cpa_planning_summary_unavailable", message: error instanceof Error ? error.message : "Could not load planning summary." }); }
});

export default router;
