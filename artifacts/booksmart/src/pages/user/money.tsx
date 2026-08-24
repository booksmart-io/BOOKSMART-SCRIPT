import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowDown, ArrowRight, ArrowUp, FileBarChart, Landmark, Loader2 } from "lucide-react";
import { useMonitoringOrganization } from "@/hooks/use-monitoring-organization";
import { SpendingDonut } from "@/components/monitoring/monitoring-visuals";
import { authenticatedApi, apiErrorMessage } from "@/lib/authenticated-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContractorMoneySummary } from "@/components/monitoring/contractor-money-summary";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
type BalanceAccount = { account_id: string; name: string; mask: string | null; type: string | null; subtype: string | null; institution_name: string | null; current: number | null; available: number | null; currency: string; change_amount: number; change_percent: number | null };
type CashFlowPoint = { key: string; label: string; value: number; moneyIn?: number; moneyOut?: number };
type SpendingGroup = { key: string; label: string; value: number };
type CanonicalVisuals = { cashFlowBars: { mode: "daily" | "statement_sections"; points: CashFlowPoint[] }; spendingBreakdown: SpendingGroup[] };
type CanonicalMoneySummary = { period: { start: string; end: string }; calculationVersion: "financial-summary-v2"; source: "transactions" | "uploaded_statement"; revenue: number; accountingExpenses: number; netIncome: number; moneyIn: number; moneyOut: number; netCashMovement: number; visuals?: CanonicalVisuals; completeness: { approvedTransactionCount: number; complete: boolean }; warnings: string[] };

export default function Money() {
  const { data: organization, isLoading: orgLoading } = useMonitoringOrganization();
  const orgId = organization?.id ?? null;
  const { start, end } = useMemo(() => {
    const periodEnd = new Date();
    const periodStart = new Date(); periodStart.setDate(periodStart.getDate() - 29); periodStart.setHours(0, 0, 0, 0);
    return { start: periodStart, end: periodEnd };
  }, []);
  const summary = useQuery<CanonicalMoneySummary>({
    queryKey: ["canonical-money-overview", orgId, start.toISOString(), end.toISOString()], enabled: orgId !== null, retry: false,
    queryFn: async () => {
      const params = new URLSearchParams({ startInstant: start.toISOString(), endInstant: end.toISOString() });
      const response = await authenticatedApi(`/api/organizations/${orgId}/financial-summary?${params}`);
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Money overview is unavailable."));
      return response.json();
    },
  });
  const balances = useQuery<{ accounts: BalanceAccount[]; refreshed_at: string }>({
    queryKey: ["money-live-balances", orgId], enabled: orgId !== null, staleTime: 60_000, retry: false,
    queryFn: async () => { const response = await authenticatedApi(`/api/plaid/balances?org_id=${orgId}`); if (!response.ok) throw new Error("Live balances are unavailable."); return response.json(); },
  });
  if (orgLoading || summary.isLoading) return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (!orgId || !summary.data) return <div className="mx-auto max-w-3xl p-8"><Card><CardContent className="space-y-3 p-6"><CardTitle>Money overview is unavailable</CardTitle><p className="text-sm text-muted-foreground">BookSmart will not substitute independently calculated totals. No accounting data was changed.</p><Button asChild variant="outline"><Link href="/user/reports">Open financial reports</Link></Button></CardContent></Card></div>;
  const canonical = summary.data;
  const visuals: CanonicalVisuals = canonical.visuals ?? {
    cashFlowBars: { mode: "statement_sections", points: [{ key: "net", label: "Net", value: canonical.netCashMovement }] },
    spendingBreakdown: canonical.accountingExpenses > 0 ? [{ key: "total", label: "Accounting expenses", value: canonical.accountingExpenses }] : [],
  };
  const balanceAccounts = balances.data?.accounts ?? [];
  const isDebt = (account: BalanceAccount) => ["credit", "loan"].includes(String(account.type));
  const totalCash = balanceAccounts.filter(account => !isDebt(account)).reduce((sum, account) => sum + Number(account.current ?? 0), 0);
  const totalDebt = balanceAccounts.filter(isDebt).reduce((sum, account) => sum + Math.abs(Number(account.current ?? 0)), 0);
  return <div className="money-page monitoring-page w-full max-w-none space-y-4 lg:space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold md:text-3xl">Money Overview</h1><p className="text-sm text-muted-foreground">Canonical approved activity for {organization?.name ?? "your business"} · last 30 days</p></div><Button asChild variant="outline"><Link href="/user/reports"><FileBarChart className="mr-2 h-4 w-4" />Open financial reports</Link></Button></div>
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/50 bg-background/15">
        <div className="flex items-center justify-between gap-3">
          <div><CardTitle>Cash Flow</CardTitle><CardDescription>Canonical approved activity · {canonical.source === "uploaded_statement" ? "confirmed statements" : "transactions"}</CardDescription></div>
          <BadgeLabel label="Last 30 days" />
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Money in" value={canonical.moneyIn} color="text-emerald-400" />
          <Metric label="Money out" value={canonical.moneyOut} color="text-rose-400" />
          <Metric label="Net cash flow" value={canonical.netCashMovement} color={canonical.netCashMovement >= 0 ? "text-emerald-400" : "text-rose-400"} signed />
        </div>
        <CashFlowBars data={visuals.cashFlowBars} />
      </CardContent>
    </Card>
    <ContractorMoneySummary organizationId={orgId} start={start} end={end} />
    <div className="grid items-start gap-4 xl:grid-cols-3 xl:gap-6">
      <Card><CardHeader className="p-5 pb-3"><div className="flex items-center justify-between"><div><CardTitle>Account Balances</CardTitle><CardDescription>{balances.data ? `Verified ${new Date(balances.data.refreshed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Verified institution balances"}</CardDescription></div><Landmark className="h-5 w-5 text-primary" /></div></CardHeader><CardContent className="p-5 pt-0">{balances.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : balanceAccounts.length > 0 ? <><div className="mb-4 grid grid-cols-2 gap-4"><Metric label="Total cash" value={totalCash} color="text-sky-300" /><Metric label="Total debt" value={totalDebt} color="text-rose-400" /></div><div className="divide-y divide-border/60 rounded-lg border">{balanceAccounts.map(account => { const debt = isDebt(account); const value = Number(account.current ?? account.available ?? 0); return <div key={account.account_id} className="flex items-center gap-2.5 px-3 py-2.5"><div className="rounded-md bg-muted p-2"><Landmark className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{account.name}{account.mask ? ` (•••• ${account.mask})` : ""}</p><p className="truncate text-[10px] text-muted-foreground">{account.institution_name ?? account.subtype ?? account.type ?? "Connected account"}</p></div><p className={`text-sm font-semibold ${debt ? "text-rose-400" : "text-foreground"}`}>{debt ? "−" : ""}{money.format(Math.abs(value))}</p><BalanceTrend percent={account.change_percent} /><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" /></div>; })}</div></> : <div className="flex items-center gap-3 rounded-lg border p-4"><Landmark className="h-5 w-5 text-primary" /><div className="flex-1"><p className="font-medium">{balances.isError ? "Could not refresh balances" : "No connected balances yet"}</p><p className="text-sm text-muted-foreground">Connect or refresh an account to show verified balances here.</p></div><Button asChild size="sm" variant="outline"><Link href="/user/reports?action=accounts">Connect</Link></Button></div>}</CardContent></Card>
      <SpendingBreakdown groups={visuals.spendingBreakdown} total={canonical.accountingExpenses} />
      <Card><CardHeader className="p-5 pb-3"><CardTitle>Accounting Summary</CardTitle><CardDescription>Canonical financial-summary v2</CardDescription></CardHeader><CardContent className="space-y-4 p-5 pt-0"><div className="grid grid-cols-2 gap-4"><Metric label="Revenue" value={canonical.revenue} color="text-emerald-400" /><Metric label="Accounting expenses" value={canonical.accountingExpenses} color="text-rose-400" /><Metric label="Net income" value={canonical.netIncome} color={canonical.netIncome >= 0 ? "text-emerald-400" : "text-rose-400"} signed /><div><p className="text-xs text-muted-foreground">Approved records</p><p className="mt-1 text-lg font-bold sm:text-2xl">{canonical.completeness.approvedTransactionCount}</p></div></div>{!canonical.completeness.complete && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">Some inputs need review. Canonical warnings: {canonical.warnings.join(", ").replaceAll("_", " ")}.</p>}<Button asChild variant="outline" className="w-full"><Link href="/user/reports">View detailed financial reports<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>
    </div>
  </div>;
}

function Metric({ label, value, color, signed = false }: { label: string; value: number; color: string; signed?: boolean }) { return <div className="rounded-xl border border-border/60 bg-background/25 px-4 py-3"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-bold tracking-tight sm:text-2xl ${color}`}>{signed && value < 0 ? `−${money.format(Math.abs(value))}` : money.format(value)}</p></div>; }
function BadgeLabel({ label }: { label: string }) { return <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{label}</span>; }
function CashFlowBars({ data }: { data: CanonicalVisuals["cashFlowBars"] }) {
  const points = data.points;
  if (points.length === 0) return <div className="flex h-44 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">No cash-flow activity in this period.</div>;
  const daily = data.mode === "daily" && points.some(point => point.moneyIn !== undefined || point.moneyOut !== undefined);
  const max = Math.max(1, ...points.flatMap(point => daily ? [point.moneyIn ?? 0, point.moneyOut ?? 0] : [Math.abs(point.value)]));
  return <section aria-label={daily ? "Daily cash movement" : "Cash-flow statement sections"} className="rounded-xl border border-border/60 bg-background/20 p-4 sm:p-5">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold">{daily ? "Daily cash movement" : "Cash-flow composition"}</h3><p className="mt-0.5 text-xs text-muted-foreground">{daily ? "Approved inflows and outflows on active days" : "Net movement by statement section"}</p></div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">{daily ? <><ChartLegend color="#10d99a" label="Money in" /><ChartLegend color="#ff4164" label="Money out" /></> : <><ChartLegend color="#10d99a" label="Positive" /><ChartLegend color="#ff4164" label="Negative" /></>}</div>
    </div>
    <div className="grid grid-cols-[48px_1fr] gap-3">
      <div className="flex h-60 flex-col justify-between py-1 text-right text-[10px] text-muted-foreground sm:h-64"><span>{compactMoney(max)}</span><span>$0</span><span>−{compactMoney(max)}</span></div>
      <div className="min-w-0">
        <div className="relative flex h-60 gap-2 border-y border-dashed border-border/50 sm:h-64">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-border/80" />
          {points.map(point => {
            const moneyIn = daily ? point.moneyIn ?? 0 : Math.max(0, point.value);
            const moneyOut = daily ? point.moneyOut ?? 0 : Math.max(0, -point.value);
            return <div key={point.key} className="group relative z-10 flex min-w-0 flex-1 flex-col" title={`${point.label} · In ${money.format(moneyIn)} · Out ${money.format(moneyOut)} · Net ${money.format(point.value)}`}>
              <div className="flex h-1/2 items-end justify-center gap-1 pb-1"><div className="w-full max-w-7 rounded-t bg-emerald-400 shadow-[0_0_12px_rgba(16,217,154,0.16)] transition-opacity group-hover:opacity-80" style={{ height: moneyIn > 0 ? `${Math.max(4, moneyIn / max * 100)}%` : 0 }} /></div>
              <div className="flex h-1/2 items-start justify-center gap-1 pt-1"><div className="w-full max-w-7 rounded-b bg-rose-500 shadow-[0_0_12px_rgba(255,65,100,0.14)] transition-opacity group-hover:opacity-80" style={{ height: moneyOut > 0 ? `${Math.max(4, moneyOut / max * 100)}%` : 0 }} /></div>
              <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-lg group-hover:block">Net {money.format(point.value)}</div>
            </div>;
          })}
        </div>
        <div className="mt-2 flex gap-2">{points.map((point, index) => <span key={point.key} className={`min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground ${points.length > 10 && index % 2 === 1 ? "hidden sm:block" : ""}`}>{point.label}</span>)}</div>
      </div>
    </div>
  </section>;
}
function ChartLegend({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />{label}</span>; }
function SpendingBreakdown({ groups, total }: { groups: SpendingGroup[]; total: number }) {
  const colors = ["#3b82f6", "#facc15", "#22c55e", "#a855f7"];
  return <Card><CardHeader className="p-5 pb-3"><CardTitle>Spending Breakdown</CardTitle><CardDescription>Canonical accounting expenses</CardDescription></CardHeader><CardContent className="p-5 pt-0"><div className="flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row"><SpendingDonut segments={groups.map((group, index) => ({ value: group.value, color: colors[index % colors.length] }))} /><div className="w-full flex-1 space-y-3">{groups.length === 0 ? <p className="text-sm text-muted-foreground">No recognized expenses in this period.</p> : groups.map((group, index) => <div key={group.key} className="grid grid-cols-[12px_1fr_auto] items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[index % colors.length] }} /><span>{group.label}</span><span className="text-right font-medium">{money.format(group.value)} <span className="text-xs font-normal text-muted-foreground">({total > 0 ? Math.round(group.value / total * 100) : 0}%)</span></span></div>)}</div></div></CardContent></Card>;
}
function compactMoney(value: number) { const sign = value < 0 ? "−" : ""; const absolute = Math.abs(value); return absolute >= 1_000_000 ? `${sign}$${(absolute / 1_000_000).toFixed(1)}m` : absolute >= 1000 ? `${sign}$${Math.round(absolute / 1000)}k` : `${sign}$${Math.round(absolute)}`; }
function BalanceTrend({ percent }: { percent: number | null }) { if (percent === null || !Number.isFinite(percent)) return <span className="w-14 text-right text-[10px] text-muted-foreground">—</span>; const up = percent >= 0; const Icon = up ? ArrowUp : ArrowDown; return <span className={`flex w-14 shrink-0 items-center justify-end gap-0.5 text-[10px] font-medium ${up ? "text-emerald-400" : "text-rose-400"}`}><Icon className="h-3 w-3" />{Math.abs(percent).toFixed(1)}%</span>; }
