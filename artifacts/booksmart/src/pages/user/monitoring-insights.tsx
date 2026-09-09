import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, CircleAlert, Clock3, Inbox, Loader2, PieChart, ShieldAlert, TrendingUp } from "lucide-react";
import { useMonitoringOrganization } from "@/hooks/use-monitoring-organization";
import { loadMonitoring, updateSignal, type MonitoringSignal } from "@/lib/monitoring-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Sparkline } from "@/components/monitoring/monitoring-visuals";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ContractorInsightsSummary } from "@/components/monitoring/contractor-insights-summary";
import { InsightEvidenceMap } from "@/components/monitoring/insight-evidence-map";

const insightTabs = ["all", "growth", "expenses", "cash_flow", "bookkeeping", "tax", "risks"] as const;
type InsightTab = (typeof insightTabs)[number];
type SignalStatus = MonitoringSignal["status"];

function belongsToTab(signal: MonitoringSignal, tab: InsightTab) {
  const text = `${signal.category} ${signal.title}`.toLowerCase();
  if (tab === "all") return true;
  if (tab === "tax") return text.includes("tax");
  if (tab === "expenses") return signal.category === "expenses";
  if (tab === "cash_flow") return signal.category === "cash_flow";
  if (tab === "bookkeeping") return signal.category === "bookkeeping" || signal.category === "connections";
  if (tab === "risks") return ["high", "critical"].includes(signal.severity) || text.includes("cash") || text.includes("risk");
  return text.includes("revenue") || text.includes("expense") || signal.severity === "positive";
}

function visualFor(signal: MonitoringSignal) {
  if (signal.severity === "positive") return { color: "#22c55e", border: "border-emerald-400/60", bg: "bg-emerald-500/20", badge: "border-emerald-400/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", label: "Positive", Icon: TrendingUp };
  if (["high", "critical"].includes(signal.severity)) return { color: "#f43f5e", border: "border-rose-400/60", bg: "bg-rose-500/20", badge: "border-rose-400/50 bg-rose-500/15 text-rose-700 dark:text-rose-300", label: signal.severity, Icon: CircleAlert };
  if (signal.severity === "medium") return { color: "#f59e0b", border: "border-amber-400/55", bg: "bg-amber-500/20", badge: "border-amber-400/50 bg-amber-500/15 text-amber-700 dark:text-amber-300", label: "Caution", Icon: Clock3 };
  return { color: "#3b82f6", border: "border-blue-400/40", bg: "bg-blue-500/15", badge: "border-blue-400/40 bg-blue-500/10 text-blue-700 dark:text-blue-300", label: signal.severity, Icon: PieChart };
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function MonitoringInsights() {
  const { data: organization, isLoading: orgLoading } = useMonitoringOrganization();
  const orgId = organization?.id ?? null;
  const [tab, setTab] = useState<InsightTab>("all");
  const [status, setStatus] = useState<SignalStatus>("active");
  const [pageTab, setPageTab] = useState<"overview" | "feed">("overview");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const monitoring = useQuery({ queryKey: ["monitoring-projection", orgId], enabled: orgId !== null, queryFn: () => loadMonitoring(orgId!), retry: false, refetchOnMount: "always", refetchOnWindowFocus: true });
  const transition = useMutation({
    mutationFn: ({ signal, action }: { signal: MonitoringSignal; action: "dismiss" | "resolve" | "reopen" }) => updateSignal(orgId!, signal.id, action),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["monitoring-projection", orgId] }); toast({ title: "Insight updated" }); },
    onError: error => toast({ title: "Could not update insight", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });

  if (orgLoading || monitoring.isLoading) return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (!orgId || monitoring.isError) return <div className="mx-auto max-w-3xl p-8"><Card><CardContent className="p-6"><CardTitle>Insights are unavailable</CardTitle><p className="mt-2 text-sm text-muted-foreground">Restart the local API server and try again.</p></CardContent></Card></div>;

  const allSignals = monitoring.data?.signals ?? [];
  const signals = allSignals.filter(signal => signal.status === status && belongsToTab(signal, tab));
  const summary = {
    active: allSignals.filter(signal => signal.status === "active").length,
    urgent: allSignals.filter(signal => signal.status === "active" && ["high", "critical"].includes(signal.severity)).length,
    cpa: allSignals.filter(signal => signal.status === "active" && signal.requires_cpa_review).length,
    resolved: allSignals.filter(signal => signal.status === "resolved").length,
  };
  const categoryCount = (item: InsightTab) => allSignals.filter(signal => signal.status === status && belongsToTab(signal, item)).length;

  return <div className="monitoring-page w-full max-w-none space-y-4 lg:space-y-6">
    <div><h1 className="text-2xl font-bold md:text-3xl">Insights</h1><p className="text-sm text-muted-foreground">Smart insights for your business</p></div>

    <Tabs value={pageTab} onValueChange={value => setPageTab(value as typeof pageTab)} className="space-y-4">
      <TabsList className="grid h-11 w-full max-w-md grid-cols-2">
        <TabsTrigger value="overview" className="gap-2">Overview</TabsTrigger>
        <TabsTrigger value="feed" className="gap-2">Insight feed <Badge variant="secondary">{summary.active}</Badge></TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="m-0">
        <ContractorInsightsSummary organizationId={orgId} />
      </TabsContent>

      <TabsContent value="feed" className="m-0 space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryMetric label="Active insights" value={summary.active} icon={PieChart} tone="text-primary" />
          <SummaryMetric label="High priority" value={summary.urgent} icon={ShieldAlert} tone="text-rose-500" />
          <SummaryMetric label="CPA review" value={summary.cpa} icon={CircleAlert} tone="text-amber-500" />
          <SummaryMetric label="Resolved" value={summary.resolved} icon={CheckCircle2} tone="text-emerald-500" />
        </div>

        <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {insightTabs.map(item => <Button key={item} size="sm" variant={tab === item ? "default" : "outline"} onClick={() => setTab(item)} className="shrink-0 gap-1.5 px-2.5 text-xs">
            {item === "all" ? "All" : item === "cash_flow" ? "Cash Flow" : item[0]!.toUpperCase() + item.slice(1)}
            <Badge variant={tab === item ? "secondary" : "outline"} className="h-5 min-w-5 justify-center px-1 text-[10px]">{categoryCount(item)}</Badge>
          </Button>)}
        </div>
        <div className="flex flex-wrap gap-1.5 border-t pt-3">{(["active", "resolved", "dismissed", "expired"] as SignalStatus[]).map(item => <Button key={item} size="sm" variant={status === item ? "secondary" : "ghost"} onClick={() => setStatus(item)} className="h-8 gap-1.5 capitalize">{item}<Badge variant="outline" className="h-5 min-w-5 justify-center px-1 text-[10px]">{allSignals.filter(signal => signal.status === item).length}</Badge></Button>)}</div>
      </CardContent>
        </Card>

        <div className="max-h-[46rem] space-y-3 overflow-y-auto overscroll-contain pr-1">
      {signals.length === 0 ? <Card><CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary"><Inbox className="h-7 w-7" /></div><p className="font-semibold">No {status} insights here</p><p className="mt-1 max-w-md text-sm text-muted-foreground">Insights matching this status and category will appear here when supported data is available.</p></CardContent></Card> : signals.map(signal => {
        const visual = visualFor(signal);
        const value = Number(signal.current_value ?? 0);
        const percent = Number(signal.percentage ?? 0);
        const start = percent === -100 ? 0 : value / (1 + percent / 100 || 1);
        const points = [0, .18, .35, .52, .7, .86, 1].map(step => start + (value - start) * step);
        const isBookkeeping = signal.category === "bookkeeping";
        const isDuplicateExpense = signal.signal_key.startsWith("duplicate-expense:");
        const isJobber = signal.calculation_version === "jobber-operational-v1";
        const jobberQuote = signal.signal_key.startsWith("jobber:quote-follow-up:");
        const jobberCount = ["jobber:upcoming-workload", "jobber:unscheduled-active-jobs", "jobber:job-volume-trend"].includes(signal.signal_key);
        const metricValue = isJobber ? (jobberQuote ? `${value} days` : jobberCount ? value : currency.format(value)) : (isBookkeeping && !isDuplicateExpense ? value : currency.format(value));
        const metricLabel = isJobber
          ? jobberQuote ? "awaiting customer response" : signal.signal_key === "jobber:upcoming-workload" ? "visits in the next 7 days" : signal.signal_key === "jobber:unscheduled-active-jobs" ? "unscheduled active jobs" : signal.signal_key === "jobber:job-volume-trend" ? "jobs created in the latest 30 days" : signal.signal_key.startsWith("jobber:completed-uninvoiced:") ? "uninvoiced operational amount" : "outstanding operational balance"
          : "vs previous period";
        return <Card key={signal.id} className={`overflow-hidden ${visual.border}`} data-testid="insight-card" data-signal-key={signal.signal_key}>
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${visual.bg}`}><visual.Icon className="h-4.5 w-4.5" style={{ color: visual.color }} /></div>
              <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold sm:text-base">{signal.title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">{signal.description}</p></div>
              <Badge variant="outline" className={`shrink-0 capitalize ${visual.badge}`}>{visual.label}</Badge>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3 pl-12">
              <div className="min-w-0">{signal.current_value != null && <p className="text-xl font-semibold sm:text-2xl" style={{ color: visual.color }}>{metricValue}</p>}<p className="text-[10px] text-muted-foreground sm:text-xs">{metricLabel}</p></div>
              {signal.cta_route && !signal.percentage ? <Button asChild size="sm" variant="secondary"><Link href={signal.cta_route}>{signal.cta_label ?? "Explore"}</Link></Button> : <Sparkline values={points} color={visual.color} />}
            </div>
            {signal.cta_route && signal.percentage != null && <div className="mt-3 flex justify-end"><Button asChild size="sm" variant="ghost"><Link href={signal.cta_route}>{signal.cta_label ?? "Review"}<ArrowRight className="ml-1 h-4 w-4" /></Link></Button></div>}
            <div className="mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between"><div className="text-xs text-muted-foreground"><p className="capitalize">Category: {signal.category.replaceAll("_", " ")} · CPA review: {signal.cpa_review_level}</p>{signal.recommended_action && <p className="mt-1 text-foreground">Recommended: {signal.recommended_action}</p>}</div><div className="flex gap-2">{signal.requires_cpa_review && <Button asChild size="sm" variant="outline"><Link href="/user/my-cpa">My CPA</Link></Button>}{status === "active" ? <><Button size="sm" variant="outline" disabled={transition.isPending} onClick={() => transition.mutate({ signal, action: "dismiss" })}>Dismiss</Button><Button size="sm" disabled={transition.isPending} onClick={() => transition.mutate({ signal, action: "resolve" })}>Resolve</Button></> : <Button size="sm" variant="outline" disabled={transition.isPending} onClick={() => transition.mutate({ signal, action: "reopen" })}>Reopen</Button>}</div></div>
            <details className="mt-3 border-t pt-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground" data-testid="open-evidence-map">How BookSmart connected this</summary><div className="mt-2 grid gap-1 sm:grid-cols-2"><span>Current period: {signal.period_start && signal.period_end ? `${new Date(signal.period_start).toLocaleDateString()} – ${new Date(signal.period_end).toLocaleDateString()}` : "Not applicable"}</span><span>Comparison: {signal.comparison_start && signal.comparison_end ? `${new Date(signal.comparison_start).toLocaleDateString()} – ${new Date(signal.comparison_end).toLocaleDateString()}` : "No comparison period"}</span><span>Source records: {signal.source_ids?.length ?? 0}</span><span>Method: {signal.calculation_version}</span></div><InsightEvidenceMap evidence={signal.metadata?.evidence ?? []} calculation={signal.metadata?.calculation ?? null} confidence={signal.confidence} exclusions={signal.exclusions ?? []} recommendation={signal.recommended_action} /></details>
          </CardContent>
        </Card>;
      })}
        </div>

        {(tab !== "all" || status !== "active") && <Button variant="outline" className="w-full" onClick={() => { setTab("all"); setStatus("active"); }}>View active insights</Button>}
      </TabsContent>
    </Tabs>
  </div>;
}

function SummaryMetric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof PieChart; tone: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-3.5 sm:p-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50"><Icon className={`h-5 w-5 ${tone}`} /></div><div><p className="text-xl font-semibold leading-none">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div></CardContent></Card>;
}
