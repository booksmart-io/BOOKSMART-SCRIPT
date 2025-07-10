import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, FileText, Briefcase, Bell, MessageSquare,
  UserPlus, Link as LinkIcon, ChevronRight, ArrowUpRight, Loader2,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderRow { id: number; user_id: number; status: string; created_at: string }
interface UserRow  { id: number; first_name: string | null; last_name: string | null; email: string }
interface OrgRow   { id: number; owner_id: number; name: string | null }
interface TxRow    { id: number; org_id: number; amount: number; title: string; date_time: string }
interface DocRow   { user_id: number }
interface StratRow { user_id: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

function fullName(u: UserRow) {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
}

function healthColor(s: number) {
  if (s >= 90) return "#22c55e";
  if (s >= 70) return "#10b981";
  if (s >= 50) return "#f59e0b";
  return "#ef4444";
}
function taxColor(p: number) {
  if (p >= 80) return "#22c55e";
  if (p >= 60) return "#f59e0b";
  return "#ef4444";
}
function fmtMoney(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}
function calcBPS(txCount: number, docCount: number, hasOrg: boolean, netPositive: boolean) {
  let score = 15;
  score += Math.min(30, txCount * 3);
  score += Math.min(20, docCount * 5);
  if (hasOrg) score += 10;
  if (netPositive) score += 10;
  return Math.min(100, Math.round(score));
}
function calcTaxReadiness(docCount: number, stratCount: number, hasCompleted: boolean) {
  let s = 20;
  s += Math.min(40, docCount * 8);
  s += Math.min(25, stratCount * 5);
  if (hasCompleted) s += 15;
  return Math.min(100, s);
}
function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// ─── Health ring ──────────────────────────────────────────────────────────────

function HealthRing({ score, label }: { score: number; label: string }) {
  const r = 16, circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = healthColor(score);
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
        <svg width="40" height="40" className="-rotate-90">
          <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <span className="absolute text-[10px] font-bold" style={{ color }}>{score}</span>
      </div>
      <span className="text-[11px] font-medium" style={{ color }}>{label}</span>
    </div>
  );
}

// ─── Avg health gauge ─────────────────────────────────────────────────────────

function HealthGauge({ value }: { value: number }) {
  const r = 26, circ = 2 * Math.PI * r;
  const offset = circ * (1 - value / 100);
  return (
    <div className="relative w-14 h-14 flex items-center justify-center flex-shrink-0">
      <svg width="56" height="56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="#10b981" strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className="absolute text-sm font-bold text-emerald-400">{value}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CpaDashboard() {
  const { profile } = useAuth();
  const numericId = profile?.numericId as number | undefined;
  const [, navigate] = useLocation();
  const firstName = (profile as any)?.first_name || profile?.email?.split("@")[0] || "there";

  // ── 1. All orders for this CPA ────────────────────────────────────────────
  const { data: allOrders = [], isLoading: ordersLoading } = useQuery<OrderRow[]>({
    queryKey: ["cpa_dash_orders", numericId],
    enabled: !!numericId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, user_id, status, created_at")
        .eq("cpa_id", numericId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientUserIds = useMemo(() => [...new Set(allOrders.map(o => o.user_id))], [allOrders]);
  const pendingCount  = allOrders.filter(o => o.status === "pending").length;
  const activeCount   = allOrders.filter(o => ["active", "in_progress", "in-progress"].includes(o.status)).length;

  // ── 2. Client user profiles ───────────────────────────────────────────────
  const { data: clientUsers = [] } = useQuery<UserRow[]>({
    queryKey: ["cpa_dash_users", clientUserIds],
    enabled: clientUserIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .in("id", clientUserIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── 3. Organisations ──────────────────────────────────────────────────────
  const { data: orgs = [] } = useQuery<OrgRow[]>({
    queryKey: ["cpa_dash_orgs", clientUserIds],
    enabled: clientUserIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, owner_id, name")
        .in("owner_id", clientUserIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const orgIds = useMemo(() => orgs.map(o => o.id), [orgs]);

  // ── 4. This-month transactions ────────────────────────────────────────────
  const { data: monthTxs = [] } = useQuery<TxRow[]>({
    queryKey: ["cpa_dash_txs", orgIds],
    enabled: orgIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, org_id, amount, title, date_time")
        .in("org_id", orgIds)
        .gte("date_time", startOfMonth());
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── 5. All-time tx counts per org (for health score) ─────────────────────
  const { data: allTimeTxs = [] } = useQuery<{ org_id: number }[]>({
    queryKey: ["cpa_dash_txcount", orgIds],
    enabled: orgIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("org_id")
        .in("org_id", orgIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── 6. Document counts per user ───────────────────────────────────────────
  const { data: docRows = [] } = useQuery<DocRow[]>({
    queryKey: ["cpa_dash_docs", clientUserIds],
    enabled: clientUserIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("user_id")
        .in("user_id", clientUserIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── 7. AI strategy counts per user ───────────────────────────────────────
  const { data: stratRows = [] } = useQuery<StratRow[]>({
    queryKey: ["cpa_dash_strats", clientUserIds],
    enabled: clientUserIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_strategies")
        .select("user_id")
        .in("user_id", clientUserIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── 8. Recent transactions across all client orgs (activity feed) ─────────
  const { data: recentTxs = [] } = useQuery<TxRow[]>({
    queryKey: ["cpa_dash_recent", orgIds],
    enabled: orgIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, org_id, amount, title, date_time")
        .in("org_id", orgIds)
        .order("date_time", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Derived data ──────────────────────────────────────────────────────────

  const clientRows = useMemo(() => {
    const orgByOwner: Record<number, OrgRow> = {};
    for (const o of orgs) orgByOwner[o.owner_id] = o;

    const txByOrg: Record<number, TxRow[]> = {};
    for (const t of monthTxs) { if (!txByOrg[t.org_id]) txByOrg[t.org_id] = []; txByOrg[t.org_id].push(t); }

    const allTxCountByOrg: Record<number, number> = {};
    for (const t of allTimeTxs) allTxCountByOrg[t.org_id] = (allTxCountByOrg[t.org_id] ?? 0) + 1;

    const docCountByUser: Record<number, number> = {};
    for (const d of docRows) docCountByUser[d.user_id] = (docCountByUser[d.user_id] ?? 0) + 1;

    const stratCountByUser: Record<number, number> = {};
    for (const s of stratRows) stratCountByUser[s.user_id] = (stratCountByUser[s.user_id] ?? 0) + 1;

    const ordersByUser: Record<number, OrderRow[]> = {};
    for (const o of allOrders) { if (!ordersByUser[o.user_id]) ordersByUser[o.user_id] = []; ordersByUser[o.user_id].push(o); }

    return clientUsers.map((u, i) => {
      const org = orgByOwner[u.id];
      const orgTxs = org ? (txByOrg[org.id] ?? []) : [];
      const allTxCount = org ? (allTxCountByOrg[org.id] ?? 0) : 0;
      const docCount = docCountByUser[u.id] ?? 0;
      const stratCount = stratCountByUser[u.id] ?? 0;
      const userOrders = ordersByUser[u.id] ?? [];

      const net = orgTxs.reduce((s, t) => s + t.amount, 0);
      const bps = calcBPS(allTxCount, docCount, !!org, net > 0);
      const taxR = calcTaxReadiness(docCount, stratCount, userOrders.some(o => o.status === "completed"));
      const thisMonth = orgTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);

      const name = fullName(u);
      const healthLabel = bps >= 90 ? "Excellent" : bps >= 70 ? "Good" : bps >= 50 ? "Fair" : "Poor";

      return {
        id: u.id,
        name,
        email: u.email,
        initials: name.slice(0, 2).toUpperCase(),
        color: AVATAR_COLORS[i % AVATAR_COLORS.length],
        business: org?.name ?? "—",
        healthScore: bps,
        healthLabel,
        thisMonth,
        taxReadiness: taxR,
      };
    });
  }, [clientUsers, orgs, monthTxs, allTimeTxs, docRows, stratRows, allOrders]);

  const avgHealth = clientRows.length
    ? Math.round(clientRows.reduce((s, c) => s + c.healthScore, 0) / clientRows.length)
    : 0;

  const healthDonut = useMemo(() => {
    const total = clientRows.length;
    if (total === 0) return [];
    const excellent = clientRows.filter(c => c.healthScore >= 90).length;
    const good      = clientRows.filter(c => c.healthScore >= 70 && c.healthScore < 90).length;
    const fair      = clientRows.filter(c => c.healthScore >= 50 && c.healthScore < 70).length;
    const poor      = clientRows.filter(c => c.healthScore < 50).length;
    return [
      { name: "Excellent (90–100)", value: excellent, color: "#22c55e" },
      { name: "Good (70–89)",       value: good,      color: "#3b82f6" },
      { name: "Fair (50–69)",       value: fair,      color: "#f59e0b" },
      { name: "Needs Attention",    value: poor,      color: "#ef4444" },
    ].filter(d => d.value > 0);
  }, [clientRows]);

  const activityItems = useMemo(() => {
    const orgByIdMap: Record<number, OrgRow> = {};
    for (const o of orgs) orgByIdMap[o.id] = o;

    const userByIdMap: Record<number, UserRow> = {};
    for (const u of clientUsers) userByIdMap[u.id] = u;

    return recentTxs.map((tx, i) => {
      const org  = orgByIdMap[tx.org_id];
      const user = org ? userByIdMap[org.owner_id] : undefined;
      const name = user ? fullName(user) : (org?.name ?? "Client");
      const action = tx.amount > 0
        ? `Income: ${fmtMoney(tx.amount)}`
        : `Expense: ${fmtMoney(Math.abs(tx.amount))}`;
      const time = formatDistanceToNow(new Date(tx.date_time), { addSuffix: true });
      return {
        initials: name.slice(0, 2).toUpperCase(),
        color: AVATAR_COLORS[i % AVATAR_COLORS.length],
        business: org?.name ?? name,
        action: tx.title || action,
        time,
      };
    });
  }, [recentTxs, orgs, clientUsers]);

  const handleCopyReferral = () => {
    const link = `${window.location.origin}/signup?ref=${numericId}`;
    navigator.clipboard.writeText(link)
      .then(() => toast.success("Referral link copied!"))
      .catch(() => toast.error("Could not copy link"));
  };

  const totalClients = clientRows.length;
  const avgHealthLabel = avgHealth >= 90 ? "Excellent" : avgHealth >= 70 ? "Good" : avgHealth >= 50 ? "Fair" : "Poor";

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Good {getGreeting()}, {firstName} 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Here's what's happening with your clients today.</p>
        </div>
        {ordersLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>

      {/* ── KPI Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Card className="border-border/60 bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Total Clients</p>
              <p className="text-2xl font-bold text-white">{totalClients}</p>
              <p className="text-[10px] text-muted-foreground mt-1">From your orders</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-teal-500/15 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-teal-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Clients You Referred</p>
              <p className="text-2xl font-bold text-white">{totalClients}</p>
              <p className="text-[10px] text-muted-foreground mt-1">All via referral</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-purple-500/15 flex items-center justify-center flex-shrink-0">
              <UserPlus className="h-5 w-5 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Active Engagements</p>
              <p className="text-2xl font-bold text-white">{activeCount}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Active orders</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-teal-500/15 flex items-center justify-center flex-shrink-0">
              <Briefcase className="h-5 w-5 text-teal-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Avg. Health Score</p>
              <p className="text-2xl font-bold" style={{ color: avgHealth > 0 ? healthColor(avgHealth) : "#EAF2FF" }}>
                {avgHealth > 0 ? avgHealth : "—"}
              </p>
              <p className="text-[10px] mt-1" style={{ color: avgHealth > 0 ? healthColor(avgHealth) : "#7F96BA" }}>
                {avgHealth > 0 ? avgHealthLabel : "No data yet"}
              </p>
            </div>
            <HealthGauge value={avgHealth} />
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card cursor-pointer hover:bg-muted/80 transition-colors"
          onClick={() => navigate("/cpa/orders")}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Requests</p>
              <p className="text-2xl font-bold text-white">{pendingCount}</p>
              <p className="text-[10px] text-amber-400 mt-1">Awaiting action</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-orange-500/15 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-orange-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main 2-col layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* ── Left 2/3 ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Clients table */}
          <Card className="border-border/60 bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-white">Your Referred Clients</CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Track the progress and financial health of your referred clients.</p>
                </div>
                <button onClick={() => navigate("/cpa/clients")}
                  className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-0.5 whitespace-nowrap flex-shrink-0">
                  View All Clients <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Table header */}
              <div className="grid gap-2 px-4 pb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/40"
                style={{ gridTemplateColumns: "1.8fr 1.6fr 1.4fr 1.2fr 1.3fr 72px" }}>
                <span>Client</span><span>Business</span><span>Health Score</span>
                <span>This Month</span><span>Tax Readiness</span><span>Actions</span>
              </div>

              {ordersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : clientRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No clients yet.</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">Share your referral link to get started.</p>
                </div>
              ) : (
                clientRows.slice(0, 8).map((client) => (
                  <div key={client.id}
                    className="grid gap-2 px-4 py-3 border-b border-border/30 hover:bg-foreground/[0.02] transition-colors items-center last:border-0"
                    style={{ gridTemplateColumns: "1.8fr 1.6fr 1.4fr 1.2fr 1.3fr 72px" }}>
                    {/* Client */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                        style={{ background: client.color }}>
                        {client.initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{client.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{client.email}</p>
                      </div>
                    </div>
                    {/* Business */}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{client.business}</p>
                    </div>
                    {/* Health */}
                    <HealthRing score={client.healthScore} label={client.healthLabel} />
                    {/* This Month */}
                    <div>
                      <p className="text-xs font-semibold text-foreground">{fmtMoney(client.thisMonth)}</p>
                      <p className="text-[10px] text-muted-foreground">income</p>
                    </div>
                    {/* Tax Readiness */}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${client.taxReadiness}%`, background: taxColor(client.taxReadiness) }} />
                        </div>
                        <span className="text-[10px] font-semibold w-7 text-right" style={{ color: taxColor(client.taxReadiness) }}>
                          {client.taxReadiness}%
                        </span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-foreground/5 transition-colors"
                        title="Notify"><Bell className="h-3.5 w-3.5" /></button>
                      <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-foreground/5 transition-colors"
                        title="Message" onClick={() => navigate("/cpa/chat")}><MessageSquare className="h-3.5 w-3.5" /></button>
                      <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-foreground/5 transition-colors"
                        title="Documents" onClick={() => navigate("/cpa/documents")}><FileText className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Bottom 3 cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Refer a New Client */}
            <Card className="border-border/60 bg-card">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-white mb-1">Refer a New Client</h3>
                <p className="text-[11px] text-muted-foreground mb-4 leading-relaxed">
                  Invite a client to Booksmart and gain full visibility into their financial health.
                </p>
                <div className="flex items-center justify-center gap-3 mb-4 py-2">
                  <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
                    <Users className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="w-5 h-0.5 rounded bg-[#FFC72B]/60" />
                    <div className="w-5 h-0.5 rounded bg-[#FFC72B]/40" />
                  </div>
                  <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                    <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                  </div>
                </div>
                <Button size="sm"
                  className="w-full gap-1.5 text-xs bg-muted hover:bg-muted border border-border text-white"
                  onClick={handleCopyReferral}>
                  <LinkIcon className="h-3.5 w-3.5" /> Create Referral Link
                </Button>
              </CardContent>
            </Card>

            {/* How it works */}
            <Card className="border-border/60 bg-card">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-white mb-3">How it works</h3>
                <div className="space-y-3">
                  {[
                    { n: 1, title: "Refer your client", desc: "Send them your unique referral link." },
                    { n: 2, title: "They join Booksmart", desc: "They connect their business and financial data." },
                    { n: 3, title: "You get full visibility", desc: "Monitor progress, health, and key insights." },
                  ].map(step => (
                    <div key={step.n} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-[#FFC72B] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-primary-foreground">{step.n}</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{step.title}</p>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate("/cpa/referrals")}
                  className="text-[11px] text-teal-400 hover:text-teal-300 mt-3 flex items-center gap-0.5">
                  Learn more about referrals <ChevronRight className="h-3 w-3" />
                </button>
              </CardContent>
            </Card>

            {/* Booksmart Tip */}
            <Card className="border-border/60 bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded bg-primary/15 flex items-center justify-center">
                    <span className="text-primary text-sm leading-none">⬡</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white">Booksmart Tip</h3>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">
                  Clients with up-to-date books are 3× more likely to be tax-ready and maximize deductions.
                </p>
                <button onClick={() => navigate("/cpa/documents")}
                  className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-0.5">
                  Share documents checklist <ChevronRight className="h-3 w-3" />
                </button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Right 1/3 ── */}
        <div className="space-y-4">

          {/* Client Health Overview */}
          <Card className="border-border/60 bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-white">Client Health Overview</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {totalClients === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">No clients yet</div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      <ResponsiveContainer width={110} height={110}>
                        <PieChart>
                          <Pie data={healthDonut} cx="50%" cy="50%" innerRadius={30} outerRadius={50}
                            paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}>
                            {healthDonut.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                            itemStyle={{ color: "#EAF2FF" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-lg font-bold text-white">{totalClients}</span>
                        <span className="text-[9px] text-muted-foreground leading-tight text-center">Total<br />Clients</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-2 min-w-0">
                      {healthDonut.map(d => (
                        <div key={d.name} className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                            <span className="text-[9px] text-muted-foreground leading-tight truncate">{d.name}</span>
                          </div>
                          <span className="text-[10px] font-semibold text-foreground flex-shrink-0">
                            {d.value} ({Math.round(d.value / totalClients * 100)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => navigate("/cpa/insights")}
                    className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-0.5 mt-3">
                    View full report <ChevronRight className="h-3 w-3" />
                  </button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Recent Client Activity */}
          <Card className="border-border/60 bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-white">Recent Client Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {activityItems.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-xs px-4 text-center">
                  {orgIds.length === 0 ? "No client activity yet." : "No recent transactions found."}
                </div>
              ) : (
                <div className="divide-y divide-[#123469]/30">
                  {activityItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-foreground/[0.02] transition-colors">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                        style={{ background: item.color }}>
                        {item.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{item.business}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{item.action}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">{item.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
