import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowDown, ArrowRight, ArrowUp, Landmark, Loader2 } from "lucide-react";
import { useMonitoringOrganization } from "@/hooks/use-monitoring-organization";
import { SpendingDonut } from "@/components/monitoring/monitoring-visuals";
import { supabase } from "@/lib/supabase";
import { calculateFinancialReport, type FinancialCategory, type FinancialSubCategory, type FinancialTransaction } from "@/lib/financial-engine";
import { createFinancialSummary } from "@/lib/financial-summary";
import { trustedTransactions } from "@/lib/trusted-transactions";
import { authenticatedApi } from "@/lib/authenticated-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
type BalanceAccount = { account_id: string; name: string; mask: string | null; type: string | null; subtype: string | null; institution_name: string | null; current: number | null; available: number | null; currency: string; change_amount: number; change_percent: number | null };

export default function Money() {
  const { data: organization, isLoading: orgLoading } = useMonitoringOrganization();
  const orgId = organization?.id ?? null;
  const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 29);
  const query = useQuery({
    queryKey: ["money-overview", orgId, start.toISOString().slice(0, 10)], enabled: orgId !== null,
    queryFn: async () => {
      const [tx, categories, subCategories] = await Promise.all([
        supabase.from("transactions").select("id,title,amount,type,date_time,description,deductible,category_id,sub_category_id").eq("org_id", orgId!).gte("date_time", start.toISOString()).lte("date_time", end.toISOString()).order("date_time"),
        supabase.from("category").select("id,name"), supabase.from("sub_category").select("id,name,category_id"),
      ]);
      if (tx.error) throw tx.error; if (categories.error) throw categories.error; if (subCategories.error) throw subCategories.error;
      return { transactions: trustedTransactions("transactions", (tx.data ?? []) as FinancialTransaction[]), categories: (categories.data ?? []) as FinancialCategory[], subCategories: (subCategories.data ?? []) as FinancialSubCategory[] };
    },
  });
  const balances = useQuery<{ accounts: BalanceAccount[]; refreshed_at: string }>({
    queryKey: ["money-live-balances", orgId], enabled: orgId !== null, staleTime: 60_000, retry: false,
    queryFn: async () => {
      const response = await authenticatedApi(`/api/plaid/balances?org_id=${orgId}`);
      if (!response.ok) throw new Error("Live balances are unavailable.");
      return response.json();
    },
  });
  if (orgLoading || query.isLoading) return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (!orgId || !query.data) return <div className="mx-auto max-w-3xl p-8"><Card><CardContent className="p-6"><CardTitle>Money overview is unavailable</CardTitle><p className="mt-2 text-sm text-muted-foreground">No accounting data was changed.</p></CardContent></Card></div>;
  const report = calculateFinancialReport({ ...query.data, start, end });
  const summary = createFinancialSummary({ report });
  const days = Array.from({ length: 14 }, (_, i) => { const day = new Date(); day.setDate(day.getDate() - (13 - i)); return day.toISOString().slice(0, 10); });
  const daily = days.map(day => report.classifiedTransactions.filter(tx => tx.date_time.slice(0, 10) === day && !tx.isTransfer).reduce((sum, tx) => sum + tx.amount, 0));
  const maxBar = Math.max(1, ...daily.map(Math.abs));
  const groups = new Map<string, number>();
  for (const tx of report.classifiedTransactions.filter(tx => tx.amount < 0 && !tx.isTransfer)) {
    const label = tx.classification === "cogs" ? "Cost of sales" : tx.classification === "income_tax" ? "Taxes" : tx.classification === "other_expense" ? "Other" : "Operating";
    groups.set(label, (groups.get(label) ?? 0) + Math.abs(tx.amount));
  }
  const spending = [...groups.entries()].sort((a, b) => b[1] - a[1]);
  const colors = ["#3b82f6", "#facc15", "#22c55e", "#a855f7"];
  const balanceAccounts = balances.data?.accounts ?? [];
  const isDebt = (account: BalanceAccount) => ["credit", "loan"].includes(String(account.type));
  const totalCash = balanceAccounts.filter(account => !isDebt(account)).reduce((sum, account) => sum + Number(account.current ?? 0), 0);
  const totalDebt = balanceAccounts.filter(isDebt).reduce((sum, account) => sum + Math.abs(Number(account.current ?? 0)), 0);
  return <div className="money-page monitoring-page w-full max-w-none space-y-4 lg:space-y-6">
    <div><h1 className="text-2xl font-bold md:text-3xl">Money Overview</h1><p className="text-sm text-muted-foreground">Approved activity for {organization?.name ?? "your business"} • last 30 days</p></div>
    <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle>Cash Flow</CardTitle><CardDescription>Approved records only</CardDescription></div><BadgeLabel label="This month" /></div></CardHeader><CardContent><div className="grid grid-cols-3 gap-3 text-center"><Metric label="Money in" value={summary.moneyIn} color="text-emerald-400" /><Metric label="Money out" value={summary.moneyOut} color="text-rose-400" /><Metric label="Net cash flow" value={summary.netCashMovement} color={summary.netCashMovement >= 0 ? "text-emerald-400" : "text-rose-400"} signed /></div><div className="mt-7 grid grid-cols-[42px_1fr] gap-2"><div className="flex h-32 flex-col justify-between pb-1 text-right text-[10px] text-muted-foreground"><span>{compactMoney(maxBar)}</span><span>$0</span><span>−{compactMoney(maxBar)}</span></div><div className="relative h-40 border-b border-border/50"><div className="absolute inset-x-0 top-0 border-t border-dashed border-border/40" /><div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/70" /><div className="flex h-32 items-center gap-2">{daily.map((value, index) => <div key={days[index]} className="relative flex h-full flex-1 items-center justify-center"><div className={`absolute w-full max-w-5 rounded-sm ${value >= 0 ? "bottom-1/2 bg-emerald-500" : "top-1/2 bg-rose-500"}`} style={{ height: `${Math.max(5, Math.abs(value) / maxBar * 56)}%` }} title={`${days[index]}: ${money.format(value)}`} /></div>)}</div><div className="flex justify-between pt-1 text-[10px] text-muted-foreground"><span>{new Date(`${days[0]}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}</span><span>{new Date(`${days[4]}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}</span><span>{new Date(`${days[9]}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}</span><span>{new Date(`${days[13]}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}</span></div></div></div></CardContent></Card>
    <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
      <Card><CardHeader className="p-5 pb-3"><div className="flex items-center justify-between"><div><CardTitle>Account Balances</CardTitle><CardDescription>{balances.data ? `Verified ${new Date(balances.data.refreshed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Verified institution balances"}</CardDescription></div><Landmark className="h-5 w-5 text-primary" /></div></CardHeader><CardContent className="p-5 pt-0">{balances.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : balanceAccounts.length > 0 ? <><div className="mb-4 grid grid-cols-2 gap-4"><Metric label="Total cash" value={totalCash} color="text-sky-300" /><Metric label="Total debt" value={totalDebt} color="text-rose-400" /></div><div className="divide-y divide-border/60 rounded-lg border">{balanceAccounts.map(account => { const debt = isDebt(account); const value = Number(account.current ?? account.available ?? 0); return <div key={account.account_id} className="flex items-center gap-2.5 px-3 py-2.5"><div className="rounded-md bg-muted p-2"><Landmark className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{account.name}{account.mask ? ` (•••• ${account.mask})` : ""}</p><p className="truncate text-[10px] text-muted-foreground">{account.institution_name ?? account.subtype ?? account.type ?? "Connected account"}</p></div><p className={`text-sm font-semibold ${debt ? "text-rose-400" : "text-foreground"}`}>{debt ? "−" : ""}{money.format(Math.abs(value))}</p><BalanceTrend percent={account.change_percent} /><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" /></div>; })}</div></> : <div className="flex items-center gap-3 rounded-lg border p-4"><Landmark className="h-5 w-5 text-primary" /><div className="flex-1"><p className="font-medium">{balances.isError ? "Could not refresh balances" : "No connected balances yet"}</p><p className="text-sm text-muted-foreground">Connect or refresh an account to show verified balances here.</p></div><Button asChild size="sm" variant="outline"><Link href="/user/reports?action=accounts">Connect</Link></Button></div>}</CardContent></Card>
      <Card><CardHeader className="p-5 pb-3"><CardTitle>Spending Breakdown</CardTitle><CardDescription>Recognized accounting expenses</CardDescription></CardHeader><CardContent className="p-5 pt-0"><div className="flex flex-col items-center gap-5 sm:flex-row"><SpendingDonut segments={spending.map(([, value], index) => ({ value, color: colors[index % colors.length] }))} /><div className="w-full flex-1 space-y-3">{spending.length === 0 ? <p className="text-sm text-muted-foreground">No recognized expenses in this period.</p> : spending.map(([label, value], index) => { const pct = summary.accountingExpenses > 0 ? Math.round(value / summary.accountingExpenses * 100) : 0; return <div key={label} className="grid grid-cols-[12px_1fr_auto_auto] items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[index % colors.length] }} /><span>{label}</span><span className="text-muted-foreground">{pct}%</span><span className="w-20 text-right font-medium">{money.format(value)}</span></div>; })}</div></div><Button asChild variant="outline" className="mt-5 w-full"><Link href="/user/reports">View all accounts & transactions<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>
    </div>
  </div>;
}

function Metric({ label, value, color, signed = false }: { label: string; value: number; color: string; signed?: boolean }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-bold sm:text-2xl ${color}`}>{signed && value < 0 ? `−${money.format(Math.abs(value))}` : money.format(value)}</p></div>; }
function BadgeLabel({ label }: { label: string }) { return <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{label}</span>; }
function compactMoney(value: number) { return value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${Math.round(value)}`; }
function BalanceTrend({ percent }: { percent: number | null }) { if (percent === null || !Number.isFinite(percent)) return <span className="w-14 text-right text-[10px] text-muted-foreground">—</span>; const up = percent >= 0; const Icon = up ? ArrowUp : ArrowDown; return <span className={`flex w-14 shrink-0 items-center justify-end gap-0.5 text-[10px] font-medium ${up ? "text-emerald-400" : "text-rose-400"}`}><Icon className="h-3 w-3" />{Math.abs(percent).toFixed(1)}%</span>; }
