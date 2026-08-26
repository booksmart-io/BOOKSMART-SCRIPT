import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Activity, ArrowRight, Banknote, BriefcaseBusiness, CheckCircle2, CircleAlert, Clock3, Loader2, RefreshCw, ReceiptText, WalletCards } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loadContractorIntelligence, type ContractorJobSummary, type TrustedMetric } from "@/lib/contractor-intelligence-client";
import { loadAccountNotifications, type ActivityNotification } from "@/lib/account-notifications";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const metricText = (metric: TrustedMetric) => metric.value == null ? "Unavailable" : money.format(metric.value);
const confidenceText = (metric: TrustedMetric) => metric.confidence === "high" ? "Verified from trusted records" : metric.confidence === "unavailable" ? "More data needed" : "Estimated from available records";
const jobName = (job: ContractorJobSummary) => job.title || (job.jobNumber ? `Job #${job.jobNumber}` : "Job");

export function ContractorHomeSummary({ organizationId, start, end }: { organizationId: number; start: Date; end: Date }) {
  const query = useQuery({
    queryKey: ["contractor-home-intelligence", organizationId, start.toISOString(), end.toISOString()],
    queryFn: () => loadContractorIntelligence(organizationId, start, end), retry: false, staleTime: 60_000,
  });
  const activity = useQuery({ queryKey: ["account-notifications"], queryFn: loadAccountNotifications, retry: false, staleTime: 30_000 });
  if (query.isLoading) return <Card aria-label="Loading contractor financial intelligence"><CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" />Loading receivables, cash, and job health…</CardContent></Card>;
  if (query.isError || !query.data) return <Card className="border-amber-400/30"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Contractor financial health is temporarily unavailable</p><p className="mt-1 text-sm text-muted-foreground">Your canonical accounting summary above is unaffected.</p></div><Button size="sm" variant="outline" onClick={() => void query.refetch()}><RefreshCw className="mr-1.5 h-4 w-4" />Retry</Button></CardContent></Card>;

  const data = query.data;
  const attentionJobs = data.jobs.filter(job => ["needs_attention", "watch"].includes(job.attentionStatus));
  const trackedCosts = data.jobs.reduce((sum, job) => sum + (job.trackedCosts.value ?? 0), 0);
  const matchNotifications = (activity.data?.notifications ?? []).filter(item => item.event_type === "job_match_found" && !item.read_at);
  const attentionItems = [
    ...(data.accountsReceivable.overdueAmount.value && data.accountsReceivable.overdueAmount.value > 0 ? [{ key: "overdue", icon: Clock3, title: `${money.format(data.accountsReceivable.overdueAmount.value)} overdue`, detail: `${data.accountsReceivable.overdueInvoiceCount} invoice${data.accountsReceivable.overdueInvoiceCount === 1 ? "" : "s"} need attention`, route: "/user/money", action: "Review receivables" }] : []),
    ...(matchNotifications.length ? [{ key: "matches", icon: BriefcaseBusiness, title: `${matchNotifications.length} Jobber match${matchNotifications.length === 1 ? "" : "es"} waiting`, detail: "Confirm the job assignment to begin tracking job profitability.", route: matchNotifications[0].route || "/user/tasks", action: "Review match" }] : []),
    ...(data.cashPosition.availableBalance.value == null ? [{ key: "cash", icon: WalletCards, title: "Available cash needs verification", detail: "Refresh or connect a bank account before relying on spendable cash.", route: "/user/settings", action: "Review connection" }] : []),
    ...(attentionJobs.length ? [{ key: "jobs", icon: CircleAlert, title: `${attentionJobs.length} job${attentionJobs.length === 1 ? "" : "s"} need attention`, detail: "Tracked margin or cost conditions deserve review.", route: "/user/money", action: "Review jobs" }] : []),
  ];
  const trackedMetric: TrustedMetric = { value: trackedCosts, confidence: data.jobs.length ? "high" : "unavailable", sources: ["booksmart", "jobber"], missingInputs: data.jobs.length ? [] : ["confirmed_job_costs"] };
  const metrics = [
    { label: "Available cash", metric: data.cashPosition.availableBalance, icon: WalletCards },
    { label: "Outstanding", metric: data.accountsReceivable.totalOutstanding, icon: Banknote },
    { label: "Overdue", metric: data.accountsReceivable.overdueAmount, icon: Clock3 },
    { label: "Tracked job costs", metric: trackedMetric, icon: BriefcaseBusiness },
  ];
  const movement = [
    { label: "Revenue", value: data.revenue.value, tone: "bg-emerald-500" },
    { label: "Expenses", value: data.expenses.value, tone: "bg-rose-500" },
    { label: "Net cash", value: data.netCashMovement.value, tone: (data.netCashMovement.value ?? 0) < 0 ? "bg-rose-500" : "bg-sky-500" },
  ];
  const movementMax = Math.max(1, ...movement.map(item => Math.abs(item.value ?? 0)));
  const jobs = [...data.jobs].sort((a, b) => b.attentionScore - a.attentionScore).slice(0, 3);
  const recentActivity = (activity.data?.notifications ?? []).slice(0, 3);

  return <section className="space-y-4" aria-label="Contractor financial intelligence">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Contractor financial health</h2><p className="text-sm text-muted-foreground">What needs attention, what customers owe, and how current jobs are performing.</p></div><Button asChild size="sm" variant="ghost" className="w-full justify-between sm:w-fit sm:justify-center"><Link href="/user/money">Open Money<ArrowRight className="ml-1 h-4 w-4" /></Link></Button></div>

    {attentionItems.length > 0 ? <Card className="border-amber-400/30"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><CircleAlert className="h-5 w-5 text-amber-400" />Immediate attention</CardTitle></CardHeader><CardContent className="grid gap-2 lg:grid-cols-2">{attentionItems.map(item => <div key={item.key} className="flex flex-col gap-3 rounded-lg border bg-background/20 p-4 sm:flex-row sm:items-center"><div className="flex min-w-0 gap-3 sm:contents"><item.icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" /><div className="min-w-0 flex-1"><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.detail}</p></div></div><Button asChild size="sm" variant="outline" className="w-full sm:w-fit"><Link href={item.route}>{item.action}</Link></Button></div>)}</CardContent></Card> : <div className="flex items-start gap-3 rounded-lg border p-4 sm:items-center"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /><div><p className="font-medium">Nothing needs immediate attention</p><p className="text-sm text-muted-foreground">No overdue receivables, pending job warnings, or unverified cash issues were found.</p></div></div>}

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(item => <Card key={item.label} className="h-full"><CardContent className="flex h-full gap-3 p-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><item.icon className="h-4 w-4 text-primary" /></div><div className="min-w-0"><p className="text-xs font-medium text-muted-foreground sm:text-sm">{item.label}</p><p className="mt-1 break-words text-xl font-bold sm:text-2xl">{metricText(item.metric)}</p><p className="mt-1 text-[10px] text-muted-foreground sm:text-xs">{confidenceText(item.metric)}</p></div></CardContent></Card>)}</div>

    <div className="grid items-stretch gap-4 xl:grid-cols-2">
      <Card className="h-full"><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" />30-day money movement</CardTitle></CardHeader><CardContent className="space-y-4" role="img" aria-label="Revenue, expenses, and net cash movement for the last 30 days">{movement.map(item => <div key={item.label}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">{item.label}</span><span className="font-semibold tabular-nums">{item.value == null ? "Unavailable" : money.format(item.value)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${item.tone}`} style={{ width: item.value == null ? 0 : `${Math.max(3, Math.abs(item.value) / movementMax * 100)}%` }} /></div></div>)}</CardContent></Card>
      <Card className="flex h-full min-h-0 flex-col"><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-primary" />Who owes you</CardTitle></CardHeader><CardContent className="min-h-0 flex-1"><div className="max-h-40 space-y-2 overflow-y-auto pr-1">{data.accountsReceivable.largestCustomerBalances.length === 0 ? <Empty text="No explicit outstanding Jobber invoice balances are available." /> : data.accountsReceivable.largestCustomerBalances.map(customer => <div key={customer.customerId} className="flex items-center justify-between gap-4 rounded-lg border p-3"><div className="min-w-0"><p className="truncate font-medium">{customer.customerName || "Unnamed customer"}</p><p className="text-xs text-muted-foreground">{customer.overdue > 0 ? `${money.format(customer.overdue)} overdue` : "Not overdue"}</p></div><p className="font-semibold tabular-nums">{money.format(customer.outstanding)}</p></div>)}</div></CardContent></Card>
    </div>

    <Card><CardHeader className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"><div><CardTitle>Jobs snapshot</CardTitle><p className="mt-1 text-sm text-muted-foreground">Confirmed costs and current tracked margin—not final projected profit.</p></div><Button asChild size="sm" variant="ghost"><Link href="/user/tasks">Review matches</Link></Button></CardHeader><CardContent className="space-y-2">{jobs.length === 0 ? <Empty text="Approve a suggested transaction-to-job match to begin tracking job costs and margins." /> : jobs.map(job => <div key={job.id} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div><p className="font-medium">{jobName(job)}</p><p className="text-xs capitalize text-muted-foreground">{job.status?.replaceAll("_", " ") || "Jobber job"}</p></div><div className="grid grid-cols-2 gap-3 sm:contents"><div className="sm:text-right"><p className="text-xs text-muted-foreground">Confirmed costs</p><p className="font-semibold">{metricText(job.trackedCosts)}</p></div><div className="text-right sm:min-w-28"><p className="text-xs text-muted-foreground">Tracked margin</p><p className="font-semibold">{job.currentTrackedMargin.value == null ? "Unavailable" : `${(job.currentTrackedMargin.value * 100).toFixed(1)}%`}</p><p className={`text-xs capitalize ${job.attentionStatus === "needs_attention" ? "text-rose-400" : job.attentionStatus === "watch" ? "text-amber-400" : "text-muted-foreground"}`}>{job.attentionStatus.replaceAll("_", " ")}</p></div></div></div>)}</CardContent></Card>

    <Card><CardHeader className="flex-row items-center justify-between gap-3"><CardTitle>Recent account activity</CardTitle><span className="text-xs text-muted-foreground">Latest 3</span></CardHeader><CardContent className="space-y-2">{activity.isLoading ? <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading activity…</div> : recentActivity.length === 0 ? <Empty text="New transactions, job matches, and task updates will appear here." /> : recentActivity.map(item => <ActivityRow key={item.id} item={item} />)}</CardContent></Card>
  </section>;
}

function ActivityRow({ item }: { item: ActivityNotification }) {
  return <Link href={item.route || "/user/money"} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"><div className={`h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-muted-foreground/40" : "bg-primary"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="line-clamp-2 text-xs text-muted-foreground sm:truncate">{item.description}</p></div><span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{new Date(item.created_at).toLocaleDateString()}</span><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" /></Link>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{text}</div>;
}
