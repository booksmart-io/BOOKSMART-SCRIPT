import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useDeductionRuleSet, summarizeDeductions, type OrgRow } from "@/lib/deduction-engine";
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

type Strategy = {
  title: string; description: string; savings: number;
  difficulty: Difficulty; status: Status; action_steps?: string[];
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
  sub_category_id?: number | null;
};

type DeductionGroup = {
  label: string; totalAmount: number; count: number;
  txs: Transaction[]; color: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
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

  const debts = org.debts as Record<string, number> | null | undefined;
  if (debts && typeof debts === "object") {
    const debtEntries = Object.entries(debts).filter(([, v]) => typeof v === "number" && v > 0);
    if (debtEntries.length) {
      const debtStr = debtEntries.map(([k, v]) => `${k.replace(/_/g, " ")}: $${v.toFixed(0)}`).join(", ");
      lines.push(`- Outstanding business debts: ${debtStr}`);
    }
  }

  return lines.join("\n");
}

function rowToStrategy(row: StrategyRow): Strategy {
  return {
    title: row.title,
    description: row.summary ?? "",
    savings: row.estimated_savings ?? 0,
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

function groupDeductions(txs: Transaction[], amountFor: (t: Transaction) => number): DeductionGroup[] {
  const map = new Map<string, { txs: Transaction[]; total: number }>();
  for (const t of txs) {
    const key = t.description?.trim() || t.type?.trim() || "Other";
    if (!map.has(key)) map.set(key, { txs: [], total: 0 });
    const g = map.get(key)!;
    g.txs.push(t);
    g.total += amountFor(t);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([label, data], i) => ({
      label, totalAmount: data.total, count: data.txs.length,
      txs: data.txs, color: PIE_COLORS[i % PIE_COLORS.length],
    }));
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AiStrategy() {
  const { profile } = useAuth();
  const { toast }   = useToast();
  const queryClient = useQueryClient();
  const numericId   = profile?.numericId ?? null;
  const authUid     = profile?.id ?? null;

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
  const [dedStart, setDedStart]           = useState(`${curYear}-01-01`);
  const [dedEnd, setDedEnd]               = useState(`${curYear}-12-31`);
  const [taxType, setTaxType]             = useState<TaxType>("Federal");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // ── Org lookup ────────────────────────────────────────────────────────────
  const { data: org } = useQuery<OrgRow | null>({
    queryKey: ["user_org_strat", numericId],
    enabled:  numericId !== null,
    staleTime: 5 * 60 * 1000,
    queryFn:  async () => {
      const { data } = await supabase.from("organizations").select("*")
        .eq("owner_id", numericId!).limit(1).maybeSingle();
      return (data as OrgRow | null) ?? null;
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
  const strategies    = useMemo(() => (strategyRows ?? []).map(rowToStrategy), [strategyRows]);
  const hasGenerated  = !strategiesLoading && strategies.length > 0;

  // ── Federal / state deduction rules ─────────────────────────────────────────
  const { groups: ruleGroups, rules: deductionRules } = useDeductionRuleSet();

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
    queryKey: ["tx_deductions", orgId, dedStart, dedEnd],
    enabled:  orgId != null && tab === "deduction",
    staleTime: 60_000,
    queryFn:  async () => {
      const { data } = await supabase.from("transactions")
        .select("id,title,amount,type,date_time,description,deductible,sub_category_id")
        .eq("org_id", orgId!)
        .gte("date_time", `${dedStart}T00:00:00`)
        .lte("date_time", `${dedEnd}T23:59:59`)
        .order("date_time", { ascending: false });
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

  const totalDeductibleAmt = taxType === "Federal" ? dedSummary.totalFederal : dedSummary.totalState;
  const deductionRate      = totalExpenseAmt > 0 ? (totalDeductibleAmt / totalExpenseAmt) * 100 : 0;
  const groups = useMemo(
    () => groupDeductions(deductibleTxs, (t) => perTxAmount.get(t.id) ?? Math.abs(t.amount)),
    [deductibleTxs, perTxAmount],
  );

  // All transactions (income + expense) grouped by category for the table + donut
  const allTxsAmt = useMemo(() => dedTxs.reduce((s, t) => s + Math.abs(t.amount), 0), [dedTxs]);
  const tableGroups = useMemo(() => {
    const map = new Map<string, { txs: Transaction[]; totalAmt: number; dedAmt: number }>();
    for (const t of dedTxs) {
      const key = t.description?.trim() || t.type?.trim() || "Other";
      if (!map.has(key)) map.set(key, { txs: [], totalAmt: 0, dedAmt: 0 });
      const g = map.get(key)!;
      g.txs.push(t);
      g.totalAmt += Math.abs(t.amount);
      if (t.deductible) g.dedAmt += perTxAmount.get(t.id) ?? Math.abs(t.amount);
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
  }, [dedTxs, perTxAmount]);

  // ── AI Strategy derived ────────────────────────────────────────────────────
  const income         = monthTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses       = Math.abs(monthTxs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
  const netProfit      = income - expenses;
  const totalSavings   = strategies.reduce((s, st) => s + (st.savings ?? 0), 0);

  // ── Business Survey summary for AI prompt ──────────────────────────────────
  const surveyProfile = useMemo(() => buildSurveyProfile(org), [org]);

  // ── Generate AI strategies ─────────────────────────────────────────────────
  const generate = useCallback(async () => {
    setGenerating(true);
    try {
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

      const txLines = allTxs.slice(0, 40)
        .map(t => `${t.date_time.split("T")[0]}: ${t.title} ${t.amount >= 0 ? "+" : ""}$${Math.abs(t.amount).toFixed(2)}`)
        .join("\n");

      const prompt = `You are an expert US tax strategist for freelancers and small businesses. Analyze the following financial data and generate personalized, actionable tax-saving strategies.

FINANCIAL SUMMARY:
- Monthly income: $${income.toFixed(2)}
- Monthly expenses: $${expenses.toFixed(2)}
- Net profit (month): $${netProfit.toFixed(2)}
- Annualized income (estimate): $${(income * 12).toFixed(2)}
- Total transactions analyzed: ${allTxs.length}

BUSINESS PROFILE (from onboarding survey):
${surveyProfile || "(No business survey completed yet — provide general freelancer/SMB strategies)"}

RECENT TRANSACTIONS (last 40):
${txLines || "(No transaction data available yet — provide general freelancer/SMB strategies)"}

INSTRUCTIONS:
Generate 5 specific US tax-saving strategies tailored to this business profile. Consider deductions, entity structure, retirement accounts, QBI, self-employment tax, home office, vehicle, health insurance, etc. based on the income level, business profile, and transaction patterns. Directly reference relevant business-profile details (filing status, vehicle/home-office setup, retirement accounts, debts, tax goal, etc.) in your explanations whenever they are provided.

Respond ONLY with valid JSON in exactly this format — no markdown, no explanation:
{
  "strategies": [
    {
      "title": "Strategy Name",
      "savings": 2500,
      "description": "Detailed explanation referencing their specific data. 2-3 sentences.",
      "difficulty": "Easy",
      "status": "Recommended",
      "action_steps": ["Step 1", "Step 2", "Step 3"]
    }
  ]
}

Rules:
- difficulty must be exactly "Easy", "Medium", or "Hard"
- status must be exactly "Recommended", "Action Required", or "New"
- savings is an integer (USD, no symbols)
- Include exactly 5 strategies`;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch("/api/openai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ model: "openai/gpt-4o-mini", messages: [{ role: "user", content: prompt }] }),
      });

      if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
      const aiData = await res.json() as { choices?: { message?: { content?: string } }[] };
      const content = aiData.choices?.[0]?.message?.content ?? "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not parse AI response — unexpected format");
      const parsed = JSON.parse(jsonMatch[0]) as { strategies: Strategy[] };
      if (!Array.isArray(parsed.strategies) || parsed.strategies.length === 0) throw new Error("AI returned no strategies");

      if (orgId == null || !authUid) throw new Error("Missing organization or user — cannot save strategies");

      // Persist to Supabase so strategies survive refresh/navigation.
      // Replace any previously generated strategies for this org.
      const { error: delError } = await supabase.from("ai_tax_strategies").delete().eq("org_id", orgId);
      if (delError) throw delError;

      const rowsToInsert = parsed.strategies.map(s => ({
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
        ai_context: `Generated from ${allTxs.length} transactions; monthly net profit $${netProfit.toFixed(2)}.`,
      }));

      const { error: insError } = await supabase.from("ai_tax_strategies").insert(rowsToInsert);
      if (insError) throw insError;

      await queryClient.invalidateQueries({ queryKey: strategiesQueryKey });
      toast({ title: "Strategies updated!", description: `${parsed.strategies.length} personalized strategies generated.` });
    } catch (err) {
      toast({ title: "Failed to generate strategies", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }, [allTxs, monthTxs, income, expenses, netProfit, toast, orgId, authUid, queryClient, strategiesQueryKey]);

  // ── Derived: deduction optimization score ────────────────────────────────
  const optimizationScore = strategies.length > 0
    ? Math.min(95, Math.max(30, Math.round(50 + (totalSavings / Math.max(income * 12, 50_000)) * 45)))
    : 0;
  const notUtilized = 100 - optimizationScore;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ background: "hsl(var(--background))", minHeight: "100%" }}>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-border">
        {([["strategy", "AI Strategy"], ["deduction", "AI Deduction"]] as [TabKey, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-6 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
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
            <div className="relative">
              <svg width="180" height="100" viewBox="0 0 180 100">
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
                {hasGenerated && totalSavings > 0 ? fmt(totalSavings * 0.3) : "$ ---"}
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
              {/* Date range pill */}
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <input type="date" value={dedStart} onChange={e => setDedStart(e.target.value)}
                  className="bg-transparent focus:outline-none text-xs w-[96px]" />
                <span className="text-muted-foreground">-</span>
                <input type="date" value={dedEnd} onChange={e => setDedEnd(e.target.value)}
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
              <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">

                {/* Donut chart card — chart left, legend right */}
                <div className="rounded-xl border border-border p-5" style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}>
                  <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5">
                    Deductions by Category
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </p>
                  {tableGroups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                      <TrendingDown className="h-10 w-10 text-muted-foreground/60" />
                      <p className="text-sm text-muted-foreground">No transactions in this period.</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      {/* Donut — left side */}
                      <div className="relative flex-shrink-0" style={{ width: 180, height: 180 }}>
                        <ResponsiveContainer width={180} height={180}>
                          <PieChart>
                            <Pie data={tableGroups} dataKey="totalAmt" nameKey="label"
                              cx="50%" cy="50%" outerRadius={85} innerRadius={52} paddingAngle={2}>
                              {tableGroups.map((g) => <Cell key={g.label} fill={g.color} />)}
                            </Pie>
                            <Tooltip formatter={(v: number) => [fmt(v), "Amount"]}
                              contentStyle={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                          </PieChart>
                        </ResponsiveContainer>
                        {/* Center label */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <p className="text-[9px] text-muted-foreground leading-tight text-center">Total Deductions</p>
                          <p className="text-sm font-bold text-foreground mt-0.5">{fmt(totalDeductibleAmt)}</p>
                        </div>
                      </div>

                      {/* Legend — right side */}
                      <div className="flex-1 min-w-0 space-y-3">
                        {tableGroups.map(g => (
                          <div key={g.label} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                              <span className="text-xs text-foreground/90 truncate">{g.label}</span>
                            </div>
                            <span className="text-xs font-semibold text-foreground flex-shrink-0">
                              {g.dedAmt > 0 ? fmt(g.dedAmt) : "$"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2×2 stat cards */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      label: "Total Amount",
                      value: fmt(allTxsAmt),
                      sub: "100% of transactions",
                      icon: <DollarSign className="h-4 w-4" style={{ color: "#60a5fa" }} />,
                      iconBg: "#60a5fa18",
                      subColor: "hsl(var(--muted-foreground))",
                    },
                    {
                      label: "Total Deductions",
                      value: fmt(totalDeductibleAmt),
                      sub: `${deductionRate.toFixed(0)}% of total amount`,
                      icon: <TrendingDown className="h-4 w-4" style={{ color: "#22c55e" }} />,
                      iconBg: "#22c55e18",
                      subColor: "#22c55e",
                    },
                    {
                      label: "Total Transactions",
                      value: dedTxs.length.toString(),
                      sub: "Across all categories",
                      icon: <Hash className="h-4 w-4" style={{ color: "#f59e0b" }} />,
                      iconBg: "#f59e0b18",
                      subColor: "hsl(var(--muted-foreground))",
                    },
                    {
                      label: "Deduction Rate",
                      value: `${deductionRate.toFixed(2)}%`,
                      sub: "Average deduction rate",
                      icon: <Percent className="h-4 w-4" style={{ color: "#a78bfa" }} />,
                      iconBg: "#a78bfa18",
                      subColor: "hsl(var(--muted-foreground))",
                    },
                  ].map(({ label, value, sub, icon, iconBg, subColor }) => (
                    <div key={label} className="rounded-xl border border-border p-4 flex flex-col gap-2"
                      style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
                          {icon}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium leading-tight">{label}</span>
                      </div>
                      <p className="text-xl font-bold text-foreground">{value}</p>
                      <p className="text-[10px]" style={{ color: subColor }}>{sub}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Deductions Breakdown table ── */}
              <div>
                <div className="mb-3">
                  <p className="text-sm font-bold text-foreground">Deductions Breakdown</p>
                  <p className="text-xs text-muted-foreground">Click on a category to view matching transactions</p>
                </div>

                {tableGroups.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground border border-border/60 rounded-xl" style={{ background: "hsl(var(--muted))" }}>
                    No transactions available in this period.
                  </div>
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden" style={{ background: "hsl(var(--card))" }}>
                    {/* Table header */}
                    <div className="grid text-[10px] text-muted-foreground font-semibold uppercase tracking-wider px-4 py-2.5 border-b border-border/60"
                      style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto" }}>
                      <span>Category</span>
                      <span>Total</span>
                      <span>Deductions</span>
                      <span>Deduction Rate</span>
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
                            <span className="text-sm text-foreground/90">{group.dedAmt > 0 ? fmt(group.dedAmt) : "$"}</span>
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
                                    {t.deductible ? fmt(perTxAmount.get(t.id) ?? Math.abs(t.amount)) : "$"}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {t.deductible && Math.abs(t.amount) > 0
                                      ? `${((perTxAmount.get(t.id) ?? Math.abs(t.amount)) / Math.abs(t.amount) * 100).toFixed(1)}%`
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
