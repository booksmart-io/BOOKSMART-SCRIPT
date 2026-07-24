import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useDeductionRuleSet, summarizeDeductions, type OrgRow } from "@/lib/deduction-engine";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import { liabilityBalanceEntries } from "@/lib/survey-liabilities";
import {
  Card, CardContent, CardHeader, CardTitle, CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Sparkles, Zap, Loader2, AlertCircle,
  DollarSign, TrendingDown, Hash, Percent, ChevronDown, ChevronRight, Tag,
  Building2, Send, Info, Calendar,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Difficulty = "Easy" | "Medium" | "Hard";
type Status     = "New" | "Recommended" | "Action Required";
type TabKey     = "strategy" | "deduction";
type TaxType    = "Federal" | "State";
type DeductionPeriod = "year" | "all";

type Strategy = {
  title: string; description: string; savings: number;
  deduction_amount?: number;
  rank?: number;
  difficulty: Difficulty; status: Status; action_steps?: string[];
  source_facts?: string[];
  calculation?: {
    user_data_inputs: Array<{
      label: string;
      value: number;
      source_fact: string;
    }>;
    formula: string;
    deduction_amount: number;
    result: number;
  };
};

// Row shape of the `ai_tax_strategies` Supabase table (persisted storage).
type StrategyRow = {
  id: number; user_id: string; org_id: number;
  title: string; summary: string | null; category: string | null;
  estimated_savings: number | null; risk_level: string | null;
  audit_risk: string | null; implementation_steps: string[] | null;
  tags: string[] | null; ai_context: string | null; created_at: string;
};

type Transaction = {
  id: number; title: string; amount: number; type: string;
  date_time: string; description: string; deductible: boolean;
  category_id?: number | null;
  sub_category_id?: number | null;
};

type Category = { id: number; name: string };
type SubCategory = { id: number; name: string; category_id: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function difficultyFromRisk(risk: string | null | undefined): Difficulty {
  if (risk === "High") return "Hard";
  if (risk === "Moderate" || risk === "Medium") return "Medium";
  return "Easy";
}

function riskFromDifficulty(d: Difficulty): string {
  if (d === "Hard") return "High";
  if (d === "Medium") return "Moderate";
  return "Low";
}

function statusFromRow(row: StrategyRow): Status {
  if (row.audit_risk === "High") return "Action Required";
  return "Recommended";
}

function auditRiskFromStatus(s: Status): string {
  if (s === "Action Required") return "High";
  if (s === "New") return "Low";
  return "Moderate";
}

// Turns the Business Survey fields on an organization row into a compact,
// readable profile block for the AI strategy-generation prompt. Only
// includes fields the user actually answered.
function buildSurveyProfile(org: OrgRow | null | undefined): string {
  if (!org) return "";
  const lines: string[] = [];
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const arr = (v: unknown) => (Array.isArray(v) && v.length ? (v as string[]).join(", ") : null);
  const bool = (v: unknown) => (typeof v === "boolean" ? (v ? "Yes" : "No") : null);
  const num = (v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v : null);

  const filingStatus = str(org.filing_status);
  if (filingStatus) lines.push(`- Filing status: ${filingStatus}`);
  const primaryState = str(org.primary_state);
  if (primaryState) lines.push(`- Primary business state: ${primaryState}`);
  const residency = str(org.residency_status);
  if (residency) lines.push(`- Residency status: ${residency}`);
  const multiState = bool(org.multi_state_activity);
  if (multiState) lines.push(`- Operates in multiple states: ${multiState}`);

  const incomeTypes = arr(org.primary_income_types);
  if (incomeTypes) lines.push(`- Income types: ${incomeTypes}`);
  const niche = str(org.industry_niche);
  if (niche) lines.push(`- Industry/niche: ${niche}`);
  const passiveIncome = arr(org.passive_income);
  if (passiveIncome) lines.push(`- Passive/investment income sources: ${passiveIncome}`);

  const accountingMethod = str(org.accounting_method);
  if (accountingMethod) lines.push(`- Accounting method: ${accountingMethod}`);
  const teamStructure = arr(org.team_structure);
  if (teamStructure) lines.push(`- Team structure: ${teamStructure}`);
  const majorEquipment = bool(org.major_equipment);
  if (majorEquipment) lines.push(`- Made major equipment purchases: ${majorEquipment}`);

  const vehicleOwnership = str(org.vehicle_ownership);
  if (vehicleOwnership) lines.push(`- Vehicle ownership: ${vehicleOwnership}`);
  const vehicleUsage = str(org.vehicle_usage);
  if (vehicleUsage) lines.push(`- Vehicle deduction method: ${vehicleUsage}`);
  const vehicleOver6k = bool(org.vehicle_over_6k_lbs);
  if (vehicleOver6k) lines.push(`- Vehicle over 6,000 lbs: ${vehicleOver6k}`);
  const vehiclePct = num(org.business_vehicle_percent);
  if (vehiclePct != null) lines.push(`- Business-use % of vehicle: ${vehiclePct}%`);

  const homeOfficeType = str(org.home_office_type);
  if (homeOfficeType) lines.push(`- Home office type: ${homeOfficeType}`);
  const homeStatus = str(org.home_status);
  if (homeStatus) lines.push(`- Home ownership status: ${homeStatus}`);
  const techUsage = arr(org.tech_usage);
  if (techUsage) lines.push(`- Tech/software tools used: ${techUsage}`);
  const homeOfficeSqft = num(org.dedicated_office_area_sqft);
  const homeSqft = num(org.total_house_area_sqft);
  if (homeOfficeSqft != null && homeSqft != null) {
    lines.push(`- Home office size: ${homeOfficeSqft} sqft of ${homeSqft} sqft total home`);
  }
  const realEstateInterests = arr(org.real_estate_interests);
  if (realEstateInterests) lines.push(`- Real estate interests: ${realEstateInterests}`);
  const hostsMeetings = bool(org.hosts_business_meetings);
  if (hostsMeetings) lines.push(`- Hosts business meetings at home (Augusta Rule potential): ${hostsMeetings}`);
  const utilityPct = num(org.business_utility_percent);
  if (utilityPct != null) lines.push(`- Business-use % of utilities: ${utilityPct}%`);
  const mealPct = num(org.business_meal_percent);
  if (mealPct != null) lines.push(`- Business-use % of meals: ${mealPct}%`);

  const healthInsurance = str(org.health_insurance);
  if (healthInsurance) lines.push(`- Health insurance setup: ${healthInsurance}`);
  const healthSavings = arr(org.health_savings);
  if (healthSavings) lines.push(`- Health savings accounts: ${healthSavings}`);
  const familyEducation = arr(org.family_education);
  if (familyEducation) lines.push(`- Family/education costs: ${familyEducation}`);

  const taxGoal = str(org.tax_goal);
  if (taxGoal) lines.push(`- Primary tax goal: ${taxGoal}`);
  const retirementCurrent = arr(org.retirement_current);
  if (retirementCurrent) lines.push(`- Current retirement accounts: ${retirementCurrent}`);
  const auditAppetite = str(org.audit_appetite);
  if (auditAppetite) lines.push(`- Audit-risk appetite: ${auditAppetite}`);

  const equipmentCost = num(org.equipment_cost);
  if (equipmentCost != null) lines.push(`- Major equipment purchases this year: $${equipmentCost.toFixed(0)}`);

  const debts = org.debts as Record<string, unknown> | null | undefined;
  if (debts && typeof debts === "object") {
    const onboarding = debts.onboarding_profile as Record<string, unknown> | null | undefined;
    if (onboarding && typeof onboarding === "object") {
      const addText = (label: string, value: unknown) => {
        if (typeof value === "string" && value.trim()) lines.push(`- ${label}: ${value.trim()}`);
      };
      const addArray = (label: string, value: unknown) => {
        if (Array.isArray(value) && value.length) lines.push(`- ${label}: ${value.join(", ")}`);
      };
      addText("NAICS code", onboarding.naics_code);
      addText("Business description", onboarding.business_description);
      addText("Business status", onboarding.business_status);
      addText("Year established", onboarding.year_established);
      const ownership = onboarding.ownership as Record<string, unknown> | undefined;
      if (ownership?.ownership_percent) lines.push(`- Owner percentage: ${ownership.ownership_percent}%`);
      const banking = onboarding.banking as Record<string, unknown> | undefined;
      addText("Primary bank", banking?.primary_bank);
      addText("Accounting software", banking?.accounting_software);
      addText("Payroll provider", banking?.payroll_provider);
      addArray("Payment platforms", banking?.payment_platforms);
      addArray("Business operations", onboarding.operations);
      const snapshot = onboarding.financial_snapshot as Record<string, unknown> | undefined;
      addText("Approximate annual revenue", snapshot?.approximate_annual_revenue);
      addText("Profitability", snapshot?.profitability);
      addArray("Deduction profile", onboarding.deduction_profile);
      addArray("Business goals", onboarding.goals);
      const funding = onboarding.funding as Record<string, unknown> | undefined;
      addText("Funding plans", funding?.plans_to_apply);
      addArray("Funding purposes", funding?.purposes);
      addArray("AI notification preferences", onboarding.ai_preferences);
    }

    const debtEntries = liabilityBalanceEntries(debts);
    if (debtEntries.length) {
      const debtStr = debtEntries.map(([k, v]) => `${k.replace(/_/g, " ")}: $${v.toFixed(0)}`).join(", ");
      lines.push(`- Outstanding business debts: ${debtStr}`);
    }
  }

  return lines.join("\n");
}

function rowToStrategy(row: StrategyRow): Strategy {
  let deductionAmount = 0;
  let rank: number | undefined;
  try {
    const context = JSON.parse(row.ai_context ?? "{}") as { deduction_amount?: unknown; rank?: unknown };
    if (typeof context.deduction_amount === "number" && Number.isFinite(context.deduction_amount)) {
      deductionAmount = context.deduction_amount;
    }
    if (typeof context.rank === "number" && Number.isInteger(context.rank)) rank = context.rank;
  } catch {
    // Legacy strategies stored plain-text context and have no validated deduction amount.
  }
  return {
    title: row.title,
    description: row.summary ?? "",
    savings: row.estimated_savings ?? 0,
    deduction_amount: deductionAmount,
    rank,
    difficulty: difficultyFromRisk(row.risk_level),
    status: statusFromRow(row),
    action_steps: row.implementation_steps ?? undefined,
  };
}

function statusColor(s: Status) {
  if (s === "Recommended")    return "text-primary border-primary/30 bg-primary/10";
  if (s === "Action Required") return "text-destructive border-destructive/30 bg-destructive/10";
  return "text-emerald-500 border-emerald-500/30 bg-emerald-500/10";
}

const PIE_COLORS = [
  "#F5A623", "#4ECDC4", "#A78BFA", "#F87171", "#34D399",
  "#60A5FA", "#FB923C", "#E879F9", "#94A3B8", "#FBBF24",
];

function categoryLabelFor(t: Transaction, categories: Category[], subCategories: SubCategory[]) {
  const cat = categories.find(c => c.id === t.category_id);
  const sub = subCategories.find(s => s.id === t.sub_category_id);
  if (sub) return sub.name;
  if (cat) return cat.name;
  return "Uncategorized";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AiStrategy() {
  const { profile } = useAuth();
  const { toast }   = useToast();
  const queryClient = useQueryClient();
  const numericId   = profile?.numericId ?? null;
  const authUid     = profile?.id ?? null;
  const [activeOrgId] = useActiveOrganizationId(numericId);

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<TabKey>("strategy");

  // ── AI Strategy state ────────────────────────────────────────────────────
  const [generating, setGenerating]       = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);

  // ── Ask BookSmart AI chat state ──────────────────────────────────────────
  const [askInput, setAskInput]     = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askMessages, setAskMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  const sendAskMessage = useCallback(async (strategy: Strategy) => {
    const msg = askInput.trim();
    if (!msg || askLoading) return;
    const next = [...askMessages, { role: "user" as const, content: msg }];
    setAskMessages(next);
    setAskInput("");
    setAskLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const systemPrompt = `You are BookSmart AI, an expert US tax strategist. The user is asking about the following tax strategy: "${strategy.title}". Context: ${strategy.description}. Estimated savings: $${strategy.savings}. Answer concisely and practically.`;
      const res = await fetch("/api/openai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            ...next.map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      });
      const aiData = await res.json() as { choices?: { message?: { content?: string } }[] };
      const reply = aiData.choices?.[0]?.message?.content ?? "Sorry, I couldn't generate a response.";
      setAskMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setAskMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setAskLoading(false);
    }
  }, [askInput, askLoading, askMessages]);

  // ── AI Deduction state ───────────────────────────────────────────────────
  const curYear = new Date().getFullYear();
  const [dedPeriod, setDedPeriod]         = useState<DeductionPeriod>("year");
  const [dedStart, setDedStart]           = useState(`${curYear}-01-01`);
  const [dedEnd, setDedEnd]               = useState(`${curYear}-12-31`);
  const [taxType, setTaxType]             = useState<TaxType>("Federal");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // ── Org lookup ────────────────────────────────────────────────────────────
  const { data: org } = useQuery<OrgRow | null>({
    queryKey: ["user_org_strat", numericId, activeOrgId],
    enabled:  numericId !== null,
    staleTime: 5 * 60 * 1000,
    queryFn:  async () => {
      const { data, error } = await supabase.from("organizations").select("*")
        .eq("owner_id", numericId!).order("id", { ascending: true });
      if (error) throw error;
      return pickActiveOrganization(data as OrgRow[] | null, activeOrgId);
    },
  });
  const orgId = org?.id ?? null;
  const orgStateId = (org?.state as number | undefined) ?? null;

  // ── Persisted AI strategies (Supabase `ai_tax_strategies` table) ──────────
  const strategiesQueryKey = ["ai_tax_strategies", orgId];
  const { data: strategyRows, isLoading: strategiesLoading } = useQuery<StrategyRow[]>({
    queryKey: strategiesQueryKey,
    enabled:  orgId != null,
    queryFn:  async () => {
      const { data, error } = await supabase.from("ai_tax_strategies")
        .select("*").eq("org_id", orgId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data as StrategyRow[]) ?? [];
    },
  });
  const strategies = useMemo(
    () => (strategyRows ?? []).map(rowToStrategy).sort((a, b) =>
      (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
      b.savings - a.savings ||
      (b.deduction_amount ?? 0) - (a.deduction_amount ?? 0),
    ),
    [strategyRows],
  );
  const hasGenerated  = !strategiesLoading && strategies.length > 0;

  // ── Federal / state deduction rules ─────────────────────────────────────────
  const { groups: ruleGroups, rules: deductionRules } = useDeductionRuleSet();

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories_ai_deductions"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("category").select("id,name").eq("is_deleted", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subCategories = [] } = useQuery<SubCategory[]>({
    queryKey: ["sub_categories_ai_deductions"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("sub_category").select("id,name,category_id").eq("is_deleted", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Transactions for AI Strategy (month + all-time) ───────────────────────
  const { data: monthTxs = [] } = useQuery<Transaction[]>({
    queryKey: ["tx_month_strat", orgId],
    enabled:  orgId != null,
    queryFn:  async () => {
      const { data } = await supabase.from("transactions")
        .select("id,title,amount,type,date_time,description,deductible")
        .eq("org_id", orgId!).gte("date_time", startOfMonth())
        .order("date_time", { ascending: false });
      return data ?? [];
    },
  });

  const { data: allTxs = [] } = useQuery<Transaction[]>({
    queryKey: ["tx_all_strat", orgId],
    enabled:  orgId != null,
    staleTime: 2 * 60 * 1000,
    queryFn:  async () => {
      const { data } = await supabase.from("transactions")
        .select("id,title,amount,type,date_time,description,deductible")
        .eq("org_id", orgId!).order("date_time", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  // ── Deduction period transactions ─────────────────────────────────────────
  const { data: dedTxs = [], isLoading: dedLoading } = useQuery<Transaction[]>({
    queryKey: ["tx_deductions", orgId, dedPeriod, dedStart, dedEnd],
    enabled:  orgId != null && tab === "deduction",
    staleTime: 60_000,
    queryFn:  async () => {
      let query = supabase.from("transactions")
        .select("id,title,amount,type,date_time,description,deductible,category_id,sub_category_id")
        .eq("org_id", orgId!);

      if (dedPeriod === "year") {
        query = query
          .gte("date_time", `${dedStart}T00:00:00`)
          .lte("date_time", `${dedEnd}T23:59:59`);
      }

      const { data } = await query.order("date_time", { ascending: false });
      return data ?? [];
    },
  });

  // ── Derived deduction metrics ─────────────────────────────────────────────
  const allExpenses = useMemo(() => dedTxs.filter(t => t.amount < 0), [dedTxs]);
  const deductibleTxs = useMemo(() => allExpenses.filter(t => t.deductible), [allExpenses]);
  const totalExpenseAmt = useMemo(() => allExpenses.reduce((s, t) => s + Math.abs(t.amount), 0), [allExpenses]);

  // Applies the admin-configured federal/state deduction rules (percentage
  // caps, per-transaction fixed amounts, org-specific business-use %) instead
  // of assuming every flagged transaction is 100% deductible.
  const dedSummary = useMemo(
    () => summarizeDeductions(deductibleTxs, orgStateId, org ?? null, ruleGroups, deductionRules),
    [deductibleTxs, orgStateId, org, ruleGroups, deductionRules],
  );
  const perTxAmount = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of dedSummary.perTx) m.set(p.tx.id, taxType === "Federal" ? p.federal : p.state);
    return m;
  }, [dedSummary, taxType]);
  const deductionAmountForTx = useCallback(
    (t: Transaction) => perTxAmount.get(t.id) ?? 0,
    [perTxAmount],
  );

  const totalDeductibleAmt = taxType === "Federal" ? dedSummary.totalFederal : dedSummary.totalState;
  const deductionRate      = totalExpenseAmt > 0 ? (totalDeductibleAmt / totalExpenseAmt) * 100 : 0;
  const labelForDeductionTx = useCallback(
    (t: Transaction) => categoryLabelFor(t, categories, subCategories),
    [categories, subCategories],
  );
  // All transactions (income + expense) remain visible in the breakdown table.
  const allTxsAmt = useMemo(() => dedTxs.reduce((s, t) => s + Math.abs(t.amount), 0), [dedTxs]);
  const tableGroups = useMemo(() => {
    const map = new Map<string, { txs: Transaction[]; totalAmt: number; dedAmt: number }>();
    for (const t of dedTxs) {
      const key = labelForDeductionTx(t);
      if (!map.has(key)) map.set(key, { txs: [], totalAmt: 0, dedAmt: 0 });
      const g = map.get(key)!;
      g.txs.push(t);
      g.totalAmt += Math.abs(t.amount);
      if (t.deductible) g.dedAmt += deductionAmountForTx(t);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].totalAmt - a[1].totalAmt)
      .map(([label, data], i) => ({
        label, txs: data.txs,
        totalAmt: data.totalAmt,
        dedAmt: data.dedAmt,
        deductionRate: data.totalAmt > 0 ? (data.dedAmt / data.totalAmt) * 100 : 0,
        count: data.txs.length,
        color: PIE_COLORS[i % PIE_COLORS.length],
      }));
  }, [dedTxs, deductionAmountForTx, labelForDeductionTx]);
  const deductionChartGroups = useMemo(
    () => tableGroups.filter(group => group.dedAmt > 0),
    [tableGroups],
  );

  // ── AI Strategy derived ────────────────────────────────────────────────────
  const income         = monthTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses       = Math.abs(monthTxs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
  const netProfit      = income - expenses;
  const totalSavings   = strategies.reduce((s, st) => s + (st.savings ?? 0), 0);
  const totalAdditionalDeductions = strategies.reduce((s, st) => s + (st.deduction_amount ?? 0), 0);

  // ── Business Survey summary for AI prompt ──────────────────────────────────
  const surveyProfile = useMemo(() => buildSurveyProfile(org), [org]);

  // ── Generate AI strategies ─────────────────────────────────────────────────
  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      if (!surveyProfile.trim() && allTxs.length === 0) {
        toast({
          title: "More information needed",
          description: "Complete the business survey or add transactions before generating a personalized strategy.",
          variant: "destructive",
        });
        return;
      }

      const { data: preSession } = await supabase.auth.getSession();
      const preToken = preSession.session?.access_token;
      const checkRes = await fetch("/api/plan-limits/check-ai-strategy", {
        method: "POST",
        headers: { ...(preToken ? { Authorization: `Bearer ${preToken}` } : {}) },
      });
      if (!checkRes.ok) {
        const body = await checkRes.json().catch(() => ({}));
        toast({
          title: "Limit reached",
          description: body?.message ?? "You've reached your plan's monthly AI tax strategy limit. Upgrade to generate more.",
          variant: "destructive",
        });
        setGenerating(false);
        return;
      }

      const sourceEntries = [
        { id: "FIN-1", fact: `Monthly income: $${income.toFixed(2)}` },
        { id: "FIN-2", fact: `Monthly expenses: $${expenses.toFixed(2)}` },
        { id: "FIN-3", fact: `Net profit (month): $${netProfit.toFixed(2)}` },
        { id: "FIN-4", fact: `Annualized income (estimate): $${(income * 12).toFixed(2)}` },
        { id: "FIN-5", fact: `Total transactions analyzed: ${allTxs.length}` },
        ...surveyProfile.split("\n").map((fact, index) => ({
          id: `PROFILE-${index + 1}`,
          fact: fact.replace(/^-\s*/, "").trim(),
        })).filter(entry => entry.fact),
        ...allTxs.slice(0, 40).map((tx, index) => ({
          id: `TX-${index + 1}`,
          fact: `${tx.date_time.split("T")[0]} | ${tx.title} | ${tx.amount >= 0 ? "+" : "-"}$${Math.abs(tx.amount).toFixed(2)}`,
        })),
      ];
      const sourceById = new Map(sourceEntries.map(entry => [entry.id, entry.fact]));
      const sourceData = sourceEntries.map(entry => `${entry.id}: ${entry.fact}`).join("\n");

      const prompt = `You are an expert US tax strategist for freelancers and small businesses.

STRICT GROUNDING REQUIREMENT:
- Recommend a strategy ONLY when it is directly supported by one or more facts in USER-SUPPLIED DATA below.
- Never assume or invent an entity type, election, employee count, age, dependents, tax bracket, location, ownership structure, account, asset, expense, income source, or personal circumstance.
- A merely possible strategy is not enough. Omit it unless the supplied facts make it relevant.
- Cite every supporting fact by its exact source ID in source_facts. Every strategy must contain at least one valid source ID.
- Every personalized statement in the title, description, action steps, and calculation must be traceable to source_facts. Tax-law explanations may be general, but must be written conditionally unless the user's facts confirm eligibility.
- Return up to 6 distinct strategy opportunities grounded in the supplied user data. Do not invent an opportunity merely to reach six.
- For supported opportunities that need more user information before an amount can be calculated, return deduction_amount=0 and savings=0, explain what information is missing in the description, and provide a calculation object with empty user_data_inputs, formula="Insufficient user data", deduction_amount=0, and result=0.
- Consider recorded business expenses, vehicle use, home office, retirement planning, health insurance, entity/QBI/estimated-tax planning, and recordkeeping, but include an area only when the supplied facts support it.
- Every non-zero savings amount must have a calculation whose numeric user_data_inputs cite the exact user-data source IDs that support them. Derived inputs are allowed only when the formula explains how they were derived from those cited facts.
- calculation.result must equal savings. Use 0 when the user data is insufficient for a defensible calculation; never invent an amount, balance, contribution, expense, tax rate, or tax bracket.

USER-SUPPLIED DATA (each fact has a stable source ID):
${sourceData}

Generate only the specific US tax-saving strategies justified by the data above.

Respond ONLY with valid JSON in exactly this format — no markdown, no explanation:
{
  "strategies": [
    {
      "title": "Strategy Name",
      "deduction_amount": 10000,
      "savings": 2500,
      "description": "One concise sentence tied to the cited user facts; identify missing information when savings is zero.",
      "difficulty": "Easy",
      "status": "Recommended",
      "action_steps": ["One short next step", "Optional second short step"],
      "source_facts": ["FIN-1"],
      "calculation": {
        "user_data_inputs": [
          {
            "label": "Name of input",
            "value": 10000,
            "source_fact": "the exact source ID containing or supporting this value, such as FIN-1"
          }
        ],
        "formula": "A plain-language arithmetic explanation using only the listed inputs",
        "deduction_amount": 10000,
        "result": 2500
      }
    }
  ]
}

Rules:
- difficulty must be exactly "Easy", "Medium", or "Hard"
- status must be exactly "Recommended", "Action Required", or "New"
- savings is an integer (USD, no symbols)
- deduction_amount is an integer derived from the cited user inputs and must equal calculation.deduction_amount
- Return between 1 and 6 distinct strategies; prefer 6 only when all 6 are supported
- Every source_facts and calculation.user_data_inputs source_fact must be an exact source ID from USER-SUPPLIED DATA
- calculation.result must exactly equal savings
- If savings is greater than 0, calculation.user_data_inputs and formula must not be empty`;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch("/api/openai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ model: "openai/gpt-4o-mini", max_tokens: 3500, messages: [{ role: "user", content: prompt }] }),
      });

      if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
      const aiData = await res.json() as { choices?: { message?: { content?: string } }[] };
      const content = aiData.choices?.[0]?.message?.content ?? "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not parse AI response — unexpected format");
      const parsed = JSON.parse(jsonMatch[0]) as { strategies: Strategy[] };
      if (!Array.isArray(parsed.strategies) || parsed.strategies.length === 0) throw new Error("AI returned no strategies");
      const hasGroundedSources = (strategy: Strategy) =>
        Array.isArray(strategy.source_facts) &&
        strategy.source_facts.length > 0 &&
        strategy.source_facts.every(fact => typeof fact === "string" && sourceById.has(fact.trim()));
      const hasValidCalculation = (strategy: Strategy) => {
        if (!Number.isInteger(strategy.savings) || strategy.savings < 0) return false;
        if (!Number.isInteger(strategy.deduction_amount) || strategy.deduction_amount! < 0) return false;
        const calculation = strategy.calculation;
        if (
          !calculation ||
          !Number.isFinite(calculation.result) ||
          Math.round(calculation.result) !== strategy.savings ||
          !Number.isFinite(calculation.deduction_amount) ||
          Math.round(calculation.deduction_amount) !== strategy.deduction_amount ||
          typeof calculation.formula !== "string"
        ) return false;
        if (strategy.savings === 0) return true;
        if (!calculation.formula.trim() || !Array.isArray(calculation.user_data_inputs) || calculation.user_data_inputs.length === 0) return false;
        return calculation.user_data_inputs.every(input =>
          !!input &&
          typeof input.label === "string" &&
            !!input.label.trim() &&
            Number.isFinite(input.value) &&
            typeof input.source_fact === "string" &&
            sourceById.has(input.source_fact.trim()),
        );
      };
      const groundedStrategies = parsed.strategies
        .filter(strategy => hasGroundedSources(strategy) && hasValidCalculation(strategy))
        .slice(0, 6);
      if (groundedStrategies.length === 0) throw new Error("AI did not return any strategies supported by this user's data");
      const excludedCount = parsed.strategies.length - groundedStrategies.length;

      if (orgId == null || !authUid) throw new Error("Missing organization or user — cannot save strategies");

      // Persist to Supabase so strategies survive refresh/navigation.
      // Replace any previously generated strategies for this org.
      const { error: delError } = await supabase.from("ai_tax_strategies").delete().eq("org_id", orgId);
      if (delError) throw delError;

      const rankedStrategies = [...groundedStrategies]
        .sort((a, b) => b.savings - a.savings || (b.deduction_amount ?? 0) - (a.deduction_amount ?? 0))
        .map((strategy, index) => ({ ...strategy, rank: index + 1 }));
      const rowsToInsert = rankedStrategies.map(s => ({
        user_id: authUid,
        org_id: orgId,
        title: s.title,
        summary: s.description,
        category: "General",
        estimated_savings: s.savings ?? 0,
        risk_level: riskFromDifficulty(s.difficulty),
        audit_risk: auditRiskFromStatus(s.status),
        implementation_steps: s.action_steps ?? [],
        tags: [],
        ai_context: JSON.stringify({
          generated_from_transactions: allTxs.length,
          monthly_net_profit: netProfit,
          source_facts: s.source_facts?.map(sourceId => ({
            source_id: sourceId,
            fact: sourceById.get(sourceId) ?? "",
          })),
          calculation: s.calculation,
          deduction_amount: s.deduction_amount,
          rank: s.rank,
        }),
      }));

      const { error: insError } = await supabase.from("ai_tax_strategies").insert(rowsToInsert);
      if (insError) throw insError;

      await queryClient.invalidateQueries({ queryKey: strategiesQueryKey });
      toast({
        title: "Strategies updated!",
        description: `${rankedStrategies.length} supported strategies generated and ranked.${excludedCount > 0 ? ` ${excludedCount} unsupported candidate${excludedCount === 1 ? " was" : "s were"} excluded.` : ""}`,
      });
    } catch (err) {
      toast({ title: "Failed to generate strategies", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }, [allTxs, income, expenses, netProfit, surveyProfile, toast, orgId, authUid, queryClient, strategiesQueryKey]);

  // ── Derived: deduction optimization score ────────────────────────────────
  const monthExpenseAmount = monthTxs
    .filter(tx => tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const monthDeductibleAmount = monthTxs
    .filter(tx => tx.amount < 0 && tx.deductible)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const optimizationScore = monthExpenseAmount > 0
    ? Math.min(100, Math.round((monthDeductibleAmount / monthExpenseAmount) * 100))
    : 0;
  const notUtilized = 100 - optimizationScore;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ background: "hsl(var(--background))", minHeight: "100%" }}>

      {/* ── Tab bar ── */}
      <div className="grid grid-cols-2 border-b border-border bg-[#061b3d]">
        {([["strategy", "AI Strategy"], ["deduction", "AI Deduction"]] as [TabKey, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`w-full px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${
              tab === key
                ? "border-[#FFC72B] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════ AI STRATEGY TAB ══════════════ */}
      {tab === "strategy" && (
        <div className="space-y-0">

          {/* ── Deduction Optimization Level gauge ── */}
          <div className="py-6 flex flex-col items-center border-b border-border" style={{ background: "linear-gradient(180deg, hsl(var(--muted)), hsl(var(--background)))" }}>
            <p className="text-sm font-semibold text-foreground mb-4">Deduction Optimization Level</p>
            {/* SVG Semi-circle gauge */}
            <div className="relative w-full max-w-[180px]">
              <svg className="h-auto w-full" viewBox="0 0 180 100">
                {/* Track */}
                <path d="M 15 90 A 75 75 0 0 1 165 90" fill="none" stroke="hsl(var(--border))" strokeWidth="14" strokeLinecap="round" />
                {/* Score arc */}
                <path d="M 15 90 A 75 75 0 0 1 165 90" fill="none"
                  stroke={optimizationScore > 70 ? "#22c55e" : optimizationScore > 40 ? "#FFC72B" : "#fb7185"}
                  strokeWidth="14" strokeLinecap="round"
                  pathLength="100"
                  strokeDasharray={`${optimizationScore} 100`}
                  strokeDashoffset="0"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
                <p className="text-2xl font-bold text-foreground">{optimizationScore}%</p>
                <p className="text-[9px] text-muted-foreground text-center leading-tight max-w-[90px]">
                  {notUtilized}% of deductions<br />not yet utilized
                </p>
              </div>
            </div>
          </div>

          {/* ── Two stat pills ── */}
          <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
            <div className="px-8 py-5 text-center">
              <p className="text-xs text-muted-foreground mb-1">Additional Deductions Found</p>
              <p className="text-lg font-bold text-[#FFC72B]">
                {hasGenerated ? fmt(totalAdditionalDeductions) : "$ ---"}
              </p>
            </div>
            <div className="px-8 py-5 text-center">
              <p className="text-xs text-muted-foreground mb-1">Potential Tax Savings</p>
              <p className="text-lg font-bold text-[#22c55e]">
                {hasGenerated && totalSavings > 0 ? fmt(totalSavings) : "$ ---"}
              </p>
            </div>
          </div>

          {/* ── Tax Strategies & Insights ── */}
          <div className="px-6 pt-5 pb-4 space-y-5">
            <h2 className="text-base font-semibold text-foreground">Tax Strategies &amp; Insights</h2>

            {/* Generate button — centered */}
            <div className="flex justify-center">
              <button
                onClick={generate}
                disabled={generating}
                className="flex items-center gap-2 px-8 py-2.5 rounded-lg font-semibold text-sm transition-all"
                style={{ background: "#FFC72B", color: "#020E2C" }}
              >
                {generating
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</>
                  : <><Zap className="h-4 w-4" /> Generate Strategies</>}
              </button>
            </div>

            {/* Loading state */}
            {generating && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#FFC72B]" />
                <p className="text-sm text-muted-foreground">AI is reviewing {allTxs.length} transaction{allTxs.length !== 1 ? "s" : ""}…</p>
              </div>
            )}

            {/* No strategies yet */}
            {!hasGenerated && !generating && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Sparkles className="h-10 w-10 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">Click Generate Strategies to get personalized tax-saving insights.</p>
              </div>
            )}

            {hasGenerated && !generating && strategies.length > 0 && (
              <div className="space-y-5">

                {/* ── Top 3 feature cards ── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {strategies.slice(0, 3).map((s, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-border p-4 flex flex-col gap-3"
                      style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}
                    >
                      <span className="w-fit text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFC72B] text-[#020E2C]">
                        Rank #{s.rank ?? i + 1}
                      </span>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-foreground leading-snug">{s.title}</p>
                        <span className="text-lg font-bold text-[#FFC72B] flex-shrink-0">{fmt(s.savings)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{s.description}</p>
                      <div className="flex items-center gap-2 mt-auto">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>General</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{
                          background: s.difficulty === "Easy" ? "rgba(34,197,94,0.15)" : s.difficulty === "Hard" ? "rgba(239,68,68,0.15)" : "rgba(234,179,8,0.15)",
                          color: s.difficulty === "Easy" ? "#22c55e" : s.difficulty === "Hard" ? "#f87171" : "#ca8a04",
                        }}>{s.difficulty}</span>
                        <button
                          onClick={() => { setSelectedStrategy(s); setAskMessages([]); setAskInput(""); }}
                          className="ml-auto text-[10px] font-semibold px-2.5 py-1 rounded transition-colors"
                          style={{ background: "hsl(var(--muted))", color: "#FFC72B", border: "1px solid rgba(255,199,43,0.3)" }}
                        >
                          Ask BookSmart AI
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Remaining strategies as flat list ── */}
                {strategies.length > 3 && (
                  <div className="space-y-2">
                    {strategies.slice(3).map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-4 rounded-xl border border-border px-5 py-4"
                        style={{ background: "linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)))" }}
                      >
                        <span className="text-xs font-bold text-[#FFC72B] flex-shrink-0">
                          #{s.rank ?? i + 4}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground">{s.title}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{s.description}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>General</span>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{
                              background: s.difficulty === "Easy" ? "rgba(34,197,94,0.15)" : s.difficulty === "Hard" ? "rgba(239,68,68,0.15)" : "rgba(234,179,8,0.15)",
                              color: s.difficulty === "Easy" ? "#22c55e" : s.difficulty === "Hard" ? "#f87171" : "#ca8a04",
                            }}>{s.difficulty}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <span className="text-lg font-bold text-[#FFC72B]">{fmt(s.savings)}</span>
                          <button
                            onClick={() => { setSelectedStrategy(s); setAskMessages([]); setAskInput(""); }}
                            className="text-[10px] font-semibold px-3 py-1.5 rounded transition-colors"
                            style={{ background: "hsl(var(--muted))", color: "#FFC72B", border: "1px solid rgba(255,199,43,0.3)" }}
                          >
                            Ask BookSmart AI
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ AI DEDUCTION TAB ══════════════ */}
      {tab === "deduction" && (
        <div className="p-6 space-y-5">

          {/* ── Header row ── */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">AI Deductions</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Review AI-identified deductions and their impact on your taxes.</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center rounded-lg border border-border bg-muted p-1 text-xs text-foreground">
                <button
                  type="button"
                  onClick={() => setDedPeriod("year")}
                  className={`rounded-md px-3 py-1.5 transition-colors ${dedPeriod === "year" ? "bg-[#FFC72B] text-black" : "text-muted-foreground hover:text-foreground"}`}
                >
                  This Year
                </button>
                <button
                  type="button"
                  onClick={() => setDedPeriod("all")}
                  className={`rounded-md px-3 py-1.5 transition-colors ${dedPeriod === "all" ? "bg-[#FFC72B] text-black" : "text-muted-foreground hover:text-foreground"}`}
                >
                  All Time
                </button>
              </div>
              {/* Date range pill */}
              <div className={`flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground ${dedPeriod === "all" ? "opacity-60" : ""}`}>
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <input type="date" value={dedStart} onChange={e => { setDedPeriod("year"); setDedStart(e.target.value); }}
                  className="bg-transparent focus:outline-none text-xs w-[96px]" />
                <span className="text-muted-foreground">-</span>
                <input type="date" value={dedEnd} onChange={e => { setDedPeriod("year"); setDedEnd(e.target.value); }}
                  className="bg-transparent focus:outline-none text-xs w-[96px]" />
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              {/* Tax type */}
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground">
                <select value={taxType} onChange={e => setTaxType(e.target.value as TaxType)}
                  className="bg-transparent focus:outline-none text-xs appearance-none cursor-pointer">
                  <option value="Federal">Federal</option>
                  <option value="State">State</option>
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1 pointer-events-none" />
              </div>
            </div>
          </div>

          {dedLoading ? (
            <div className="flex items-center justify-center py-20 gap-3">
              <Loader2 className="h-6 w-6 text-[#FFC72B] animate-spin" />
              <span className="text-muted-foreground">Loading deductions…</span>
            </div>
          ) : (
            <>
              {/* ── Main row: big chart card + 2×2 stats ── */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)] gap-4">

                {/* Donut chart card — chart left, legend right */}
                <div className="rounded-xl border border-border p-5 md:p-6 min-h-[356px]" style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}>
                  <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                    Deductions by Category
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </p>
                  {deductionChartGroups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                      <TrendingDown className="h-10 w-10 text-muted-foreground/60" />
                      <p className="text-sm text-muted-foreground">No eligible deductions in this period.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col xl:flex-row xl:items-center gap-6 xl:gap-8">
                      {/* Donut — left side */}
                      <div className="relative mx-auto aspect-square w-full max-w-[330px] flex-shrink-0 xl:mx-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={deductionChartGroups} dataKey="dedAmt" nameKey="label"
                              cx="50%" cy="50%" outerRadius={154} innerRadius={94} paddingAngle={2}>
                              {deductionChartGroups.map((g) => <Cell key={g.label} fill={g.color} />)}
                            </Pie>
                            <Tooltip formatter={(v: number) => [fmt(v), "Eligible deduction"]}
                              contentStyle={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                          </PieChart>
                        </ResponsiveContainer>
                        {/* Center label */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <p className="text-[10px] text-muted-foreground leading-tight text-center">Total Deductions</p>
                          <p className="text-lg font-bold text-foreground mt-1">{fmt(totalDeductibleAmt)}</p>
                        </div>
                      </div>

                      {/* Legend — right side */}
                      <div className="w-full max-w-[560px] min-w-0 space-y-3 xl:pr-1">
                        {deductionChartGroups.map(g => (
                          <div key={g.label} className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-4">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                              <span className="text-xs text-foreground/90 truncate">{g.label}</span>
                            </div>
                            <span className="text-xs font-semibold text-foreground text-right">
                              {fmt(g.dedAmt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2×2 stat cards */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    {
                      label: "Total Activity",
                      value: fmt(allTxsAmt),
                      sub: `${dedTxs.length} income and expense transaction${dedTxs.length === 1 ? "" : "s"}`,
                      icon: <DollarSign className="h-4 w-4" style={{ color: "#60a5fa" }} />,
                      iconBg: "#60a5fa18",
                      subColor: "hsl(var(--muted-foreground))",
                    },
                    {
                      label: "Total Expenses",
                      value: fmt(totalExpenseAmt),
                      sub: `${allExpenses.length} expense transaction${allExpenses.length === 1 ? "" : "s"}`,
                      icon: <Hash className="h-4 w-4" style={{ color: "#f59e0b" }} />,
                      iconBg: "#f59e0b18",
                      subColor: "hsl(var(--muted-foreground))",
                    },
                    {
                      label: "Eligible Deductions",
                      value: fmt(totalDeductibleAmt),
                      sub: `${deductibleTxs.length} expense${deductibleTxs.length === 1 ? "" : "s"} flagged as deductible`,
                      icon: <TrendingDown className="h-4 w-4" style={{ color: "#22c55e" }} />,
                      iconBg: "#22c55e18",
                      subColor: "#22c55e",
                    },
                    {
                      label: "Expense Deduction Rate",
                      value: `${deductionRate.toFixed(2)}%`,
                      sub: "Eligible deductions ÷ total expenses",
                      icon: <Percent className="h-4 w-4" style={{ color: "#a78bfa" }} />,
                      iconBg: "#a78bfa18",
                      subColor: "hsl(var(--muted-foreground))",
                    },
                  ].map(({ label, value, sub, icon, iconBg, subColor }) => (
                    <div key={label} className="rounded-xl border border-border p-5 min-h-[170px] flex flex-col items-center justify-center text-center gap-3"
                      style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}>
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
                          {icon}
                        </div>
                        <span className="text-xs text-muted-foreground font-semibold leading-tight">{label}</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{value}</p>
                      <p className="text-xs" style={{ color: subColor }}>{sub}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Deductions Breakdown table ── */}
              <div>
                <div className="mb-3">
                  <p className="text-sm font-bold text-foreground">Transaction &amp; Deduction Breakdown</p>
                  <p className="text-xs text-muted-foreground">Activity includes income and expenses; deductions include eligible expenses only.</p>
                </div>

                {tableGroups.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground border border-border/60 rounded-xl" style={{ background: "hsl(var(--muted))" }}>
                    No transactions available in this period.
                  </div>
                ) : (
                  <>
                  <div className="space-y-3 sm:hidden">
                    {tableGroups.map(group => {
                      const isOpen = expandedGroup === group.label;
                      return (
                        <div key={group.label} className="min-w-0 overflow-hidden rounded-xl border border-border" style={{ background: "hsl(var(--card))" }}>
                          <button
                            onClick={() => setExpandedGroup(isOpen ? null : group.label)}
                            className="flex min-h-11 w-full min-w-0 items-start justify-between gap-3 p-3 text-left"
                          >
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: group.color }} />
                                <span className="min-w-0 break-words text-sm font-semibold text-foreground">{group.label}</span>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                <span className="text-muted-foreground">Activity</span><span className="text-right font-medium">{fmt(group.totalAmt)}</span>
                                <span className="text-muted-foreground">Eligible deduction</span><span className="text-right font-medium">{group.dedAmt > 0 ? fmt(group.dedAmt) : "—"}</span>
                                <span className="text-muted-foreground">Deduction rate</span><span className="text-right">{group.deductionRate > 0 ? `${group.deductionRate.toFixed(1)}%` : "—"}</span>
                                <span className="text-muted-foreground">Transactions</span><span className="text-right">{group.count}</span>
                              </div>
                            </div>
                            <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </button>
                          {isOpen && (
                            <div className="space-y-2 border-t border-border/50 p-3" style={{ background: "hsl(var(--background))" }}>
                              {group.txs.map(t => (
                                <div key={t.id} className="min-w-0 rounded-lg border border-border/50 p-3 text-xs">
                                  <p className="break-words font-medium text-foreground">{t.title}</p>
                                  <p className="mt-1 text-muted-foreground">{new Date(t.date_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                                  <div className="mt-2 flex items-center justify-between gap-3">
                                    <span>{fmt(Math.abs(t.amount))}</span>
                                    <span className="font-semibold text-[#22c55e]">{t.deductible && deductionAmountForTx(t) > 0 ? fmt(deductionAmountForTx(t)) : "—"}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="hidden overflow-x-auto rounded-xl border border-border sm:block" style={{ background: "hsl(var(--card))" }}>
                    <div className="min-w-[760px]">
                    {/* Table header */}
                    <div className="grid text-[10px] text-muted-foreground font-semibold uppercase tracking-wider px-4 py-2.5 border-b border-border/60"
                      style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto" }}>
                      <span>Category</span>
                      <span>Activity</span>
                      <span>Eligible Deduction</span>
                      <span>Expense Deduction Rate</span>
                      <span>Transactions</span>
                      <span>Action</span>
                    </div>

                    {/* Table rows */}
                    {tableGroups.map(group => {
                      const isOpen = expandedGroup === group.label;
                      return (
                        <div key={group.label} className="border-b border-border/50 last:border-b-0">
                          <button
                            onClick={() => setExpandedGroup(isOpen ? null : group.label)}
                            className="w-full grid items-center px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                            style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto" }}>
                            {/* Category */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: group.color }} />
                              <span className="text-sm font-semibold text-foreground truncate">{group.label}</span>
                            </div>
                            {/* Total */}
                            <span className="text-sm text-foreground/90">{fmt(group.totalAmt)}</span>
                            {/* Deductions */}
                            <span className="text-sm text-foreground/90">{group.dedAmt > 0 ? fmt(group.dedAmt) : "—"}</span>
                            {/* Deduction Rate */}
                            <span className="text-sm text-muted-foreground">{group.deductionRate > 0 ? `${group.deductionRate.toFixed(1)}%` : "—"}</span>
                            {/* Transactions */}
                            <span className="text-sm text-foreground/90">{group.count}</span>
                            {/* Action */}
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </button>

                          {/* Expanded transactions */}
                          {isOpen && (
                            <div className="border-t border-border/50 px-4 py-2 space-y-1" style={{ background: "hsl(var(--background))" }}>
                              {group.txs.map(t => (
                                <div key={t.id} className="grid items-center py-2 text-xs"
                                  style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto" }}>
                                  <div className="min-w-0 pl-4">
                                    <p className="font-medium text-foreground truncate">{t.title}</p>
                                    <p className="text-muted-foreground">{new Date(t.date_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                                  </div>
                                  <span className="text-foreground/90">{fmt(Math.abs(t.amount))}</span>
                                  <span className="text-[#22c55e] font-semibold">
                                    {t.deductible && deductionAmountForTx(t) > 0 ? fmt(deductionAmountForTx(t)) : "—"}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {t.deductible && Math.abs(t.amount) > 0
                                      ? `${((deductionAmountForTx(t)) / Math.abs(t.amount) * 100).toFixed(1)}%`
                                      : "—"}
                                  </span>
                                  <span className="text-foreground/90">1</span>
                                  <span />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Ask BookSmart AI dialog ── */}
      <Dialog open={!!selectedStrategy} onOpenChange={open => { if (!open) { setSelectedStrategy(null); setAskMessages([]); setAskInput(""); } }}>
        {selectedStrategy && (
          <DialogContent className="max-w-md p-0 overflow-hidden [&>button]:hidden" style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", borderRadius: 16 }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <DialogTitle className="text-base font-semibold text-foreground pr-4">{selectedStrategy.title}</DialogTitle>
              <button onClick={() => { setSelectedStrategy(null); setAskMessages([]); setAskInput(""); }}
                className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
                style={{ border: "1.5px solid hsl(var(--border))" }}>
                ✕
              </button>
            </div>
            <DialogDescription className="sr-only">Ask BookSmart AI about {selectedStrategy.title}</DialogDescription>

            {/* Chat body */}
            <div className="px-5 flex flex-col gap-3 min-h-[260px] max-h-[360px] overflow-y-auto">
              {askMessages.length === 0 ? (
                /* Empty state — building icon */
                <div className="flex flex-col items-center justify-center flex-1 py-10 gap-3 text-center">
                  <div className="h-14 w-14 rounded-xl flex items-center justify-center" style={{ background: "hsl(var(--muted))" }}>
                    <Building2 className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ask anything about</p>
                    <p className="text-sm font-semibold text-foreground">"{selectedStrategy.title}"</p>
                  </div>
                </div>
              ) : (
                askMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
                      style={{
                        background: m.role === "user" ? "#FFC72B" : "hsl(var(--muted))",
                        color: m.role === "user" ? "#020E2C" : "hsl(var(--foreground))",
                      }}
                    >
                      {m.content}
                    </div>
                  </div>
                ))
              )}
              {askLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-4 py-2.5" style={{ background: "hsl(var(--muted))" }}>
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="px-4 pb-4 pt-3 border-t border-border">
              <div className="flex items-center gap-2 rounded-xl px-4 py-2" style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
                <input
                  type="text"
                  value={askInput}
                  onChange={e => setAskInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendAskMessage(selectedStrategy)}
                  placeholder="Ask about this strategy…"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <button
                  onClick={() => sendAskMessage(selectedStrategy)}
                  disabled={!askInput.trim() || askLoading}
                  className="h-8 w-8 rounded-full flex items-center justify-center transition-all flex-shrink-0"
                  style={{ background: askInput.trim() ? "#FFC72B" : "hsl(var(--muted))" }}
                >
                  <Send className="h-3.5 w-3.5" style={{ color: askInput.trim() ? "hsl(var(--background))" : "hsl(var(--muted-foreground))" }} />
                </button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
