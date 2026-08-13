import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { buildCanonicalFinancialSummary, buildCanonicalHomeSummaryPair, parseFinancialSummaryInstantPeriod, parseFinancialSummaryPeriod, type CanonicalStatementDocument } from "../lib/canonical-financial-summary";
import type { FinancialCategory, FinancialSubCategory, FinancialTransaction } from "../../../booksmart/src/lib/financial-engine";
import { compareFinancialSummaries, type ShadowSources, type ShadowValues } from "../lib/financial-summary-shadow";
import type { DeductionRule, DeductionRuleGroup, OrgRow } from "../../../booksmart/src/lib/deduction-calculation";

const router = Router();
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://pvppwmkswnluidlwnnck.supabase.co";

function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Financial summary is unavailable.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

router.get("/organizations/:organizationId/financial-summary", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  const period = parseFinancialSummaryInstantPeriod(req.query.startInstant, req.query.endInstant)
    ?? parseFinancialSummaryPeriod(req.query.start, req.query.end);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) { res.status(400).json({ error: "invalid_organization" }); return; }
  if (!period) { res.status(400).json({ error: "invalid_period", message: "Provide a valid date range or exact start and end instants." }); return; }
  try {
    const admin = adminClient();
    const { data: user, error: userError } = await admin.from("users").select("id").eq("auth_id", req.supabaseUserId!).maybeSingle();
    if (userError) throw userError;
    if (!user) { res.status(403).json({ error: "forbidden" }); return; }
    const { data: organization, error: organizationError } = await admin.from("organizations").select("*").eq("id", organizationId).eq("owner_id", user.id).maybeSingle();
    if (organizationError) throw organizationError;
    if (!organization) { res.status(403).json({ error: "forbidden" }); return; }
    const [transactions, categories, subCategories, documents, deductionRuleGroups, deductionRules] = await Promise.all([
      admin.from("transactions").select("id,title,amount,type,date_time,description,deductible,category_id,sub_category_id,pending").eq("org_id", organizationId).gte("date_time", period.start.toISOString()).lte("date_time", period.end.toISOString()),
      admin.from("category").select("id,name"),
      admin.from("sub_category").select("id,name,category_id"),
      admin.from("user_documents").select("id,name,category,tax_year,parsed_data").eq("user_id", user.id),
      admin.from("deduction_rule_groups").select("*"),
      admin.from("deduction_rules").select("*"),
    ]);
    const error = transactions.error ?? categories.error ?? subCategories.error ?? documents.error ?? deductionRuleGroups.error ?? deductionRules.error;
    if (error) throw error;
    res.json(buildCanonicalFinancialSummary({
      organizationId,
      start: period.start,
      end: period.end,
      transactions: (transactions.data ?? []) as FinancialTransaction[],
      categories: (categories.data ?? []) as FinancialCategory[],
      subCategories: (subCategories.data ?? []) as FinancialSubCategory[],
      documents: (documents.data ?? []) as CanonicalStatementDocument[],
      organization: organization as OrgRow,
      deductionRuleGroups: (deductionRuleGroups.data ?? []) as DeductionRuleGroup[],
      deductionRules: (deductionRules.data ?? []) as DeductionRule[],
    }));
  } catch (error) {
    res.status(503).json({ error: "financial_summary_unavailable", message: error instanceof Error ? error.message : "Financial summary is unavailable." });
  }
});

router.get("/organizations/:organizationId/financial-summary/home-pair", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  const current = parseFinancialSummaryInstantPeriod(req.query.currentStartInstant, req.query.currentEndInstant);
  const previous = parseFinancialSummaryInstantPeriod(req.query.previousStartInstant, req.query.previousEndInstant);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) { res.status(400).json({ error: "invalid_organization" }); return; }
  if (!current || !previous || previous.end >= current.start) { res.status(400).json({ error: "invalid_period_pair" }); return; }
  try {
    const admin = adminClient();
    const { data: user, error: userError } = await admin.from("users").select("id").eq("auth_id", req.supabaseUserId!).maybeSingle();
    if (userError) throw userError;
    if (!user) { res.status(403).json({ error: "forbidden" }); return; }
    const { data: organization, error: organizationError } = await admin.from("organizations").select("*").eq("id", organizationId).eq("owner_id", user.id).maybeSingle();
    if (organizationError) throw organizationError;
    if (!organization) { res.status(403).json({ error: "forbidden" }); return; }
    const [transactions, categories, subCategories, documents, deductionRuleGroups, deductionRules] = await Promise.all([
      admin.from("transactions").select("id,title,amount,type,date_time,description,deductible,category_id,sub_category_id,pending").eq("org_id", organizationId).gte("date_time", previous.start.toISOString()).lte("date_time", current.end.toISOString()),
      admin.from("category").select("id,name"), admin.from("sub_category").select("id,name,category_id"),
      admin.from("user_documents").select("id,name,category,tax_year,parsed_data").eq("user_id", user.id),
      admin.from("deduction_rule_groups").select("*"), admin.from("deduction_rules").select("*"),
    ]);
    const error = transactions.error ?? categories.error ?? subCategories.error ?? documents.error ?? deductionRuleGroups.error ?? deductionRules.error;
    if (error) throw error;
    res.json(buildCanonicalHomeSummaryPair({
      organizationId, currentStart: current.start, currentEnd: current.end, previousStart: previous.start, previousEnd: previous.end,
      transactions: (transactions.data ?? []) as FinancialTransaction[], categories: (categories.data ?? []) as FinancialCategory[],
      subCategories: (subCategories.data ?? []) as FinancialSubCategory[], documents: (documents.data ?? []) as CanonicalStatementDocument[],
      organization: organization as OrgRow, deductionRuleGroups: (deductionRuleGroups.data ?? []) as DeductionRuleGroup[], deductionRules: (deductionRules.data ?? []) as DeductionRule[],
    }));
  } catch (error) {
    res.status(503).json({ error: "financial_summary_pair_unavailable", message: error instanceof Error ? error.message : "Financial summary pair is unavailable." });
  }
});

router.post("/organizations/:organizationId/financial-summary/shadow", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  const period = parseFinancialSummaryInstantPeriod(req.body?.startInstant, req.body?.endInstant)
    ?? parseFinancialSummaryPeriod(req.body?.start, req.body?.end);
  const surface = String(req.body?.surface ?? "");
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !["home", "reports"].includes(surface) || !period) {
    res.status(400).json({ error: "invalid_shadow_observation" }); return;
  }
  try {
    const admin = adminClient();
    const { data: user } = await admin.from("users").select("id").eq("auth_id", req.supabaseUserId!).maybeSingle();
    if (!user) { res.status(403).json({ error: "forbidden" }); return; }
    const { data: organization } = await admin.from("organizations").select("*").eq("id", organizationId).eq("owner_id", user.id).maybeSingle();
    if (!organization) { res.status(403).json({ error: "forbidden" }); return; }
    const [transactions, categories, subCategories, documents, deductionRuleGroups, deductionRules] = await Promise.all([
      admin.from("transactions").select("id,title,amount,type,date_time,description,deductible,category_id,sub_category_id,pending").eq("org_id", organizationId).gte("date_time", period.start.toISOString()).lte("date_time", period.end.toISOString()),
      admin.from("category").select("id,name"), admin.from("sub_category").select("id,name,category_id"),
      admin.from("user_documents").select("id,name,category,tax_year,parsed_data").eq("user_id", user.id),
      admin.from("deduction_rule_groups").select("*"), admin.from("deduction_rules").select("*"),
    ]);
    const loadError = transactions.error ?? categories.error ?? subCategories.error ?? documents.error ?? deductionRuleGroups.error ?? deductionRules.error;
    if (loadError) throw loadError;
    const canonical = buildCanonicalFinancialSummary({ organizationId, start: period.start, end: period.end,
      transactions: (transactions.data ?? []) as FinancialTransaction[], categories: (categories.data ?? []) as FinancialCategory[],
      subCategories: (subCategories.data ?? []) as FinancialSubCategory[], documents: (documents.data ?? []) as CanonicalStatementDocument[],
      organization: organization as OrgRow, deductionRuleGroups: (deductionRuleGroups.data ?? []) as DeductionRuleGroup[], deductionRules: (deductionRules.data ?? []) as DeductionRule[] });
    const legacy = req.body?.values as ShadowValues;
    const legacySources = (req.body?.sources ?? {}) as ShadowSources;
    const canonicalValues: ShadowValues = { revenue: canonical.revenue, accountingExpenses: canonical.accountingExpenses,
      netIncome: canonical.netIncome, moneyIn: canonical.moneyIn, moneyOut: canonical.moneyOut,
      netCashMovement: canonical.netCashMovement, healthScore: canonical.health.score };
    const result = compareFinancialSummaries({ legacy, canonical: canonicalValues, legacySources, canonicalSources: canonical.sources });
    const { error } = await admin.from("financial_summary_shadow_comparisons").insert({
      organization_id: organizationId, surface,
      period_start: `${String(req.body?.start).slice(0, 10)}T00:00:00.000Z`,
      period_end: `${String(req.body?.end).slice(0, 10)}T23:59:59.999Z`,
      legacy_values: legacy, canonical_values: canonicalValues, legacy_sources: legacySources, canonical_sources: canonical.sources,
      differences: result.differences, classification: result.classification, calculation_version: canonical.calculationVersion,
    });
    if (error) throw error;
    res.status(202).json({ accepted: true, classification: result.classification, difference_count: result.differences.length });
  } catch (error) {
    res.status(503).json({ error: "shadow_comparison_unavailable", message: error instanceof Error ? error.message : "Shadow comparison is unavailable." });
  }
});

router.post("/organizations/:organizationId/financial-summary/rollout-event", requireAuth, async (req, res) => {
  const organizationId = Number(req.params.organizationId);
  const surface = String(req.body?.surface ?? "");
  const mode = String(req.body?.mode ?? "");
  const responseMs = req.body?.response_ms == null ? null : Number(req.body.response_ms);
  const failureReason = typeof req.body?.failure_reason === "string" ? req.body.failure_reason.trim().slice(0, 300) : null;
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !["home", "reports"].includes(surface) || !["canonical", "fallback"].includes(mode)
    || (responseMs !== null && (!Number.isInteger(responseMs) || responseMs < 0 || responseMs > 300_000))) {
    res.status(400).json({ error: "invalid_rollout_event" }); return;
  }
  try {
    const admin = adminClient();
    const { data: user } = await admin.from("users").select("id").eq("auth_id", req.supabaseUserId!).maybeSingle();
    if (!user) { res.status(403).json({ error: "forbidden" }); return; }
    const { data: organization } = await admin.from("organizations").select("id").eq("id", organizationId).eq("owner_id", user.id).maybeSingle();
    if (!organization) { res.status(403).json({ error: "forbidden" }); return; }
    const { error } = await admin.from("financial_summary_rollout_events").insert({
      organization_id: organizationId, surface, mode, response_ms: responseMs,
      failure_reason: mode === "fallback" ? (failureReason || "canonical_summary_unavailable") : null,
      calculation_version: "financial-summary-v2",
    });
    if (error) throw error;
    res.status(202).json({ accepted: true });
  } catch (error) {
    res.status(503).json({ error: "rollout_telemetry_unavailable", message: error instanceof Error ? error.message : "Rollout telemetry is unavailable." });
  }
});

export default router;
