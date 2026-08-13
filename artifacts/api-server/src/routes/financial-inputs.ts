import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { calculateSafeToSpend, calculateThirtyDayForecast, taxReserveAvailability } from "../../../booksmart/src/lib/future-financial-services";
import { verifiedCashBalance, type BalanceSnapshot } from "../lib/verified-cash-balance";

const router = Router();
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://pvppwmkswnluidlwnnck.supabase.co";
const itemTypes = new Set(["obligation", "receivable", "filing_schedule"]);
const recurrences = new Set(["none", "weekly", "monthly", "quarterly", "yearly"]);
const payrollCadences = new Set(["weekly", "biweekly", "semimonthly", "monthly"]);

function adminClient() { const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!key) throw new Error("Financial planning inputs are unavailable."); return createClient(SUPABASE_URL, key, { auth: { persistSession: false } }); }
function positiveId(value: unknown) { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; }
function optionalMoney(value: unknown) { if (value === null || value === undefined || value === "") return null; const amount = Number(value); return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : undefined; }
function validDate(value: unknown) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()); }
async function owner(admin: SupabaseClient, authId: string, orgId: number) { const { data: user } = await admin.from("users").select("id").eq("auth_id", authId).maybeSingle(); if (!user) return null; const { data: org } = await admin.from("organizations").select("id").eq("id", orgId).eq("owner_id", user.id).maybeSingle(); return org ? Number(user.id) : null; }
async function audit(admin: SupabaseClient, organizationId: number, actorUserId: number, action: string, fields: string[], itemId?: number) { await admin.from("financial_planning_audit_events").insert({ organization_id: organizationId, actor_user_id: actorUserId, action, item_id: itemId ?? null, changed_fields: fields }); }

router.get("/financial-inputs", requireAuth, async (req, res) => {
  const orgId = positiveId(req.query.organization_id); if (!orgId) { res.status(400).json({ error: "organization_required" }); return; }
  try {
    const admin = adminClient(); const userId = await owner(admin, req.supabaseUserId!, orgId); if (!userId) { res.status(403).json({ error: "forbidden" }); return; }
    const [settingsResult, itemsResult, snapshotsResult, plaidResult] = await Promise.all([
      admin.from("financial_planning_settings").select("*").eq("organization_id", orgId).maybeSingle(),
      admin.from("financial_planning_items").select("*").eq("organization_id", orgId).order("due_date"),
      admin.from("account_balance_snapshots").select("external_account_id,account_type,current_balance,available_balance,currency,balance_timestamp").eq("organization_id", orgId).eq("provider", "plaid").order("balance_timestamp", { ascending: false }).limit(250),
      admin.from("plaid_items").select("status,last_sync_status").eq("org_id", orgId),
    ]);
    if (settingsResult.error || itemsResult.error || snapshotsResult.error || plaidResult.error) throw settingsResult.error ?? itemsResult.error ?? snapshotsResult.error ?? plaidResult.error;
    const settings = settingsResult.data ?? {}; const active = (itemsResult.data ?? []).filter(row => row.status === "active");
    const obligations = active.filter(row => row.item_type === "obligation"); const receivables = active.filter(row => row.item_type === "receivable"); const filings = active.filter(row => row.item_type === "filing_schedule");
    const knownObligations = obligations.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const taxReserveRequirement = settings.tax_effective_rate == null || settings.projected_taxable_income == null || settings.tax_amount_set_aside == null ? undefined : Math.max(0, Number(settings.projected_taxable_income) * Number(settings.tax_effective_rate) / 100 - Number(settings.tax_amount_set_aside));
    const cash = verifiedCashBalance({ snapshots: (snapshotsResult.data ?? []) as BalanceSnapshot[], hasHealthyPlaidConnection: (plaidResult.data ?? []).some(row => row.status === "active" && row.last_sync_status !== "failed") });
    const readiness = {
      safe_to_spend: calculateSafeToSpend({ cashAvailable: cash.cashAvailable, balanceFresh: cash.balanceFresh, knownObligations: obligations.length ? knownObligations : undefined, payrollRequirement: settings.payroll_amount == null ? undefined : Number(settings.payroll_amount), taxReserveRequirement, operatingBuffer: settings.operating_buffer == null ? undefined : Number(settings.operating_buffer) }),
      tax_reserve: taxReserveAvailability({ taxStrategyConfigured: filings.length > 0, effectiveRate: settings.tax_effective_rate == null ? undefined : Number(settings.tax_effective_rate), projectedTaxableIncome: settings.projected_taxable_income == null ? undefined : Number(settings.projected_taxable_income), amountSetAside: settings.tax_amount_set_aside == null ? undefined : Number(settings.tax_amount_set_aside) }),
      forecast: calculateThirtyDayForecast({
        openingCash: cash.cashAvailable, balanceFresh: cash.balanceFresh,
        payrollAmount: settings.payroll_amount == null ? undefined : Number(settings.payroll_amount),
        payrollCadence: settings.payroll_cadence ?? undefined, nextPayrollDate: settings.next_payroll_date ?? undefined,
        items: active.map(row => ({ id: Number(row.id), itemType: row.item_type, name: row.name, amount: Number(row.amount ?? 0), dueDate: row.due_date, recurrence: row.recurrence })),
      }),
    };
    res.json({ organization_id: orgId, settings: settingsResult.data, items: itemsResult.data ?? [], verified_cash: { available: cash.available, amount: cash.cashAvailable ?? null, account_count: cash.accountCount, refreshed_at: cash.latestBalanceAt, freshness_hours: 24 }, readiness });
  } catch (error) { res.status(503).json({ error: "financial_inputs_unavailable", message: error instanceof Error ? error.message : "Could not load planning inputs." }); }
});

router.put("/financial-inputs/settings", requireAuth, async (req, res) => {
  const orgId = positiveId(req.body?.organization_id); if (!orgId) { res.status(400).json({ error: "organization_required" }); return; }
  const moneyFields = ["payroll_amount", "operating_buffer", "projected_taxable_income", "tax_amount_set_aside"] as const;
  const values: Record<string, unknown> = {}; for (const field of moneyFields) { const parsed = optionalMoney(req.body?.[field]); if (parsed === undefined) { res.status(400).json({ error: `invalid_${field}` }); return; } values[field] = parsed; }
  const rate = optionalMoney(req.body?.tax_effective_rate); if (rate === undefined || (rate !== null && rate > 100)) { res.status(400).json({ error: "invalid_tax_effective_rate" }); return; } values.tax_effective_rate = rate;
  const cadence = req.body?.payroll_cadence || null; if (cadence !== null && !payrollCadences.has(cadence)) { res.status(400).json({ error: "invalid_payroll_cadence" }); return; }
  const payrollDate = req.body?.next_payroll_date || null; if (payrollDate !== null && !validDate(payrollDate)) { res.status(400).json({ error: "invalid_next_payroll_date" }); return; }
  Object.assign(values, { payroll_cadence: cadence, next_payroll_date: payrollDate, updated_at: new Date().toISOString() });
  try { const admin = adminClient(); const userId = await owner(admin, req.supabaseUserId!, orgId); if (!userId) { res.status(403).json({ error: "forbidden" }); return; } const { data, error } = await admin.from("financial_planning_settings").upsert({ organization_id: orgId, ...values }).select("*").single(); if (error) throw error; await audit(admin, orgId, userId, "settings_updated", Object.keys(values)); res.json({ settings: data }); } catch (error) { res.status(503).json({ error: "settings_save_failed", message: error instanceof Error ? error.message : "Could not save settings." }); }
});

router.post("/financial-inputs/items", requireAuth, async (req, res) => {
  const orgId = positiveId(req.body?.organization_id); const type = String(req.body?.item_type ?? ""); const name = String(req.body?.name ?? "").trim(); const amount = optionalMoney(req.body?.amount); const recurrence = String(req.body?.recurrence ?? "none");
  if (!orgId || !itemTypes.has(type) || !name || name.length > 160 || amount === undefined || !validDate(req.body?.due_date) || !recurrences.has(recurrence)) { res.status(400).json({ error: "invalid_planning_item" }); return; }
  if (type !== "filing_schedule" && amount === null) { res.status(400).json({ error: "amount_required" }); return; }
  try { const admin = adminClient(); const userId = await owner(admin, req.supabaseUserId!, orgId); if (!userId) { res.status(403).json({ error: "forbidden" }); return; } const { data, error } = await admin.from("financial_planning_items").insert({ organization_id: orgId, item_type: type, name, amount, due_date: req.body.due_date, recurrence, notes: req.body?.notes ? String(req.body.notes).slice(0, 1000) : null }).select("*").single(); if (error) throw error; await audit(admin, orgId, userId, "item_created", ["item_type","name","amount","due_date","recurrence"], Number(data.id)); res.status(201).json({ item: data }); } catch (error) { res.status(503).json({ error: "item_create_failed", message: error instanceof Error ? error.message : "Could not create input." }); }
});

router.delete("/financial-inputs/items/:id", requireAuth, async (req, res) => {
  const orgId = positiveId(req.query.organization_id); const id = positiveId(req.params.id); if (!orgId || !id) { res.status(400).json({ error: "invalid_request" }); return; }
  try { const admin = adminClient(); const userId = await owner(admin, req.supabaseUserId!, orgId); if (!userId) { res.status(403).json({ error: "forbidden" }); return; } const { data, error } = await admin.from("financial_planning_items").delete().eq("id", id).eq("organization_id", orgId).select("id").maybeSingle(); if (error) throw error; if (!data) { res.status(404).json({ error: "item_not_found" }); return; } await audit(admin, orgId, userId, "item_deleted", [], id); res.status(204).end(); } catch (error) { res.status(503).json({ error: "item_delete_failed", message: error instanceof Error ? error.message : "Could not delete input." }); }
});

export default router;
