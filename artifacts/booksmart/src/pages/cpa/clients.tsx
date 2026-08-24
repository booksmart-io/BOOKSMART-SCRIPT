import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { isActiveCpaEngagement } from "@/lib/route-access";
import { apiErrorMessage, authenticatedApi } from "@/lib/authenticated-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search, Loader2, Users, DollarSign, FileText, Sparkles,
  BarChart2, ArrowUpRight, ArrowDownRight, ChevronRight,
  ShieldCheck, RefreshCw, MessageSquare, PanelLeftClose,
  PanelLeftOpen, TrendingUp, TrendingDown, Upload, Calendar,
  Clock, CheckCircle2, AlertTriangle, Share2, Building2,
  Mail, ArrowLeft, MoreHorizontal, Download,
  WalletCards,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";
import { useLocation } from "wouter";
import { forecastShortfallDate } from "@/lib/home-readiness";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  img_url: string | null;
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
  file_url: string | null;
}

type ClientFinancialSummary = {
  organization_ids: number[]; organizations: Array<{ id: number; name: string }>; selected_organization_id: number | null;
  generated_at: string; last_transaction_at: string | null;
  current_month: { revenue: number; accountingExpenses: number; netIncome: number; moneyIn: number; moneyOut: number; netCashMovement: number; profitMarginPct: number | null };
  year_to_date: { revenue: number; accountingExpenses: number; netIncome: number; moneyIn: number; moneyOut: number; netCashMovement: number; profitMarginPct: number | null };
  health: { score: number; status: string; methodologyVersion: string; missingInputs: string[] } | null;
  changes: { revenue: number | null; expenses: number | null; net_income: number | null; cash_movement: number | null };
  monthly_trend: Array<{ month: string; cashIn: number; cashOut: number; netCashMovement: number }>;
  expense_categories: Array<{ name: string; amount: number }>;
  recent_transactions: Transaction[]; income_source_count: number;
  tax_readiness: { available: false; missing_inputs: string[] };
};
type PlanningResult = { organization: { id: number; name: string }; verified_cash: { available: boolean; amount: number | null; refreshed_at: string | null }; inputs: { settings: Record<string, unknown>; items: Array<{ id: number; item_type: string; name: string; amount: number | null; due_date: string; recurrence: string }> }; readiness: { safe_to_spend: { available: boolean; safeToSpend?: number; shortfall?: number; missingInputs?: string[] }; tax_reserve: { available: boolean; remainingReserve?: number | null; missingInputs?: string[] }; forecast: { available: boolean; endingCash?: number; lowestBalance?: number; shortfall?: number; shortfallDate?: string | null; missingInputs?: string[] } } };
type ClientPlanningSummary = { mode: "per_organization" | "single_organization"; results: PlanningResult[]; generated_at: string };

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

function changeText(value: number | null | undefined) {
  if (value == null) return "No prior-period baseline";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}% vs last month`;
}

function CpaPlanningMetric({ title, ready, value, detail }: { title: string; ready: boolean; value?: number; detail?: string }) {
  return <div className="flex min-h-28 flex-col rounded-xl border bg-muted/10 p-4"><div className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-primary" /><p className="text-xs font-semibold">{title}</p></div><div className="mt-3 flex-1">{ready && value != null ? <p className="text-xl font-bold text-emerald-500">{fmt(value)}</p> : <p className="text-sm font-medium text-amber-500">More information needed</p>}{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</div></div>;
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
  const [selectedOrganization, setSelectedOrganization] = useState("all");
  const [, navigate] = useLocation();

  const { data: financial, isLoading: txLoading, isError: financialError } = useQuery<ClientFinancialSummary>({
    queryKey: ["cpa_client_financial_summary", client.id, selectedOrganization],
    queryFn: async () => {
      const response = await authenticatedApi(`/api/cpa/clients/${client.id}/financial-summary?org_id=${encodeURIComponent(selectedOrganization)}`);
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not load the authorized client financial summary."));
      return response.json();
    },
    retry: false,
  });
  const { data: planning, isLoading: planningLoading, isError: planningError } = useQuery<ClientPlanningSummary>({
    queryKey: ["cpa_client_planning_summary", client.id, selectedOrganization],
    queryFn: async () => { const response = await authenticatedApi(`/api/cpa/clients/${client.id}/planning-summary?org_id=${encodeURIComponent(selectedOrganization)}`); if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not load client planning results.")); return response.json(); },
    retry: false,
  });
  const org = selectedOrganization === "all"
    ? (financial?.organizations.length ? { id: 0, name: "All organizations (consolidated)" } : null)
    : financial?.organizations.find(row => String(row.id) === selectedOrganization) ?? null;

  const { data: docs = [] } = useQuery<Document[]>({
    queryKey: ["cpa_client_docs", client.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_documents")
        .select("id, name, category, created_at, file_url")
        .eq("user_id", client.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: strategies = [] } = useQuery<AiStrategy[]>({
    queryKey: ["cpa_client_strategies", client.id, financial?.organization_ids],
    enabled: Boolean(financial?.organization_ids.length),
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_tax_strategies")
        .select("id, title, summary, estimated_savings, risk_level, created_at")
        .in("org_id", financial!.organization_ids)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const clientOrders = orders.filter(o => o.user_id === client.id);
  const txs = financial?.recent_transactions ?? [];
  const revenue = financial?.current_month.revenue ?? 0;
  const expenses = financial?.current_month.accountingExpenses ?? 0;
  const netCashFlow = financial?.current_month.netCashMovement ?? 0;
  const moneyIn = financial?.current_month.moneyIn ?? 0;
  const moneyOut = financial?.current_month.moneyOut ?? 0;
  const totalRevenue = financial?.year_to_date.revenue ?? 0;
  const totalExpenses = financial?.year_to_date.accountingExpenses ?? 0;
  const netProfit = financial?.year_to_date.netIncome ?? 0;
  const netProfitMargin = financial?.year_to_date.profitMarginPct ?? 0;
  const sharedHealth = financial?.health ?? null;
  const barData = (financial?.monthly_trend ?? []).map(row => ({ month: row.month, "Cash In": row.cashIn, "Cash Out": row.cashOut }));
  const categoryColors = ["#f59e0b", "#3b82f6", "#8b5cf6", "#22c55e", "#f43f5e", "#06b6d4"];
  const categories = (financial?.expense_categories ?? []).map((row, index) => ({ name: row.name, value: row.amount, color: categoryColors[index % categoryColors.length] }));
  const totalSavings = strategies.reduce((s, st) => s + (st.estimated_savings ?? 0), 0);
  const isActive = clientOrders.some(o => o.status === "active");

  // Recent activity — mix of txs and docs
  const recentActivity = useMemo(() => {
    const items: { date: string; label: string; type: "tx" | "doc"; amount?: number }[] = [
      ...txs.slice(0, 6).map(t => ({ date: t.date_time, label: t.title, type: "tx" as const, amount: t.amount })),
      ...docs.slice(0, 4).map(d => ({ date: d.created_at, label: d.name, type: "doc" as const })),
    ];
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6);
  }, [txs, docs]);

  const incomeSources = financial?.income_source_count ?? 0;

  const openClientChat = () => navigate(`/cpa/chat?contact_id=${client.id}`);

  async function downloadAllDocuments() {
    const downloadable = docs.filter((doc) => doc.file_url);
    if (downloadable.length === 0) {
      toast.info("This client has no downloadable documents.");
      return;
    }

    try {
      for (const doc of downloadable) {
        const params = new URLSearchParams({ url: doc.file_url!, filename: doc.name });
        const response = await fetch(`/api/document-download?${params.toString()}`);
        if (!response.ok) throw new Error(`Could not download ${doc.name}`);
        const objectUrl = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = doc.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
      }
      toast.success(`Downloaded ${downloadable.length} document${downloadable.length === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download client documents.");
    }
  }

  async function generateAiInsight() {
    if (!org) return;
    setAiLoading(true);
    setAiInsight(null);
    try {
      const txSummary = txs.slice(0, 20).map(t =>
        `${new Date(t.date_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${t.title} (${t.amount > 0 ? "+" : ""}${fmtFull(t.amount)})`
      ).join("\n");
      const res = await authenticatedApi("/api/openai-chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `You are a CPA reviewing a client's financial data. Provide a concise 3–4 sentence professional insight for: ${fullName(client)} (${org.name ?? "Business"}).\n\nRevenue this month: ${fmtFull(revenue)}\nExpenses this month: ${fmtFull(expenses)}\nNet cash movement: ${fmtFull(netCashFlow)}\nShared financial health: ${sharedHealth ? `${sharedHealth.score}/100 (${sharedHealth.status}, ${sharedHealth.methodologyVersion})` : "More data needed"}\nTax readiness: Not configured\nRecent transactions:\n${txSummary}\n\nGive specific, actionable advice a CPA would tell this client.`,
          }],
          model: "openai/gpt-4o-mini",
          use_live_context: false,
        }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Unable to generate insight."));
      const json = await res.json();
      setAiInsight(json?.choices?.[0]?.message?.content ?? "Unable to generate insight.");
    } catch (error) {
      setAiInsight(error instanceof Error ? error.message : "Failed to generate insight. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  const healthScore = sharedHealth?.score ?? null;
  const healthLabel = sharedHealth?.status ?? "More data needed";
  const healthColor = healthScore === null ? "#94a3b8" : healthScore >= 80 ? "#22c55e" : healthScore >= 60 ? "#3b82f6" : healthScore >= 40 ? "#f59e0b" : "#f43f5e";
  const clientId = "CLI-" + String(1000 + (client.id % 9000)).padStart(4, "0");
  const clientSince = clientOrders.length > 0
    ? new Date(clientOrders[clientOrders.length - 1].created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "Jan 2024";

  const TABS = ["Overview", "Financials", "Cash Planning", "Tax Readiness", "Documents", "Requests", "Insights", "Notes", "Activity"];

  return (
    <div className="flex flex-col h-full">
      {/* ── Client Header ── */}
      <div className="shrink-0 bg-card border-b border-border/60">
        {/* Back + actions top row */}
        <div className="flex flex-col gap-2 px-3 pb-2.5 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <button onClick={onBack} className="flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground lg:min-h-0">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to My Clients
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-8 gap-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white border-0"
              onClick={openClientChat}>
              <MessageSquare className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Message Client</span><span className="sm:hidden">Message</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-border/60" aria-label="More client actions">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openClientChat}>Message client</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/cpa/orders")}>View client orders</DropdownMenuItem>
                <DropdownMenuItem onClick={downloadAllDocuments}>Download documents</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs border-border/60" onClick={downloadAllDocuments}>
              <Download className="h-3 w-3" /> <span className="hidden sm:inline">Download All</span><span className="sm:hidden">Download</span>
            </Button>
          </div>
        </div>

        {/* ── Profile row ── */}
        <div className="flex items-start gap-3 px-3 pb-3 sm:gap-4 sm:px-5">
          <Avatar className="h-[60px] w-[60px] border-2 border-indigo-400/40">
            {client.img_url && <AvatarImage src={client.img_url} alt={`${fullName(client)} profile`} className="object-cover" />}
            <AvatarFallback className="bg-indigo-500/20 text-xl font-bold text-indigo-400">{initials(client)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-bold leading-tight">{fullName(client)}</h1>
              <Badge className={`text-[10px] h-5 px-2 font-medium ${isActive ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30" : "bg-muted text-muted-foreground border border-border/50"}`}>
                {isActive ? "Active Client" : "Client"}
              </Badge>
            </div>
            {org?.name && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{org.name}</p>
            )}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Mail className="h-3 w-3 shrink-0" /> <span className="break-all">{client.email}</span>
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
          <div className="w-full shrink-0 sm:w-64 lg:w-72">
            <p className="mb-1 text-[10px] font-medium text-muted-foreground">Organization</p>
            <Select value={selectedOrganization} onValueChange={setSelectedOrganization}>
              <SelectTrigger aria-label="Select client organization"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All organizations (consolidated)</SelectItem>
                {(financial?.organizations ?? []).map(row => <SelectItem key={row.id} value={String(row.id)}>{row.name}</SelectItem>)}
              </SelectContent>
            </Select>
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
        {financialError && <div className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">The authorized financial summary could not be loaded. No values have been replaced with zero.</div>}
        {/* ══ OVERVIEW ══ */}
        {activeTab === "overview" && (
          <div className="p-4 space-y-4">
            {txLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : financialError ? (
              <Card><CardContent className="p-6 text-sm text-destructive">The authorized financial summary could not be loaded. BookSmart will not substitute zero values.</CardContent></Card>
            ) : (
              <>
                {/* ── KPI Row ── */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  {/* 1. Financial Health Score */}
                  <Card className="bg-card border-border/60">
                    <CardContent className="p-3 flex flex-col gap-1.5">
                      <p className="text-[10px] text-muted-foreground font-medium">Financial Health Score ⓘ</p>
                      <div className="flex items-end gap-2">
                        {healthScore === null ? <div className="py-3 text-xs text-muted-foreground">More data needed</div> : <CircularScore score={healthScore} max={100} label={healthLabel} color={healthColor} size={72} />}
                        <div className="pb-1">
                          <p className="text-[10px]" style={{ color: healthColor }}>{healthLabel}</p>
                          <p className="text-[9px] text-muted-foreground">financial-health-v1</p>
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
                        {changeText(financial?.changes.cash_movement)}
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
                        <ArrowUpRight className="h-3 w-3" /> {changeText(financial?.changes.revenue)}
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
                        <TrendingDown className="h-3 w-3" /> {changeText(financial?.changes.expenses)}
                      </div>
                    </CardContent>
                  </Card>

                  {/* 5. Tax Readiness Score */}
                  <Card className="bg-card border-border/60">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-muted-foreground font-medium mb-1">Tax Readiness Score ⓘ</p>
                      <p className="text-sm font-semibold text-muted-foreground">Not configured</p>
                      <p className="text-[9px] text-muted-foreground mt-1">Tax strategy, reserve settings, and filing schedule are required.</p>
                    </CardContent>
                  </Card>

                  {/* 6. Top Deduction Opportunities */}
                  <Card className="bg-card border-border/60">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-muted-foreground font-medium mb-1">Top Deduction Opportunities</p>
                      <p className="text-[19px] font-bold leading-tight text-primary">{strategies.length ? fmt(totalSavings) : "More data needed"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{strategies.length ? "Estimated by saved tax strategies" : "No saved tax strategies"}</p>
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
                          { label: "Revenue", value: totalRevenue, pct: changeText(financial?.changes.revenue), pctColor: "text-muted-foreground", icon: <div className="w-6 h-6 rounded-md bg-indigo-500/15 flex items-center justify-center shrink-0"><ArrowUpRight className="h-3 w-3 text-indigo-500" /></div> },
                          { label: "Expenses", value: totalExpenses, pct: changeText(financial?.changes.expenses), pctColor: "text-muted-foreground", icon: <div className="w-6 h-6 rounded-md bg-rose-500/10 flex items-center justify-center shrink-0"><ArrowDownRight className="h-3 w-3 text-rose-400" /></div> },
                          { label: "Net Profit", value: netProfit, pct: changeText(financial?.changes.net_income), pctColor: "text-muted-foreground", icon: <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><DollarSign className="h-3 w-3 text-primary" /></div> },
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
                          </div>
                        </div>
                        <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" /> {financial?.last_transaction_at ? `Latest transaction ${new Date(financial.last_transaction_at).toLocaleString()}` : "No approved transactions"}
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
                      <CardContent className="px-4 pb-3"><p className="text-sm font-semibold">Not configured</p><p className="mt-1 text-xs text-muted-foreground">A score will be available after the client configures a tax strategy, reserve settings, and filing schedule.</p></CardContent>
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
                              <p className="text-xs font-semibold text-emerald-500">{fmt(moneyIn)}</p>
                              <p className="text-[9px] text-muted-foreground">Cash In</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-rose-400">{fmt(moneyOut)}</p>
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
                      <CardContent className="px-4 pb-3"><p className="text-xs text-muted-foreground">Deadlines will appear after a verified filing schedule is configured for this client.</p></CardContent>
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
          financialError ? <Card className="m-4"><CardContent className="p-6 text-sm text-destructive">The authorized financial summary could not be loaded. BookSmart will not substitute zero values.</CardContent></Card> : <div className="p-4 space-y-4">
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
                    <p className="text-[10px] text-muted-foreground mt-0.5">Year to date</p>
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
        {activeTab === "cash-planning" && (
          <div className="space-y-4 p-4">
            <Card className="border-border/60 bg-card"><CardContent className="flex items-start gap-3 p-5"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-500" /><div><p className="font-semibold">Client-controlled planning data</p><p className="text-sm text-muted-foreground">This view is read-only. Values are scoped to the selected organization and do not change accounting records.</p></div></CardContent></Card>
            {planningLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : planningError ? <Card><CardContent className="p-6 text-sm text-destructive">The authorized planning summary could not be loaded. No values have been substituted.</CardContent></Card> : <div className="space-y-4">{(planning?.results ?? []).map(result => <Card key={result.organization.id} className="overflow-hidden border-border/60 bg-card"><CardHeader className="border-b bg-muted/20"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-base">{result.organization.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{result.verified_cash.available && result.verified_cash.refreshed_at ? `Verified cash ${fmt(result.verified_cash.amount ?? 0)} · refreshed ${new Date(result.verified_cash.refreshed_at).toLocaleString()}` : "Verified cash is unavailable or stale"}</p></div><Badge variant="outline">Read only</Badge></div></CardHeader><CardContent className="space-y-5 p-4 sm:p-6"><div className="grid gap-3 md:grid-cols-3"><CpaPlanningMetric title="Safe to Spend" ready={result.readiness.safe_to_spend.available} value={result.readiness.safe_to_spend.safeToSpend} detail={result.readiness.safe_to_spend.shortfall ? `${fmt(result.readiness.safe_to_spend.shortfall)} shortfall` : undefined} /><CpaPlanningMetric title="Remaining Tax Reserve" ready={result.readiness.tax_reserve.available} value={result.readiness.tax_reserve.remainingReserve ?? undefined} /><CpaPlanningMetric title="30-Day Ending Cash" ready={result.readiness.forecast.available} value={result.readiness.forecast.endingCash} detail={result.readiness.forecast.shortfall ? `${fmt(result.readiness.forecast.shortfall)} maximum shortfall${forecastShortfallDate(result.readiness.forecast) ? ` on ${new Date(`${forecastShortfallDate(result.readiness.forecast)}T00:00:00`).toLocaleDateString()}` : ""}` : result.readiness.forecast.lowestBalance != null ? `Lowest point ${fmt(result.readiness.forecast.lowestBalance)}` : undefined} /></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved planning inputs</p><div className="grid gap-2 sm:grid-cols-2">{result.inputs.items.length ? result.inputs.items.map(item => <div key={item.id} className="rounded-lg border p-3"><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{item.item_type.replaceAll("_", " ")} · {new Date(`${item.due_date}T00:00:00`).toLocaleDateString()} · {item.recurrence}{item.amount == null ? "" : ` · ${fmt(item.amount)}`}</p></div>) : <p className="text-sm text-muted-foreground sm:col-span-2">No dated planning items configured.</p>}</div></div></CardContent></Card>)}</div>}
          </div>
        )}

        {activeTab === "tax-readiness" && (
          <div className="p-4 space-y-4">
            <Card className="bg-card border-border/60">
              <CardContent className="p-6 flex flex-col items-center text-center gap-3"><ShieldCheck className="h-10 w-10 text-muted-foreground" /><div><p className="text-lg font-bold">Tax readiness is not configured</p><p className="text-sm text-muted-foreground">BookSmart needs a verified tax strategy, reserve settings, and filing schedule before calculating a score.</p></div></CardContent>
            </Card>
            <Card className="bg-card border-border/60">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Available system information</CardTitle></CardHeader>
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
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

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

  const clientIds = useMemo(
    () => [...new Set(orders.filter(o => isActiveCpaEngagement(o.status)).map(o => o.user_id))],
    [orders],
  );

  const [clientMap, setClientMap] = useState<Record<number, UserRow>>({});
  useEffect(() => {
    const ids = clientIds.filter(Boolean);
    if (!ids.length) return;
    supabase
      .from("users")
        .select("id,first_name,last_name,email,img_url")
      .in("id", ids)
      .then(({ data, error }) => {
        if (error) { console.error("[CpaClients] users query error:", error.message); return; }
        if (!data) return;
        const m: Record<number, UserRow> = {};
        for (const u of data) m[u.id] = u;
        setClientMap(m);
      });
  }, [clientIds]);

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
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
      {/* ── Left: client list (collapsible) ── */}
      <div
        className={`min-h-0 min-w-0 flex-col bg-card/30 transition-all duration-300 lg:shrink-0 lg:border-r lg:border-border/60 ${
          mobileDetailOpen ? "hidden lg:flex" : "flex"
        } ${
          sidebarOpen
            ? "w-full lg:w-[240px] xl:w-[288px]"
            : "w-full lg:w-0 lg:overflow-hidden lg:border-r-0"
        }`}
      >
        <div className="flex h-full min-h-0 w-full flex-col lg:w-[240px] xl:w-[288px]">
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
                  {clients.length === 0 ? "No active clients yet. Clients appear after an engagement is accepted." : "No clients match your search."}
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
                      onClick={() => {
                        setSelectedClientId(client.id);
                        setMobileDetailOpen(true);
                      }}
                      className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-3 ${
                        isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-card/60 border-l-2 border-l-transparent"
                      }`}
                    >
                      <Avatar className="h-9 w-9 rounded-xl">
                        {client.img_url && <AvatarImage src={client.img_url} alt={`${fullName(client)} profile`} className="rounded-xl object-cover" />}
                        <AvatarFallback className={`rounded-xl text-xs font-bold ${
                          isSelected ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"
                        }`}>{initials(client)}</AvatarFallback>
                      </Avatar>
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
      <div
        className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
          mobileDetailOpen ? "flex" : "hidden lg:flex"
        }`}
      >
        {/* Toggle bar */}
        <div className="hidden items-center gap-2 border-b border-border/40 bg-card/20 px-3 py-2 shrink-0 lg:flex">
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(v => !v)}
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2">
            {sidebarOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
            {sidebarOpen ? "Hide clients" : "Show clients"}
          </Button>
          {selectedClient && !sidebarOpen && (
            <div className="flex items-center gap-2 ml-1">
              <Avatar className="h-6 w-6 rounded-lg">
                {selectedClient.img_url && <AvatarImage src={selectedClient.img_url} alt={`${fullName(selectedClient)} profile`} className="rounded-lg object-cover" />}
                <AvatarFallback className="rounded-lg bg-primary/15 text-[10px] font-bold text-primary">{initials(selectedClient)}</AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium">{fullName(selectedClient)}</span>
              {clients.length > 1 && <span className="text-xs text-muted-foreground">· {clients.length} clients total</span>}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {selectedClient ? (
            <ClientDetailPanel
              client={selectedClient}
              orders={orders}
              onBack={() => {
                setMobileDetailOpen(false);
                setSidebarOpen(true);
              }}
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
