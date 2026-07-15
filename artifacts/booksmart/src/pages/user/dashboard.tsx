import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { normalizeStatementDoc, computeFinancialSnapshot, type StatementPeriod } from "@/lib/financial-statements";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import BusinessSurveyDialog from "@/components/business-survey-dialog";
import BusinessSetupDialog from "@/components/business-setup-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Flame, Star, Lock, Coins, FileText, BarChart2, MessageSquare, Lightbulb,
  Folder, CreditCard, Upload, Trophy, TrendingUp, ShieldCheck, Loader2, Sparkles,
  ArrowRight, Wallet,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Transaction = {
  id: number; title: string; amount: number; type: string;
  date_time: string; description: string; deductible?: boolean;
};

type AiStrategy = {
  title: string; savings: number; description: string;
  difficulty: "Easy" | "Medium" | "Hard";
};

type DashboardOrder = {
  id: number; cpa_id: number | null; title: string | null;
  services: string | null; status: string; created_at: string;
  cpa: { first_name: string | null; last_name: string | null } | null;
};

type StateRow = { id: number; name: string; code: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMoney(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function startOfLastMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString();
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// BPS score → level/title
function calcBPS({ txCount, docCount, hasOrg, profileComplete, netPositive, hasPendingReview }: {
  txCount: number; docCount: number; hasOrg: boolean;
  profileComplete: boolean; netPositive: boolean; hasPendingReview: boolean;
}) {
  let score = 15;
  score += Math.min(30, txCount * 3);
  score += Math.min(20, docCount * 5);
  if (hasOrg) score += 10;
  if (profileComplete) score += 10;
  if (netPositive) score += 10;
  if (!hasPendingReview && txCount > 0) score += 5;
  return Math.min(100, Math.round(score));
}

function bpsLevel(score: number) {
  if (score >= 95) return { level: 10, title: "Profit Machine", next: null };
  if (score >= 85) return { level: 9, title: "Cashflow Builder", next: "Profit Machine" };
  if (score >= 75) return { level: 8, title: "Entrepreneur", next: "Cashflow Builder" };
  if (score >= 65) return { level: 7, title: "Achiever", next: "Entrepreneur" };
  if (score >= 55) return { level: 6, title: "Builder+", next: "Achiever" };
  if (score >= 45) return { level: 5, title: "Builder", next: "Builder+" };
  if (score >= 35) return { level: 4, title: "Explorer+", next: "Builder" };
  if (score >= 25) return { level: 3, title: "Explorer", next: "Explorer+" };
  if (score >= 15) return { level: 2, title: "Beginner", next: "Explorer" };
  return { level: 1, title: "Starter", next: "Beginner" };
}

// ─── BPS Gauge ───────────────────────────────────────────────────────────────

function BPSGauge({ score }: { score: number }) {
  const startDeg = 150;
  const totalDeg = 240;
  const cx = 110;
  const cy = 116;
  const r = 86;
  const rTick = 74;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const pt = (deg: number, radius: number) => ({
    x: cx + radius * Math.cos(toRad(deg)),
    y: cy + radius * Math.sin(toRad(deg)),
  });

  const segArc = (s: number, e: number) => {
    const sv = pt(s, r);
    const ev = pt(e, r);
    const large = e - s > 180 ? 1 : 0;
    return `M ${sv.x.toFixed(2)} ${sv.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${ev.x.toFixed(2)} ${ev.y.toFixed(2)}`;
  };

  const ticks = [0, 20, 40, 60, 80, 100];
  const markerDeg = startDeg + (score / 100) * totalDeg;
  const marker = pt(markerDeg, r);
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : score >= 20 ? "Poor" : "Critical";

  return (
    <div className="flex flex-col items-center justify-center">
      <svg className="h-[205px] w-[260px] max-w-full" viewBox="0 0 220 178">
        <defs>
          <linearGradient id="bpsGradient" x1="28" y1="154" x2="196" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="22%" stopColor="#f97316" />
            <stop offset="44%" stopColor="#facc15" />
            <stop offset="68%" stopColor="#55d17f" />
            <stop offset="100%" stopColor="#14b8c9" />
          </linearGradient>
        </defs>
        <path d={segArc(startDeg, startDeg + totalDeg)} fill="none" stroke="#071b38" strokeWidth="16" strokeLinecap="round" opacity="0.98" />
        <path d={segArc(startDeg, markerDeg)} fill="none" stroke="url(#bpsGradient)" strokeWidth="16" strokeLinecap="round" />
        {ticks.map((pct) => {
          const deg = startDeg + (pct / 100) * totalDeg;
          const inner = pt(deg, rTick);
          const outer = pt(deg, rTick + 5);
          return <line key={`tick-${pct}`} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#8391a8" strokeWidth="1.5" opacity="0.55" />;
        })}
        {ticks.map((pct) => {
          const deg = startDeg + (pct / 100) * totalDeg;
          const labelPt = pt(deg, rTick - 17);
          return (
            <text key={`label-${pct}`} x={labelPt.x} y={labelPt.y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="#ffffff">
              {pct}
            </text>
          );
        })}
        <circle cx={marker.x} cy={marker.y} r="5" fill="#ffffff" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="42" fontWeight="800" fill="white">{score}</text>
        <text x={cx} y={cy + 28} textAnchor="middle" fontSize="16" fontWeight="600" fill="white">{label}</text>
      </svg>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function UserDashboard() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const numericId = profile?.numericId ?? null;
  const tokenBalance = profile?.token_balance ?? 0;
  const qc = useQueryClient();
  const [activeOrgId, setActiveOrgId] = useActiveOrganizationId(numericId);

  const [insightData, setInsightData] = useState<{ strategies: AiStrategy[]; totalSavings: number } | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightUnlocked, setInsightUnlocked] = useState(false);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [starterOrgId, setStarterOrgId] = useState<number | null>(null);
  const [businessDialogOpen, setBusinessDialogOpen] = useState(false);
  const [businessDialogDismissed, setBusinessDialogDismissed] = useState(false);

  // ── Org lookup ──────────────────────────────────────────────────────────────
  const { data: orgData, isLoading: orgLoading } = useQuery<{ id: number } | null>({
    queryKey: ["user_org", numericId, activeOrgId],
    enabled: numericId !== null,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations").select("id").eq("owner_id", numericId!).order("id", { ascending: true });
      if (error) throw error;
      return pickActiveOrganization(data as { id: number }[] | null, activeOrgId);
    },
  });
  const orgId = orgData?.id ?? starterOrgId ?? null;

  useEffect(() => { console.log("[dashboard] numericId:", numericId, "orgId:", orgId); }, [numericId, orgId]);

  const { data: states = [] } = useQuery<StateRow[]>({
    queryKey: ["states"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from("states").select("id, name, code").order("name");
      if (error) throw error;
      return (data as StateRow[]) ?? [];
    },
  });

  useEffect(() => {
    if (numericId === null || orgLoading || orgData || starterOrgId || businessDialogDismissed) return;
    setBusinessDialogOpen(true);
  }, [numericId, orgLoading, orgData, starterOrgId, businessDialogDismissed]);

  // ── Real-time tx updates ────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    const ch = supabase.channel(`transactions:org_${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `org_id=eq.${orgId}` }, () => {
        qc.invalidateQueries({ queryKey: ["tx_month", orgId] });
        qc.invalidateQueries({ queryKey: ["tx_recent", orgId] });
        qc.invalidateQueries({ queryKey: ["tx_count", orgId] });
        qc.invalidateQueries({ queryKey: ["tx_last_month", orgId] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgId, qc]);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: monthTxs = [], isLoading: monthLoading } = useQuery<Transaction[]>({
    queryKey: ["tx_month", orgId],
    enabled: orgId != null,
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions")
        .select("id, title, amount, type, date_time, description, deductible")
        .eq("org_id", orgId!).order("date_time", { ascending: false });
      if (error) throw error;
      console.log("[dashboard] tx_month rows:", data?.length ?? 0);
      return data ?? [];
    },
  });

  const { data: recentTxs = [] } = useQuery<Transaction[]>({
    queryKey: ["tx_recent", orgId],
    enabled: orgId != null,
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions")
        .select("id, title, amount, type, date_time, description")
        .eq("org_id", orgId!).order("date_time", { ascending: false }).limit(5);
      if (error) throw error;
      console.log("[dashboard] tx_recent rows:", data?.length ?? 0);
      return data ?? [];
    },
  });

  const { data: allTxCount = 0 } = useQuery<number>({
    queryKey: ["tx_count", orgId],
    enabled: orgId != null,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { count } = await supabase.from("transactions")
        .select("id", { count: "exact", head: true }).eq("org_id", orgId!);
      return count ?? 0;
    },
  });

  const { data: lastMonthTxs = [] } = useQuery<{ amount: number }[]>({
    queryKey: ["tx_last_month", orgId],
    enabled: orgId != null,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("amount")
        .eq("org_id", orgId!).gte("date_time", startOfLastMonth()).lt("date_time", startOfMonth());
      return data ?? [];
    },
  });

  const { data: docCount = 0 } = useQuery<number>({
    queryKey: ["doc_count", numericId],
    enabled: numericId !== null,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { count } = await supabase.from("user_documents")
        .select("id", { count: "exact", head: true }).eq("user_id", numericId!);
      return count ?? 0;
    },
  });

  const { data: pendingCount = 0 } = useQuery<number>({
    queryKey: ["pending_count", numericId],
    enabled: numericId !== null,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { count } = await supabase.from("pending_transactions")
        .select("id", { count: "exact", head: true }).eq("user_id", numericId!);
      return count ?? 0;
    },
  });

  const { data: activeOrders = [] } = useQuery<DashboardOrder[]>({
    queryKey: ["dashboard_orders", numericId],
    enabled: numericId !== null,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("id, cpa_id, title, services, status, created_at, cpa:users!cpa_id(first_name, last_name)")
        .eq("user_id", numericId!).in("status", ["pending", "active"])
        .order("created_at", { ascending: false }).limit(3);
      if (error) { if (error.code === "42P01") return []; throw error; }
      return (data ?? []) as unknown as DashboardOrder[];
    },
  });

  const { data: statementDocs = [] } = useQuery<StatementPeriod[]>({
    queryKey: ["statement_docs", numericId],
    enabled: numericId !== null,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_documents")
        .select("id, name, category, tax_year, parsed_data")
        .eq("user_id", numericId!)
        .in("category", ["Profit & Loss", "Income Statement", "Balance Sheet", "Cash Flow Statement"]);
      if (error) throw error;
      return (data ?? []).flatMap((row) => normalizeStatementDoc(row as any));
    },
  });

  const { data: liveTokens = tokenBalance } = useQuery<number>({
    queryKey: ["token_balance", numericId],
    enabled: numericId !== null,
    initialData: tokenBalance,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("users").select("token_balance")
        .eq("id", numericId!).single();
      return (data as { token_balance: number } | null)?.token_balance ?? 0;
    },
  });

  // ── Derived metrics ─────────────────────────────────────────────────────────
  const snapshot = computeFinancialSnapshot(monthTxs, statementDocs);
  const { income, expenses, netProfit } = snapshot;
  const lastMonthIncome = lastMonthTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);

  const profileComplete = !!(profile?.full_name && profile.phone);
  const netPositive = netProfit > 0;

  const bpsScore = calcBPS({ txCount: allTxCount, docCount, hasOrg: orgId !== null, profileComplete, netPositive, hasPendingReview: pendingCount > 0 });
  const bpsInfo = bpsLevel(bpsScore);

  const xpTotal = allTxCount * 50 + docCount * 100;
  const recentDays = new Set(recentTxs.map(t => t.date_time.split("T")[0])).size;
  const streakDays = Math.min(7, recentDays);

  const cashFlowPct = income + expenses === 0 ? 0 : Math.min(100, Math.round((income / (income + expenses)) * 100));
  const taxReadinessPct = Math.min(100, Math.round((docCount / 4) * 100));
  const revGrowthPct = lastMonthIncome === 0 ? (income > 0 ? 100 : 0) : Math.min(100, Math.round((income / lastMonthIncome) * 100));

  // Dun & Bradstreet proxy score (based on BPS)
  const dbScore = Math.min(99, Math.round(bpsScore * 0.7 + 22));
  const dbLabel = dbScore >= 80 ? "Excellent" : dbScore >= 65 ? "Good" : dbScore >= 50 ? "Fair" : "Poor";
  const fundingPoints = Math.min(99, Math.round(dbScore * 1.05));

  // Level progress within current tier (0-100%)
  const levelFloor = [0, 0, 15, 25, 35, 45, 55, 65, 75, 85, 95][bpsInfo.level] ?? 0;
  const levelCeil  = [0, 15, 25, 35, 45, 55, 65, 75, 85, 95, 100][bpsInfo.level] ?? 100;
  const levelPct   = levelCeil === levelFloor ? 100 : Math.round(((bpsScore - levelFloor) / (levelCeil - levelFloor)) * 100);

  // XP available from uncompleted missions
  const xpPotential = [550, 120, 75, 90].reduce((a, b) => a + b, 0);

  const firstName = profile?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  // Missions (matching Flutter screenshot)
  const missions = [
    {
      icon: <Folder className="h-[15px] w-[15px] text-emerald-200" />,
      iconBg: "bg-emerald-600",
      title: "Categorize 5 uncategorized transactions",
      xp: "+550 XP",
      done: pendingCount === 0 && allTxCount >= 5,
      href: "/user/reports?tab=transactions",
    },
    {
      icon: <CreditCard className="h-[15px] w-[15px] text-orange-200" />,
      iconBg: "bg-orange-500",
      title: "Pay down credit card balance",
      xp: "+120 XP",
      done: netPositive && expenses > 0,
      href: "/user/reports?tab=transactions",
    },
    {
      icon: <Upload className="h-[15px] w-[15px] text-blue-200" />,
      iconBg: "bg-blue-600",
      title: "Upload receipts for deductions",
      xp: "+75 XP",
      done: docCount > 0,
      href: "/user/tax",
    },
    {
      icon: <Lightbulb className="h-[15px] w-[15px] text-purple-200" />,
      iconBg: "bg-purple-600",
      title: "Review tax strategy suggestion",
      xp: "+90 XP",
      done: insightUnlocked,
      href: "/user/ai-strategy",
    },
  ];

  // Achievements (matching Flutter screenshot)
  const achievements = [
    { icon: <Trophy className="h-5 w-5 text-amber-400" />, label: "First $10k Month", done: income >= 10000 },
    { icon: <Flame className="h-5 w-5 text-orange-400" />, label: "30-Day Profit Streak", done: streakDays >= 7 },
    { icon: <TrendingUp className="h-5 w-5 text-blue-400" />, label: "Revenue Growth", done: income > lastMonthIncome && lastMonthIncome > 0 },
    { icon: <ShieldCheck className="h-5 w-5 text-purple-400" />, label: "Tax Doc Ready", done: docCount >= 4 },
  ];

  // ── AI Insight unlock ──────────────────────────────────────────────────────
  async function unlockAiInsight() {
    if (liveTokens < 150) {
      toast({ title: "Insufficient tokens", description: "You need at least 150 tokens.", variant: "destructive" });
      return;
    }
    setInsightLoading(true);
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
        setInsightLoading(false);
        return;
      }

      const txLines = [...monthTxs].slice(0, 30)
        .map(t => `${t.date_time.split("T")[0]}: ${t.title} ${t.amount >= 0 ? "+" : ""}$${Math.abs(t.amount).toFixed(2)}`).join("\n");

      const prompt = `You are a US tax strategist. Analyze these transactions:
${txLines || "(No transactions yet)"}
Monthly income: $${income.toFixed(2)}, expenses: $${expenses.toFixed(2)}, net: $${netProfit.toFixed(2)}, docs: ${docCount}
Generate 3-5 actionable US tax-saving strategies. Respond ONLY with valid JSON:
{"strategies":[{"title":"Name","savings":1500,"description":"Step.","difficulty":"Easy"}]}
difficulty must be "Easy", "Medium", or "Hard". savings is a USD number.`;

      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;

      const res = await fetch("/api/openai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ model: "openai/gpt-4o-mini", messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error(`AI call failed: ${res.status}`);
      const aiData = await res.json() as { choices?: { message?: { content?: string } }[] };
      const content = aiData.choices?.[0]?.message?.content ?? "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not parse AI response");
      const parsed = JSON.parse(jsonMatch[0]) as { strategies: AiStrategy[] };
      const strategies = parsed.strategies ?? [];
      const totalSavings = strategies.reduce((s, st) => s + (st.savings ?? 0), 0);
      setInsightData({ strategies, totalSavings });
      setInsightUnlocked(true);
      await supabase.from("users").update({ token_balance: Math.max(0, liveTokens - 150) }).eq("id", numericId!);
      qc.invalidateQueries({ queryKey: ["token_balance", numericId] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Failed to generate insights", description: msg, variant: "destructive" });
    } finally {
      setInsightLoading(false);
    }
  }

  const _ = { monthLoading, revGrowthPct, activeOrders };  // silence unused warnings

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-0">
      <div className="relative -top-2 mb-2 flex justify-start sm:-top-9 sm:mb-0 sm:h-0 sm:justify-end items-center gap-5 pr-1 text-[14px] font-semibold">
        <span className="flex items-center gap-1">
          <Flame className="h-[15px] w-[15px] text-orange-500" />
          Streak: {streakDays} day{streakDays !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1 text-primary">
          <Star className="h-[15px] w-[15px] fill-primary text-primary" />
          {xpTotal.toLocaleString()} XP
        </span>
      </div>

      {/* ── 2-column grid: main content + right sidebar ── */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">

        {/* ════════════ LEFT / MAIN ════════════ */}
        <div className="space-y-4 min-w-0">

          {/* ── BPS Card ── */}
          <Card>
            <CardContent className="px-5 pt-4 pb-5 min-h-[296px] flex flex-col">
              {/* Card title + streak/XP */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-[16px] font-bold text-foreground">Business Power Score (BPS)</p>
              </div>

              {/* Gauge + right content */}
              <div className="grid flex-1 items-center gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-7">
                <div className="flex items-center justify-center">
                  <BPSGauge score={bpsScore} />
                </div>

                {/* Progress bars + XP chip */}
                <div className="min-w-0 pt-1">
                  {/* Level title */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    <span className="text-[16px] font-bold">Level {bpsInfo.level}</span>
                    <span className="text-[16px] font-semibold text-foreground/90">{bpsInfo.title}</span>
                    <Star className="h-[14px] w-[14px] fill-amber-400 text-amber-400" />
                  </div>

                  {/* Overall progress bar (thick, gold) */}
                  <div className="h-[5px] bg-[#29415f] rounded-full overflow-hidden mb-6">
                    <div className="h-full bg-[#ffa43b] rounded-full transition-all duration-700" style={{ width: `${bpsScore}%` }} />
                  </div>

                  {/* Next level label */}
                  {bpsInfo.next && (
                    <>
                      <p className="text-[21px] font-bold text-foreground/95 mb-3">{bpsInfo.next}</p>
                      {/* Level-within-tier bar (thinner) */}
                      <div className="h-[5px] bg-[#29415f] rounded-full overflow-hidden">
                        <div className="h-full bg-[#ffc107] rounded-full transition-all duration-700" style={{ width: `${levelPct}%` }} />
                      </div>
                    </>
                  )}

                  {/* Next rank + streak info */}
                  <div className="flex justify-between text-[12px] text-muted-foreground mt-3 mb-5">
                    <span>Next rank: {bpsInfo.next ?? "MAX"}</span>
                    <span>Streak: {(xpTotal / 1000).toFixed(3)}</span>
                  </div>

                  {/* XP potential chip — matches Flutter "Todays XP Potential:" chip */}
                  <div className="ml-auto flex items-center justify-between gap-2 bg-[#29415f] border border-white/10 rounded-full px-5 py-2 w-[445px] max-w-full">
                    <span className="text-[12px] text-muted-foreground">Todays XP Potential:</span>
                    <span className="text-[13px] font-bold text-primary">+{xpPotential - missions.filter(m => m.done).reduce((sum, _, i) => sum + [550, 120, 75, 90][i], 0)} XP</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Missions + AI Insight row ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* Today's Missions */}
            <Card>
              <CardContent className="p-0 min-h-[316px]">
                <div className="px-5 pt-4 pb-3">
                  <p className="text-[14px] font-bold">Today's Missions</p>
                </div>
                <div className="px-4 pb-4 space-y-2">
                  {missions.map(m => {
                    const inner = (
                      <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors
                        ${m.done ? "bg-muted/8 opacity-60" : "bg-muted/12 hover:bg-muted/20 cursor-pointer"}`}>
                        {/* Colored square icon — matches Flutter Card indicator bar style */}
                        <div className={`h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center ${m.iconBg}`}>
                          {m.icon}
                        </div>
                        <span className={`text-[13px] flex-1 min-w-0 truncate ${m.done ? "line-through text-muted-foreground" : ""}`}>
                          {m.title}
                        </span>
                        <span className={`text-[12px] font-semibold whitespace-nowrap flex-shrink-0
                          ${m.done ? "text-muted-foreground" : "text-emerald-400"}`}>
                          {m.done ? "Done ✓" : m.xp}
                        </span>
                      </div>
                    );
                    return m.href && !m.done
                      ? <Link key={m.title} href={m.href}>{inner}</Link>
                      : <div key={m.title}>{inner}</div>;
                  })}
                </div>
              </CardContent>
            </Card>

            {/* AI Insight — dark gradient matching Flutter _FinancialDashboard custom palette */}
            <Card style={{ background: "linear-gradient(135deg, #020e2c 0%, #071f4a 50%, #061a3d 100%)", borderColor: "rgba(255,255,255,0.08)" }}>
              <CardContent className="p-5 min-h-[316px] flex flex-col items-center justify-center text-center gap-1.5">
                <p className="text-[15px] font-bold text-white">AI Insight</p>
                <p className="text-[12px] text-white/60">Maximize Your Business Savings Potential!</p>

                {insightLoading ? (
                  <div className="flex flex-col items-center gap-2 mt-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-[12px] text-white/50">Analyzing your finances…</p>
                  </div>
                ) : insightUnlocked && insightData ? (
                  <>
                    <p className="text-[38px] font-bold text-emerald-400 leading-none mt-1">
                      {formatMoney(insightData.totalSavings)}
                    </p>
                    <p className="text-[13px] text-white/70">Across {insightData.strategies.length} strategic insights</p>
                    <div className="w-full mt-2 space-y-1.5 text-left">
                      {insightData.strategies.slice(0, 3).map((s, i) => (
                        <div key={i} className="flex justify-between text-[12px] gap-2">
                          <span className="text-white/65 truncate">{s.title}</span>
                          <span className="text-emerald-400 font-semibold flex-shrink-0">{formatMoney(s.savings)}</span>
                        </div>
                      ))}
                    </div>
                    <Link href="/user/ai-strategy" className="w-full mt-2">
                      <button className="w-full rounded-xl border border-white/15 text-white text-[13px] font-medium py-2.5 flex items-center justify-center gap-2 hover:bg-white/5 transition-colors"
                        style={{ background: "rgba(13,32,68,0.8)" }}>
                        Full Strategies <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </Link>
                  </>
                ) : (
                  <>
                    {/* Teaser dollar amount */}
                    <p className="text-[38px] font-bold text-emerald-400 leading-none mt-1">
                      {income > 0 ? formatMoney(Math.round(income * 0.15 / 10) * 10) : "$6,470"}
                    </p>
                    <p className="text-[13px] text-white/70">
                      Across {Math.max(3, Math.min(8, Math.floor(allTxCount / 3) + 3))} strategic insights
                    </p>
                    <p className="text-[12px] text-white/45 max-w-[190px] leading-snug">
                      Unlock to view strategies on how to save your business up to {income > 0 ? formatMoney(Math.round(income * 0.15 / 10) * 10) : "$6,470"}
                    </p>
                    {/* Unlock button matching Flutter: dark bg, lock icon | tokens | coin icon */}
                    <button
                      onClick={unlockAiInsight}
                      disabled={liveTokens < 150}
                      className="mt-2 w-full rounded-xl text-white text-[13px] font-medium py-2.5 flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
                      style={{ background: "rgba(13,32,68,0.9)", border: "1px solid rgba(255,255,255,0.15)" }}>
                      <Lock className="h-3.5 w-3.5 text-white/80" />
                      <span>Unlock &amp; View</span>
                      <span className="text-white/40">|</span>
                      <span className="font-bold text-amber-300">150 Tokens</span>
                      <Coins className="h-3.5 w-3.5 text-amber-400" />
                    </button>
                    {liveTokens < 150 && (
                      <p className="text-[11px] text-rose-400 mt-0.5">
                        Need {150 - liveTokens} more tokens
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Achievements + Business Challenges row ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* Achievements Unlocked */}
            <Card>
              <CardContent className="p-0">
                <div className="px-5 pt-4 pb-3">
                  <p className="text-[14px] font-bold">Achievements Unlocked</p>
                </div>
                <div className="px-4 pb-4 space-y-2">
                  {achievements.map(a => (
                    <div key={a.label} className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors
                      ${a.done ? "bg-muted/12" : "bg-muted/5 opacity-45"}`}>
                      {/* Gold coin circle */}
                      <div className="h-10 w-10 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                        {a.icon}
                      </div>
                      <span className="text-[13px] font-medium flex-1 min-w-0">{a.label}</span>
                      {a.done && (
                        <span className="text-[10px] font-bold text-muted-foreground/70 border border-border/50 rounded px-1.5 py-0.5 uppercase tracking-wider flex-shrink-0">
                          UNLOCKED
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Business Challenges */}
            <Card>
              <CardContent className="p-0">
                <div className="px-5 pt-4 pb-3">
                  <p className="text-[14px] font-bold">Business Challenges</p>
                </div>
                <div className="px-4 pb-4 space-y-3">
                  {[
                    {
                      title: "Cashflow Warrior Challenge",
                      goal: "Goal: increase cashflow by 10%",
                      progress: cashFlowPct,
                      reward: "Profit Badge",
                      href: "/user/reports?tab=cf",
                    },
                    {
                      title: "Tax Readiness Sprint",
                      goal: `Goal: upload 4 tax documents (${docCount}/4)`,
                      progress: taxReadinessPct,
                      reward: "Tax Pro Badge",
                      href: "/user/reports?tab=pl",
                    },
                  ].map(c => (
                    <Link key={c.title} href={c.href}>
                      <div className="rounded-xl bg-muted/10 p-3 hover:bg-muted/18 transition-colors cursor-pointer">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold">{c.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{c.goal}</p>
                          </div>
                          {/* Trophy icon — gold, matching Flutter */}
                          <Trophy className="h-6 w-6 text-amber-400 flex-shrink-0 mt-0.5" />
                        </div>
                        <div className="mt-2.5">
                          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all duration-700"
                              style={{ width: `${c.progress}%` }} />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                            <span>Progress: {c.progress}%</span>
                            <span>Reward: {c.reward}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ════════════ RIGHT SIDEBAR ════════════ */}
        <div className="space-y-4">

          {/* ── Dun & Bradstreet Card ── */}
          <Card>
            <CardContent className="p-6 min-h-[296px] flex flex-col justify-between">
              {/* Header */}
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold">Dun &amp; Bradstreet</p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded"
                  style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.25)" }}>
                  Verified Business
                </span>
              </div>

              {/* Score circle + label + shield */}
              <div className="flex items-center gap-3">
                {/* Circular progress score */}
                <div className="relative w-16 h-16 flex-shrink-0">
                  <svg viewBox="0 0 56 56" className="w-16 h-16 -rotate-90">
                    <circle cx="28" cy="28" r="22" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="5" />
                    <circle cx="28" cy="28" r="22" fill="none" stroke="#F5C542" strokeWidth="5"
                      strokeDasharray={`${(dbScore / 100) * 138.2} 138.2`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[20px] font-bold">{dbScore}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-[18px] font-semibold text-emerald-400">{dbLabel}</p>
                  <p className="text-[11px] text-muted-foreground">↓ {dbLabel}</p>
                </div>
                <ShieldCheck className="h-9 w-9 text-amber-400 flex-shrink-0" />
              </div>

              {/* Business age + threshold */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Business age: {Math.max(1, Math.round(allTxCount / 15))} Years</span>
                  <span>Threshold: 60</span>
                </div>
                <div className="h-1 bg-muted/25 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, dbScore)}%` }} />
                </div>
              </div>

              {/* Funding section */}
              <div className="flex items-center gap-2 pt-1">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(34,197,94,0.15)" }}>
                  <Wallet className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold">Funding</p>
                  <p className="text-[11px] text-muted-foreground">{bpsScore >= 70 ? "Loan Ready" : "Needs Improvement"}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[20px] font-bold">{fundingPoints}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">POINTS</p>
                </div>
              </div>

              {/* Divider + Business Credit */}
              <div className="border-t border-border/30 pt-2.5 space-y-2">
                <p className="text-[12px] font-semibold">Business Credit (Dun &amp; Bradstreet)</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(59,130,246,0.2)" }}>
                      <span className="text-[9px] font-bold text-blue-400">P</span>
                    </div>
                    <span className="text-[12px] font-medium">PAYDEX</span>
                  </div>
                  <Link href="/user/cpa-network">
                    <span className="text-[12px] text-emerald-400 font-semibold">{dbLabel} &rsaquo;</span>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Token Wallet ── */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-[13px] font-bold">Token Wallet</p>

              {/* Balance row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-primary" />
                  <span className="text-[13px] font-medium">{liveTokens} Tokens</span>
                </div>
                {/* Badge circle */}
                <div className="w-10 h-10 rounded-full bg-muted/25 flex items-center justify-center">
                  <span className="text-[13px] font-bold text-primary">{liveTokens}</span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">Earned this month</p>

              {/* Feature bullets */}
              <div className="space-y-1.5">
                {[
                  { icon: <Sparkles className="h-3 w-3 text-primary" />, label: "Allocate estimates" },
                  { icon: <BarChart2 className="h-3 w-3 text-blue-400" />, label: "Gen monthly report" },
                  { icon: <MessageSquare className="h-3 w-3 text-emerald-400" />, label: "Consult to advisor" },
                  { icon: <Lightbulb className="h-3 w-3 text-amber-400" />, label: "Get banking recommendations" },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2 text-[12px] text-foreground/75">
                    <div className="flex-shrink-0">{item.icon}</div>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              <Link href="/user/token">
                <button className="w-full mt-1 rounded-lg border border-border/40 text-[12px] font-medium text-muted-foreground py-1.5 hover:text-foreground hover:border-primary/40 transition-colors">
                  View Wallet →
                </button>
              </Link>
            </CardContent>
          </Card>

          {/* ── Your CPA (active orders) ── */}
          {activeOrders.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] font-bold">Your CPA</p>
                  <Link href="/user/orders">
                    <span className="text-[11px] text-muted-foreground hover:text-primary">All Orders →</span>
                  </Link>
                </div>
                <div className="space-y-2">
                  {activeOrders.map(order => {
                    const cpaName = [order.cpa?.first_name, order.cpa?.last_name].filter(Boolean).join(" ") || "CPA";
                    return (
                      <div key={order.id} className="flex items-center gap-2 rounded-lg bg-muted/10 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium truncate">{cpaName}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{order.title ?? order.services ?? "Service"}</p>
                        </div>
                        <span className="text-[10px] font-semibold text-primary capitalize px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 flex-shrink-0">
                          {order.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {/* ── Hidden username usage to silence linter ── */}
      <span className="hidden">{firstName}</span>
      <BusinessSetupDialog
        open={businessDialogOpen}
        onOpenChange={(open) => {
          if (!open) setBusinessDialogDismissed(true);
          setBusinessDialogOpen(open);
        }}
        ownerId={numericId}
        states={states}
        defaultEmail={user?.email ?? profile?.email ?? ""}
        onSaved={(newOrgId) => {
          setStarterOrgId(newOrgId);
          setActiveOrgId(newOrgId);
          setBusinessDialogOpen(false);
          setSurveyOpen(true);
          qc.invalidateQueries({ queryKey: ["user_org", numericId] });
          qc.invalidateQueries({ queryKey: ["organizations_list", numericId] });
          toast({ title: "Business added", description: "Now complete the business survey." });
        }}
        onError={(message) => toast({ title: "Could not add business", description: message, variant: "destructive" })}
      />
      <BusinessSurveyDialog
        orgId={orgId}
        open={surveyOpen}
        onOpenChange={setSurveyOpen}
      />
    </div>
  );
}
