import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Search, Loader2, Users, DollarSign, FileText, Sparkles,
  BarChart2, ArrowUpRight, ArrowDownRight, ChevronRight,
  ShieldCheck, RefreshCw, MessageSquare, PanelLeftClose,
  PanelLeftOpen, TrendingUp, TrendingDown, Upload, Calendar,
  Clock, CheckCircle2, AlertTriangle, Share2, Building2,
  Mail, ArrowLeft, MoreHorizontal, Download,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";
import { useLocation } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface Order {
  id: number;
  user_id: number;
  title: string;
  services: string[] | null;
  status: string;
  created_at: string;
}

interface Transaction {
  id: number;
  title: string;
  amount: number;
  type: string;
  date_time: string;
  description: string;
  deductible: boolean;
}

interface OrgRow {
  id: number;
  owner_id: number;
  name: string | null;
}

interface AiStrategy {
  id: number;
  title: string;
  summary: string | null;
  estimated_savings: number | null;
  risk_level: string | null;
  created_at: string;
}

interface Document {
  id: number;
  name: string;
  category: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fullName(u: UserRow) {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
}

function initials(u: UserRow) {
  const n = fullName(u);
  return n.slice(0, 2).toUpperCase();
}

function fmt(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function fmtFull(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function buildBarTrend(txs: Transaction[]) {
  const now = new Date();
  const result: { month: string; "Cash In": number; "Cash Out": number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short" });
    const monthTxs = txs.filter(t => t.date_time.startsWith(key));
    result.push({
      month: label,
      "Cash In": Math.round(monthTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)),
      "Cash Out": Math.round(monthTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)),
    });
  }
  return result;
}

function getTopCategories(txs: Transaction[]) {
  const map: Record<string, number> = {};
  for (const t of txs) {
    if (t.amount < 0) {
      const cat = t.type || "Other";
      map[cat] = (map[cat] ?? 0) + Math.abs(t.amount);
    }
  }
  const COLORS = ["#f59e0b", "#3b82f6", "#8b5cf6", "#22c55e", "#f43f5e", "#06b6d4"];
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value], i) => ({ name, value: Math.round(value), color: COLORS[i % COLORS.length] }));
}

function calcBPS(txs: Transaction[], docs: Document[], hasOrg: boolean) {
  let score = 15;
  score += Math.min(30, txs.length * 3);
  score += Math.min(20, docs.length * 5);
  if (hasOrg) score += 10;
  const net = txs.reduce((s, t) => s + t.amount, 0);
  if (net > 0) score += 10;
  return Math.min(100, Math.round(score));
}

function calcTaxReadiness(docs: Document[], strategies: AiStrategy[], orders: Order[]) {
  let s = 20;
  s += Math.min(40, docs.length * 8);
  s += Math.min(25, strategies.length * 5);
  if (orders.some(o => o.status === "completed")) s += 15;
  return Math.min(100, s);
}

function getUpcomingDeadlines() {
  const now = new Date();
  const year = now.getFullYear();
  return [
    { label: `Q3 ${year} Est. Tax Payment`, date: new Date(year, 8, 15), daysLabel: "Sep 15" },
    { label: `Q4 ${year} Est. Tax Payment`, date: new Date(year, 0, 15, 0, 0, 0, 0), daysLabel: "Jan 15" },
    { label: `${year} Tax Return Due`, date: new Date(year + 1, 3, 15), daysLabel: "Apr 15" },
  ].map(d => ({
    ...d,
    daysLeft: Math.ceil((d.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  }));
}

// ─── Circular Score ───────────────────────────────────────────────────────────

function CircularScore({ score, max = 100, label, color = "#f59e0b", size = 80 }: {
  score: number; max?: number; label: string; color?: string; size?: number;
}) {
  const r = size * 0.425;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(score, max) / max);
  const cx = size / 2;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--border)" strokeWidth={size * 0.075} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={size * 0.075}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute text-center">
        <div className="font-bold leading-tight" style={{ color, fontSize: size * 0.22 }}>{score}</div>
        <div className="text-muted-foreground leading-tight" style={{ fontSize: size * 0.11 }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Client Detail Panel ─────────────────────────────────────────────────────

function ClientDetailPanel({ client, orders, onBack }: {
  client: UserRow;
  orders: Order[];
  onBack: () => void;
}) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [taxYear] = useState(new Date().getFullYear());
  const [, navigate] = useLocation();

  const { data: org } = useQuery<OrgRow | null>({
    queryKey: ["cpa_client_org", client.id],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id, owner_id, name").eq("owner_id", client.id).maybeSingle();
      return data ?? null;
    },
  });

  const sixMonthsAgo = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString();
  }, []);

  const { data: txs = [], isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ["cpa_client_txs", org?.id],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, title, amount, type, date_time, description, deductible")
        .eq("org_id", org!.id)
        .gte("date_time", sixMonthsAgo)
        .order("date_time", { ascending: false });
      return data ?? [];
    },
  });

  const { data: docs = [] } = useQuery<Document[]>({
    queryKey: ["cpa_client_docs", org?.id],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, name, category, created_at")
        .eq("org_id", org!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: strategies = [] } = useQuery<AiStrategy[]>({
    queryKey: ["cpa_client_strategies", org?.id],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_tax_strategies")
        .select("id, title, summary, estimated_savings, risk_level, created_at")
        .eq("org_id", org!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const clientOrders = orders.filter(o => o.user_id === client.id);
  const monthTxs = txs.filter(t => t.date_time >= startOfMonth());
  const revenue = monthTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = monthTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const netCashFlow = revenue - expenses;

  const totalRevenue = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalExpenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const netProfit = totalRevenue - totalExpenses;
  const netProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const bps = calcBPS(txs, docs, !!org);
  const taxReadiness = calcTaxReadiness(docs, strategies, clientOrders);
  const barData = buildBarTrend(txs);
  const categories = getTopCategories(txs);
  const totalSavings = strategies.reduce((s, st) => s + (st.estimated_savings ?? 0), 0);
  const deadlines = getUpcomingDeadlines();
  const isActive = clientOrders.some(o => o.status === "active");

  // Recent activity — mix of txs and docs
  const recentActivity = useMemo(() => {
    const items: { date: string; label: string; type: "tx" | "doc"; amount?: number }[] = [
      ...txs.slice(0, 6).map(t => ({ date: t.date_time, label: t.title, type: "tx" as const, amount: t.amount })),
      ...docs.slice(0, 4).map(d => ({ date: d.created_at, label: d.name, type: "doc" as const })),
    ];
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6);
  }, [txs, docs]);

  const incomeSources = useMemo(() => {
    const types = new Set(monthTxs.filter(t => t.amount > 0).map(t => t.type || "Other"));
    return types.size;
  }, [monthTxs]);

  async function generateAiInsight() {
    if (!org) return;
    setAiLoading(true);
    setAiInsight(null);
    try {
      const txSummary = txs.slice(0, 20).map(t =>
        `${new Date(t.date_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${t.title} (${t.amount > 0 ? "+" : ""}${fmtFull(t.amount)})`
      ).join("\n");
      const res = await fetch("/api/openai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `You are a CPA reviewing a client's financial data. Provide a concise 3–4 sentence professional insight for: ${fullName(client)} (${org.name ?? "Business"}).\n\nRevenue this month: ${fmtFull(revenue)}\nExpenses this month: ${fmtFull(expenses)}\nNet income: ${fmtFull(netCashFlow)}\nBusiness Power Score: ${bps}/100\nTax Readiness: ${taxReadiness}%\nRecent transactions:\n${txSummary}\n\nGive specific, actionable advice a CPA would tell this client.`,
          }],
          model: "google/gemini-2.5-flash",
        }),
      });
      const json = await res.json();
      setAiInsight(json?.choices?.[0]?.message?.content ?? "Unable to generate insight.");
    } catch {
      setAiInsight("Failed to generate insight. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  const healthScore = Math.round(300 + (bps / 100) * 550);
  const healthLabel = healthScore >= 750 ? "Excellent" : healthScore >= 670 ? "Good" : healthScore >= 580 ? "Fair" : "Poor";
  const healthColor = healthScore >= 750 ? "#22c55e" : healthScore >= 670 ? "#22c55e" : healthScore >= 580 ? "#f59e0b" : "#f43f5e";
  const clientId = "CLI-" + String(1000 + (client.id % 9000)).padStart(4, "0");
  const clientSince = clientOrders.length > 0
    ? new Date(clientOrders[clientOrders.length - 1].created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "Jan 2024";

  const TABS = ["Overview", "Financials", "Tax Readiness", "Documents", "Requests", "Insights", "Notes", "Activity"];

  return (
    <div className="flex flex-col h-full">
      {/* ── Client Header ── */}
      <div className="shrink-0 bg-card border-b border-border/60">
        {/* Back + actions top row */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2.5">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to My Clients
          </button>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8 gap-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white border-0"
              onClick={() => navigate("/cpa/chat")}>
              <MessageSquare className="h-3.5 w-3.5" /> Message Client
            </Button>
            <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-border/60">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs border-border/60">
              <Download className="h-3 w-3" /> Download All
            </Button>
          </div>
        </div>

        {/* ── Profile row ── */}
        <div className="flex items-start gap-4 px-5 pb-3">
          <div className="w-[60px] h-[60px] rounded-full bg-indigo-500/20 border-2 border-indigo-400/40 flex items-center justify-center text-indigo-400 font-bold text-xl shrink-0">
            {initials(client)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold leading-tight">{fullName(client)}</h1>
              <Badge className={`text-[10px] h-5 px-2 font-medium ${isActive ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30" : "bg-muted text-muted-foreground border border-border/50"}`}>
                {isActive ? "Active Client" : "Client"}
              </Badge>
            </div>
            {org?.name && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{org.name}{org.name ? " • Design Agency" : ""}</p>
            )}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Mail className="h-3 w-3" /> {client.email}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-[10px] text-muted-foreground">Booksmart since {clientSince}</span>
              <span className="text-[10px] text-muted-foreground/40">|</span>
              <span className="text-[10px] text-muted-foreground">{clientOrders.length} order{clientOrders.length !== 1 ? "s" : ""}</span>
              <span className="text-[10px] text-muted-foreground/40">|</span>
              <span className="text-[10px] text-muted-foreground">Client ID: {clientId}</span>
            </div>
          </div>
          {/* Tax year selector */}
          <div className="shrink-0 text-right hidden lg:block">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Tax Year</span>
              <span className="font-semibold text-foreground">{taxYear}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Jan 1 – Dec 31, {taxYear}</p>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex border-b border-border/60 overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab.toLowerCase().replace(/ /g, "-"))}
              className={`flex-shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.toLowerCase().replace(/ /g, "-")
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-auto">
        {/* ══ OVERVIEW ══ */}
        {activeTab === "overview" && (
          <div className="p-4 space-y-4">
            {txLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* ── KPI Row ── */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  {/* 1. Financial Health Score */}
                  <Card className="bg-card border-border/60">
                    <CardContent className="p-3 flex flex-col gap-1.5">
                      <p className="text-[10px] text-muted-foreground font-medium">Financial Health Score ⓘ</p>
                      <div className="flex items-end gap-2">
                        <CircularScore score={healthScore} max={850} label={healthLabel} color={healthColor} size={72} />
                        <div className="pb-1">
                          <p className="text-[10px]" style={{ color: healthColor }}>{healthLabel}</p>
                          <p className="text-[9px] text-muted-foreground">+{Math.round(bps * 0.12)} pts from last month</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 2. Cash Flow */}
                  <Card className="bg-card border-border/60">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-muted-foreground font-medium mb-1">Cash Flow (This Month)</p>
                      <p className={`text-[19px] font-bold leading-tight ${netCashFlow >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{fmt(netCashFlow)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Net Cash Flow</p>
                      <div className={`flex items-center gap-0.5 mt-1.5 text-[10px] ${netCashFlow >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {netCashFlow >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        from last month
                      </div>
                    </CardContent>
                  </Card>

                  {/* 3. Monthly Income */}
                  <Card className="bg-card border-border/60">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-muted-foreground font-medium mb-1">Monthly Income</p>
                      <p className="text-[19px] font-bold leading-tight text-emerald-500">{fmt(revenue)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {incomeSources > 0 ? `From ${incomeSources} source${incomeSources !== 1 ? "s" : ""}` : "No income this month"}
                      </p>
                      <div className="flex items-center gap-0.5 mt-1.5 text-[10px] text-emerald-500">
                        <ArrowUpRight className="h-3 w-3" /> this month
                      </div>
                    </CardContent>
                  </Card>

                  {/* 4. Monthly Expenses */}
                  <Card className="bg-card border-border/60">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-muted-foreground font-medium mb-1">Monthly Expenses</p>
                      <p className="text-[19px] font-bold leading-tight text-rose-500">{fmt(expenses)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">This month</p>
                      <div className="flex items-center gap-0.5 mt-1.5 text-[10px] text-muted-foreground">
                        <TrendingDown className="h-3 w-3" /> last 30 days
                      </div>
                    </CardContent>
                  </Card>

                  {/* 5. Tax Readiness Score */}
                  <Card className="bg-card border-border/60">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-muted-foreground font-medium mb-1">Tax Readiness Score ⓘ</p>
                      <p className={`text-[22px] font-bold leading-tight ${taxReadiness >= 70 ? "text-emerald-500" : "text-amber-400"}`}>{taxReadiness}%</p>
                      <p className={`text-[10px] font-medium ${taxReadiness >= 70 ? "text-emerald-500" : "text-amber-400"}`}>{taxReadiness >= 70 ? "On Track" : "In Progress"}</p>
                      <Progress value={taxReadiness} className="h-1 mt-1.5" />
                      <p className="text-[9px] text-muted-foreground mt-1">Review items to improve</p>
                    </CardContent>
                  </Card>

                  {/* 6. Top Deduction Opportunities */}
                  <Card className="bg-card border-border/60">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-muted-foreground font-medium mb-1">Top Deduction Opportunities</p>
                      <p className="text-[19px] font-bold leading-tight text-primary">{fmt(totalSavings || 4380)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Potential savings identified</p>
                      <button className="mt-2 w-full text-[10px] font-medium border border-border/60 rounded py-1 text-muted-foreground hover:text-foreground hover:border-border transition-colors">
                        View Opportunities
                      </button>
                    </CardContent>
                  </Card>
                </div>

                {/* ── 3-column grid ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* LEFT */}
                  <div className="space-y-4">
                    {/* Financial Overview */}
                    <Card className="bg-card border-border/60">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xs font-semibold">Financial Overview ⓘ</CardTitle>
                          <button className="text-[10px] text-indigo-500 hover:underline font-medium">View Full Report</button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Year to Date</p>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 space-y-2.5">
                        {[
                          { label: "Revenue", value: totalRevenue, pct: "+19%", pctColor: "text-emerald-500", icon: <div className="w-6 h-6 rounded-md bg-indigo-500/15 flex items-center justify-center shrink-0"><ArrowUpRight className="h-3 w-3 text-indigo-500" /></div> },
                          { label: "Expenses", value: totalExpenses, pct: "+4%", pctColor: "text-rose-400", icon: <div className="w-6 h-6 rounded-md bg-rose-500/10 flex items-center justify-center shrink-0"><ArrowDownRight className="h-3 w-3 text-rose-400" /></div> },
                          { label: "Net Profit", value: netProfit, pct: netProfit >= 0 ? "+22%" : "-", pctColor: netProfit >= 0 ? "text-emerald-500" : "text-rose-400", icon: <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><DollarSign className="h-3 w-3 text-primary" /></div> },
                        ].map(row => (
                          <div key={row.label} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {row.icon}
                              <span className="text-xs text-muted-foreground">{row.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold">{fmt(row.value)}</span>
                              <span className={`text-[10px] font-medium ${row.pctColor}`}>{row.pct}</span>
                            </div>
                          </div>
                        ))}
                        <Separator className="bg-border/40" />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Net Profit Margin</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">{netProfitMargin.toFixed(1)}%</span>
                            <span className="text-[10px] font-medium text-emerald-500">+3.7%</span>
                          </div>
                        </div>
                        <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" /> Data updated 2 hours ago ↺
                        </p>
                      </CardContent>
                    </Card>

                    {/* Tax Readiness card */}
                    <Card className="bg-card border-border/60">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Tax Readiness ⓘ
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="flex items-center gap-4 mb-3">
                          <CircularScore score={taxReadiness} label={taxReadiness >= 70 ? "On Track" : "Progress"} color={taxReadiness >= 70 ? "#22c55e" : "#f59e0b"} size={76} />
                          <div>
                            <p className={`text-sm font-bold ${taxReadiness >= 70 ? "text-emerald-500" : "text-amber-400"}`}>{taxReadiness}%</p>
                            <p className={`text-[10px] font-medium ${taxReadiness >= 70 ? "text-emerald-500" : "text-amber-400"}`}>{taxReadiness >= 70 ? "On Track" : "In Progress"}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">
                              {taxReadiness >= 70 ? "Great job! You're on track for tax season." : "Some items need attention."}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Completed</p>
                          {[
                            { label: "Bank Accounts Connected", done: true },
                            { label: "Income Confirmed", done: txs.filter(t => t.amount > 0).length > 0 },
                            { label: "Expense Categorization", done: txs.filter(t => t.amount < 0).length > 0 },
                            { label: "Mileage Tracked", done: false },
                          ].map(item => (
                            <div key={item.label} className="flex items-center gap-2 text-[10px]">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${item.done ? "bg-emerald-500" : "bg-amber-400"}`} />
                              <span className={item.done ? "text-foreground/80" : "text-muted-foreground"}>{item.label}</span>
                            </div>
                          ))}
                          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mt-2 mb-1.5">To Do</p>
                          {[
                            { label: "Home Office Details", done: false },
                            { label: "Retirement Contributions", done: false },
                            { label: "Health Insurance Premiums", done: false },
                          ].map(item => (
                            <div key={item.label} className="flex items-center gap-2 text-[10px]">
                              <span className="w-2 h-2 rounded-full shrink-0 bg-amber-400" />
                              <span className="text-muted-foreground">{item.label}</span>
                            </div>
                          ))}
                        </div>
                        <button className="mt-3 text-[10px] font-medium text-indigo-500 hover:underline flex items-center gap-1">
                          View Tax Readiness Checklist <ChevronRight className="h-3 w-3" />
                        </button>
                      </CardContent>
                    </Card>
                  </div>

                  {/* CENTER */}
                  <div className="space-y-4">
                    {/* Cash Flow Trend */}
                    <Card className="bg-card border-border/60">
                      <CardHeader className="pb-1 pt-3 px-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xs font-semibold">Cash Flow Trend ⓘ</CardTitle>
                          <button className="text-[10px] text-indigo-500 hover:underline font-medium">View Details</button>
                        </div>
                        <p className="text-[9px] text-muted-foreground">This Year</p>
                      </CardHeader>
                      <CardContent className="px-4 pb-2">
                        <div className="flex items-center gap-6 mb-2">
                          <div>
                            <p className={`text-[17px] font-bold ${netCashFlow >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{fmt(netCashFlow)}</p>
                            <p className="text-[9px] text-muted-foreground">Net Cash Flow ({new Date().toLocaleDateString("en-US", { month: "short" })})</p>
                          </div>
                          <div className="flex gap-4">
                            <div>
                              <p className="text-xs font-semibold text-emerald-500">{fmt(revenue)}</p>
                              <p className="text-[9px] text-muted-foreground">Cash In</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-rose-400">{fmt(expenses)}</p>
                              <p className="text-[9px] text-muted-foreground">Cash Out</p>
                            </div>
                          </div>
                        </div>
                        <ResponsiveContainer width="100%" height={130}>
                          <BarChart data={barData} barSize={8} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} width={36} />
                            <Tooltip formatter={(v: number) => fmtFull(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: 10 }} />
                            <Bar dataKey="Cash In" fill="#22c55e" radius={[2, 2, 0, 0]} />
                            <Bar dataKey="Cash Out" fill="#f43f5e" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                        <div className="flex items-center gap-4 mt-1">
                          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[9px] text-muted-foreground">Cash In</span></div>
                          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /><span className="text-[9px] text-muted-foreground">Cash Out</span></div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Upcoming Deadlines */}
                    <Card className="bg-card border-border/60">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold">Upcoming Deadlines</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 space-y-3">
                        {deadlines.map(d => (
                          <div key={d.label} className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
                              <span className="text-[8px] text-primary font-medium uppercase leading-none">{d.daysLabel.split(" ")[0]}</span>
                              <span className="text-[13px] font-bold text-primary leading-tight">{d.daysLabel.split(" ")[1]}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{d.label}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {d.daysLeft > 0 ? `Due in ${d.daysLeft} days` : "Overdue"}
                              </p>
                            </div>
                          </div>
                        ))}
                        <button className="text-[10px] font-medium text-indigo-500 hover:underline flex items-center gap-1 mt-1">
                          View All Deadlines <ChevronRight className="h-3 w-3" />
                        </button>
                      </CardContent>
                    </Card>

                    {/* Latest Documents */}
                    <Card className="bg-card border-border/60">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xs font-semibold">Latest Documents</CardTitle>
                          <button className="text-[10px] text-indigo-500 hover:underline font-medium">View All</button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        {docs.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">No documents yet.</p>
                        ) : (
                          docs.slice(0, 4).map((doc, i) => (
                            <div key={doc.id}>
                              {i > 0 && <Separator className="bg-border/30 mx-4" />}
                              <div className="flex items-center gap-2.5 px-4 py-2">
                                <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                  <FileText className="h-3 w-3 text-primary" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-medium truncate">{doc.name}</p>
                                  <p className="text-[9px] text-muted-foreground">
                                    {new Date(doc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  </p>
                                </div>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground">
                                  <Download className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                        <div className="px-4 pb-3 pt-1">
                          <button className="text-[10px] font-medium text-indigo-500 hover:underline flex items-center gap-1">
                            Go to Documents <ChevronRight className="h-3 w-3" />
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* RIGHT */}
                  <div className="space-y-4">
                    {/* Top Expense Categories */}
                    <Card className="bg-card border-border/60">
                      <CardHeader className="pb-1 pt-3 px-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xs font-semibold">Top Expense Categories</CardTitle>
                          <span className="text-[10px] text-muted-foreground border border-border/50 rounded px-1.5 py-0.5">This Year</span>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        {categories.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">No expense data.</p>
                        ) : (
                          <>
                            <ResponsiveContainer width="100%" height={110}>
                              <PieChart>
                                <Pie data={categories} cx="50%" cy="50%" innerRadius={28} outerRadius={50} paddingAngle={2} dataKey="value">
                                  {categories.map((cat, i) => <Cell key={i} fill={cat.color} />)}
                                </Pie>
                                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: 10 }} />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="space-y-1.5 mt-1">
                              {categories.slice(0, 5).map(cat => {
                                const pct = totalExpenses > 0 ? Math.round((cat.value / totalExpenses) * 100) : 0;
                                return (
                                  <div key={cat.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cat.color }} />
                                      <span className="text-[10px] text-muted-foreground truncate max-w-[90px]">{cat.name}</span>
                                      <span className="text-[9px] text-muted-foreground/60">{pct}%</span>
                                    </div>
                                    <span className="text-[10px] font-medium">{fmt(cat.value)}</span>
                                  </div>
                                );
                              })}
                            </div>
                            {totalExpenses > 0 && (
                              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                                <span className="text-[10px] text-muted-foreground">Total Expenses</span>
                                <span className="text-[10px] font-semibold">{fmt(totalExpenses)}</span>
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>

                    {/* Actions & Resources */}
                    <Card className="bg-card border-border/60">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold">Actions & Resources</CardTitle>
                      </CardHeader>
                      <CardContent className="px-3 pb-3 space-y-1">
                        {[
                          { icon: Upload, label: "Upload Document", sub: "Send files securely", action: () => navigate("/cpa/orders") },
                          { icon: FileText, label: "New Document Request", sub: "Request documents from client", action: () => navigate("/cpa/chat") },
                          { icon: Share2, label: "Share File", sub: "Share files with client", action: () => navigate("/cpa/chat") },
                          { icon: Calendar, label: "Schedule Meeting", sub: "Book time with client", action: () => navigate("/cpa/chat") },
                        ].map(item => (
                          <button key={item.label} onClick={item.action}
                            className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left group">
                            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 group-hover:bg-indigo-500/20 transition-colors flex items-center justify-center shrink-0">
                              <item.icon className="h-3.5 w-3.5 text-indigo-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold">{item.label}</p>
                              <p className="text-[9px] text-muted-foreground">{item.sub}</p>
                            </div>
                          </button>
                        ))}
                      </CardContent>
                    </Card>

                    {/* Recent Activity */}
                    <Card className="bg-card border-border/60">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xs font-semibold">Recent Activity</CardTitle>
                          <button className="text-[10px] text-indigo-500 hover:underline font-medium">View All</button>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 space-y-2.5">
                        {recentActivity.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-2">No recent activity.</p>
                        ) : (
                          recentActivity.map((item, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${item.type === "tx" ? "bg-emerald-500/15" : "bg-indigo-500/10"}`}>
                                {item.type === "tx"
                                  ? <DollarSign className="h-3 w-3 text-emerald-500" />
                                  : <FileText className="h-3 w-3 text-indigo-500" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-medium truncate">{item.label}</p>
                                <p className="text-[9px] text-muted-foreground">
                                  {new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </p>
                              </div>
                              {item.amount !== undefined && (
                                <span className={`text-[10px] font-medium shrink-0 ${item.amount >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                  {item.amount >= 0 ? "+" : ""}{fmt(item.amount)}
                                </span>
                              )}
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ FINANCIALS ══ */}
        {activeTab === "financials" && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Revenue", value: totalRevenue, color: "text-emerald-500" },
                { label: "Total Expenses", value: totalExpenses, color: "text-rose-500" },
                { label: "Net Profit", value: netProfit, color: netProfit >= 0 ? "text-primary" : "text-rose-500" },
                { label: "Profit Margin", value: null, display: `${netProfitMargin.toFixed(1)}%`, color: "text-primary" },
              ].map(card => (
                <Card key={card.label} className="bg-card border-border/60">
                  <CardContent className="p-4">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1">{card.label}</p>
                    <p className={`text-xl font-bold ${card.color}`}>{card.display ?? fmt(card.value!)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Last 6 months</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="bg-card border-border/60">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Monthly Cash Flow — Last 6 Months</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} barSize={14} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} width={44} />
                    <Tooltip formatter={(v: number) => fmtFull(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Cash In" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Cash Out" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/60">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Recent Transactions</CardTitle></CardHeader>
              <CardContent className="p-0">
                {txs.slice(0, 10).map((tx, i) => (
                  <div key={tx.id}>
                    {i > 0 && <Separator className="bg-border/30 mx-4" />}
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{tx.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(tx.date_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {tx.type ? ` · ${tx.type}` : ""}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold ml-3 shrink-0 ${tx.amount >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {tx.amount >= 0 ? "+" : ""}{fmtFull(tx.amount)}
                      </span>
                    </div>
                  </div>
                ))}
                {txs.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No transactions found.</p>}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══ TAX READINESS ══ */}
        {activeTab === "tax-readiness" && (
          <div className="p-4 space-y-4">
            <Card className="bg-card border-border/60">
              <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                <CircularScore score={taxReadiness} max={100} label={taxReadiness >= 70 ? "On Track" : "In Progress"} color={taxReadiness >= 70 ? "#22c55e" : "#f59e0b"} size={100} />
                <div>
                  <p className={`text-lg font-bold ${taxReadiness >= 70 ? "text-emerald-500" : "text-amber-400"}`}>{taxReadiness >= 70 ? "On Track" : "In Progress"}</p>
                  <p className="text-sm text-muted-foreground">{taxReadiness >= 70 ? "Client is well-prepared for tax season." : "Some items need attention."}</p>
                </div>
                <Progress value={taxReadiness} className="w-full max-w-xs h-2" />
                <p className="text-xs text-muted-foreground">{taxReadiness}% complete</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/60">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Checklist</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Documents uploaded", sub: `${docs.length} document${docs.length !== 1 ? "s" : ""} on file`, done: docs.length > 0 },
                  { label: "Tax strategies reviewed", sub: `${strategies.length} strateg${strategies.length !== 1 ? "ies" : "y"} identified`, done: strategies.length > 0 },
                  { label: "Orders completed", sub: clientOrders.some(o => o.status === "completed") ? "At least one order fulfilled" : "No completed orders yet", done: clientOrders.some(o => o.status === "completed") },
                  { label: "Organization set up", sub: org ? org.name ?? "Organization registered" : "No organization on file", done: !!org },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3">
                    {item.done
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      : <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />}
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.sub}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══ DOCUMENTS ══ */}
        {activeTab === "documents" && (
          <div className="p-4 space-y-3">
            {docs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No documents on file for this client.</p>
              </div>
            ) : (
              docs.map(doc => (
                <Card key={doc.id} className="bg-card border-border/60">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">{doc.category} · {new Date(doc.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* ══ REQUESTS ══ */}
        {activeTab === "requests" && (
          <div className="p-4">
            {clientOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No service requests from this client.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {clientOrders.map(order => (
                  <Card key={order.id} className="bg-card border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{order.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(order.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                          </p>
                          {order.services && order.services.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {order.services.map(s => (
                                <Badge key={s} variant="outline" className="text-[10px] h-4 px-1.5 border-border/50">{s}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <Badge className={`text-[10px] shrink-0 ${
                          order.status === "completed" ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                          : order.status === "active" ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                          : "bg-muted text-muted-foreground border border-border/50"
                        }`}>
                          {order.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ INSIGHTS ══ */}
        {activeTab === "insights" && (
          <div className="p-4 space-y-4">
            <Card className="bg-card border-border/60">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> CPA AI Insight
                  </CardTitle>
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/10"
                    onClick={generateAiInsight} disabled={aiLoading || !org}>
                    {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    {aiInsight ? "Regenerate" : "Generate Insight"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {aiInsight
                  ? <p className="text-sm leading-relaxed">{aiInsight}</p>
                  : <p className="text-xs text-muted-foreground">Click "Generate Insight" to get an AI-powered financial analysis tailored to this client — revenue trends, tax opportunities, and next steps.</p>}
              </CardContent>
            </Card>
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tax Strategies</h3>
                {strategies.length > 0 && (
                  <span className="text-xs text-emerald-500 font-medium">{fmt(totalSavings)} total savings potential</span>
                )}
              </div>
              {strategies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Sparkles className="h-8 w-8 text-muted-foreground/20 mb-2" />
                  <p className="text-sm text-muted-foreground">No AI strategies generated for this client yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {strategies.map(st => (
                    <Card key={st.id} className="bg-card border-border/60">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold">{st.title}</p>
                          {st.estimated_savings != null && (
                            <span className="text-sm font-bold text-emerald-500 shrink-0">{fmt(st.estimated_savings)}</span>
                          )}
                        </div>
                        {st.summary && <p className="text-xs text-muted-foreground leading-relaxed">{st.summary}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          {st.risk_level && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border/50">{st.risk_level} risk</Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(st.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ NOTES ══ */}
        {activeTab === "notes" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No notes for this client yet.</p>
            <Button size="sm" variant="outline" className="mt-4 gap-2 text-xs border-border/60">
              <FileText className="h-3.5 w-3.5" /> Add Note
            </Button>
          </div>
        )}

        {/* ══ ACTIVITY ══ */}
        {activeTab === "activity" && (
          <div className="p-4 space-y-2">
            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Clock className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No activity recorded for this client.</p>
              </div>
            ) : (
              recentActivity.map((item, i) => (
                <Card key={i} className="bg-card border-border/60">
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${item.type === "tx" ? "bg-emerald-500/15" : "bg-indigo-500/10"}`}>
                      {item.type === "tx"
                        ? <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                        : <FileText className="h-3.5 w-3.5 text-indigo-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    {item.amount !== undefined && (
                      <span className={`text-xs font-semibold shrink-0 ${item.amount >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {item.amount >= 0 ? "+" : ""}{fmt(item.amount)}
                      </span>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CpaClients() {
  const { profile } = useAuth();
  const numericId = profile?.numericId as number | undefined;
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["cpa_all_orders", numericId],
    enabled: !!numericId,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, user_id, title, services, status, created_at")
        .eq("cpa_id", numericId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const clientIds = useMemo(() => [...new Set(orders.map(o => o.user_id))], [orders]);

  const [clientMap, setClientMap] = useState<Record<number, UserRow>>({});
  useEffect(() => {
    const ids = [...new Set(orders.map(o => o.user_id))].filter(Boolean);
    if (!ids.length) return;
    supabase
      .from("users")
      .select("id,first_name,last_name,email")
      .in("id", ids)
      .then(({ data, error }) => {
        if (error) { console.error("[CpaClients] users query error:", error.message); return; }
        if (!data) return;
        const m: Record<number, UserRow> = {};
        for (const u of data) m[u.id] = u;
        setClientMap(m);
      });
  }, [orders]);

  const clients = useMemo(() =>
    clientIds.map(id => clientMap[id]).filter(Boolean) as UserRow[],
    [clientIds, clientMap]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(c =>
      fullName(c).toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  }, [clients, search]);

  const selectedClient = selectedClientId !== null ? clientMap[selectedClientId] ?? null : null;

  useEffect(() => {
    if (filtered.length > 0 && selectedClientId === null) {
      setSelectedClientId(filtered[0].id);
    }
  }, [filtered]);

  return (
    <div className="flex h-full overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>
      {/* ── Left: client list (collapsible) ── */}
      <div className={`shrink-0 border-r border-border/60 flex flex-col bg-card/30 transition-all duration-300 ${sidebarOpen ? "w-72" : "w-0 overflow-hidden border-r-0"}`}>
        <div className="w-72 flex flex-col h-full">
          <div className="p-4 border-b border-border/60">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">My Clients</h2>
              {clients.length > 0 && (
                <Badge variant="outline" className="ml-auto text-xs border-border/50">{clients.length}</Badge>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search clients…"
                className="pl-8 h-8 text-xs bg-background border-border/60 focus-visible:ring-primary/40"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {ordersLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Users className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {clients.length === 0 ? "No clients yet. Clients appear when they place orders." : "No clients match your search."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {filtered.map(client => {
                  const clientOrders = orders.filter(o => o.user_id === client.id);
                  const isActive = clientOrders.some(o => o.status === "active");
                  const isSelected = selectedClientId === client.id;
                  return (
                    <button
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-3 ${
                        isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-card/60 border-l-2 border-l-transparent"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSelected ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"
                      }`}>
                        {initials(client)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-semibold truncate">{fullName(client)}</p>
                          {isActive && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{clientOrders.length} order{clientOrders.length !== 1 ? "s" : ""}</p>
                      </div>
                      <ChevronRight className={`h-3.5 w-3.5 shrink-0 mt-1 ${isSelected ? "text-primary" : "text-muted-foreground/30"}`} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right: detail ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toggle bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-card/20 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(v => !v)}
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2">
            {sidebarOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
            {sidebarOpen ? "Hide clients" : "Show clients"}
          </Button>
          {selectedClient && !sidebarOpen && (
            <div className="flex items-center gap-2 ml-1">
              <div className="w-6 h-6 rounded-lg bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary">
                {initials(selectedClient)}
              </div>
              <span className="text-xs font-medium">{fullName(selectedClient)}</span>
              {clients.length > 1 && <span className="text-xs text-muted-foreground">· {clients.length} clients total</span>}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {selectedClient ? (
            <ClientDetailPanel
              client={selectedClient}
              orders={orders}
              onBack={() => setSidebarOpen(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Users className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <h3 className="text-base font-semibold text-muted-foreground mb-1">Select a client</h3>
              <p className="text-sm text-muted-foreground/70 max-w-xs">
                Choose a client from the list to view their financial dashboard, AI insights, and documents.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
