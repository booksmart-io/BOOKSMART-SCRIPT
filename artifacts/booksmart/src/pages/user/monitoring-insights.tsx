import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, CircleAlert, Clock3, Loader2, PieChart, TrendingUp } from "lucide-react";
import { useMonitoringOrganization } from "@/hooks/use-monitoring-organization";
import { loadMonitoring, type MonitoringSignal } from "@/lib/monitoring-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Sparkline } from "@/components/monitoring/monitoring-visuals";

const insightTabs = ["all", "growth", "expenses", "cash_flow", "bookkeeping", "tax", "risks"] as const;
type InsightTab = (typeof insightTabs)[number];

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
  const text = `${signal.category} ${signal.title}`.toLowerCase();
  if (signal.severity === "positive" || text.includes("revenue") && !text.includes("decreas")) return { color: "#22c55e", border: "border-emerald-400/35", bg: "bg-emerald-500/15", Icon: TrendingUp };
  if (text.includes("tax")) return { color: "#facc15", border: "border-amber-400/35", bg: "bg-amber-400/15", Icon: Clock3 };
  if (["high", "critical"].includes(signal.severity) || text.includes("cash")) return { color: "#ef4444", border: "border-red-400/35", bg: "bg-red-500/15", Icon: CircleAlert };
  return { color: "#3b82f6", border: "border-blue-400/35", bg: "bg-blue-500/15", Icon: PieChart };
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function MonitoringInsights() {
  const { data: organization, isLoading: orgLoading } = useMonitoringOrganization();
  const orgId = organization?.id ?? null;
  const [tab, setTab] = useState<InsightTab>("all");
  const monitoring = useQuery({ queryKey: ["monitoring-projection", orgId], enabled: orgId !== null, queryFn: () => loadMonitoring(orgId!), retry: false });

  if (orgLoading || monitoring.isLoading) return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (!orgId || monitoring.isError) return <div className="mx-auto max-w-3xl p-8"><Card><CardContent className="p-6"><CardTitle>Insights are unavailable</CardTitle><p className="mt-2 text-sm text-muted-foreground">Restart the local API server and try again.</p></CardContent></Card></div>;

  const signals = (monitoring.data?.signals ?? []).filter(signal => signal.status === "active" && belongsToTab(signal, tab));

  return <div className="monitoring-page w-full max-w-none space-y-4 lg:space-y-6">
    <div><h1 className="text-2xl font-bold md:text-3xl">Insights</h1><p className="text-sm text-muted-foreground">Smart insights for your business</p></div>

    <div className="flex gap-2 overflow-x-auto pb-1">
      {insightTabs.map(item => <Button key={item} size="sm" variant={tab === item ? "default" : "outline"} onClick={() => setTab(item)} className="min-w-0 px-1.5 text-[10px] sm:px-3 sm:text-xs">
        {item === "all" ? "All" : item === "cash_flow" ? "Cash Flow" : item[0]!.toUpperCase() + item.slice(1)}
      </Button>)}
    </div>

    <div className="space-y-3">
      {signals.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No insights in this category.</CardContent></Card> : signals.map(signal => {
        const visual = visualFor(signal);
        const value = Number(signal.current_value ?? 0);
        const percent = Number(signal.percentage ?? 0);
        const start = percent === -100 ? 0 : value / (1 + percent / 100 || 1);
        const points = [0, .18, .35, .52, .7, .86, 1].map(step => start + (value - start) * step);
        const isBookkeeping = signal.category === "bookkeeping";
        const isJobber = signal.calculation_version === "jobber-operational-v1";
        const jobberQuote = signal.signal_key.startsWith("jobber:quote-follow-up:");
        const jobberCount = ["jobber:upcoming-workload", "jobber:unscheduled-active-jobs", "jobber:job-volume-trend"].includes(signal.signal_key);
        const metricValue = isJobber ? (jobberQuote ? `${value} days` : jobberCount ? value : currency.format(value)) : (isBookkeeping ? value : currency.format(value));
        const metricLabel = isJobber
          ? jobberQuote ? "awaiting customer response" : signal.signal_key === "jobber:upcoming-workload" ? "visits in the next 7 days" : signal.signal_key === "jobber:unscheduled-active-jobs" ? "unscheduled active jobs" : signal.signal_key === "jobber:job-volume-trend" ? "jobs created in the latest 30 days" : signal.signal_key.startsWith("jobber:completed-uninvoiced:") ? "uninvoiced operational amount" : "outstanding operational balance"
          : "vs previous period";
        return <Card key={signal.id} className={`overflow-hidden ${visual.border}`}>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${visual.bg}`}><visual.Icon className="h-5 w-5" style={{ color: visual.color }} /></div>
              <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold sm:text-base">{signal.title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">{signal.description}</p></div>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3 pl-[52px]">
              <div className="min-w-0">{signal.current_value != null && <p className="text-xl font-semibold sm:text-2xl" style={{ color: visual.color }}>{metricValue}</p>}<p className="text-[10px] text-muted-foreground sm:text-xs">{metricLabel}</p></div>
              {signal.cta_route && !signal.percentage ? <Button asChild size="sm" variant="secondary"><Link href={signal.cta_route}>{signal.cta_label ?? "Explore"}</Link></Button> : <Sparkline values={points} color={visual.color} />}
            </div>
            {signal.cta_route && signal.percentage != null && <div className="mt-3 flex justify-end"><Button asChild size="sm" variant="ghost"><Link href={signal.cta_route}>{signal.cta_label ?? "Review"}<ArrowRight className="ml-1 h-4 w-4" /></Link></Button></div>}
            <details className="mt-3 border-t pt-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">How we calculated this</summary><div className="mt-2 grid gap-1 sm:grid-cols-2"><span>Current period: {signal.period_start && signal.period_end ? `${new Date(signal.period_start).toLocaleDateString()} – ${new Date(signal.period_end).toLocaleDateString()}` : "Not applicable"}</span><span>Comparison: {signal.comparison_start && signal.comparison_end ? `${new Date(signal.comparison_start).toLocaleDateString()} – ${new Date(signal.comparison_end).toLocaleDateString()}` : "No comparison period"}</span><span>Source records: {signal.source_ids?.length ?? 0}</span><span>Method: {signal.calculation_version}</span><span>Confidence: {signal.confidence == null ? "Not scored" : `${Math.round(signal.confidence * 100)}%`}</span><span>Excluded: {signal.exclusions?.length ? signal.exclusions.join(", ").replaceAll("_", " ") : "None"}</span></div></details>
          </CardContent>
        </Card>;
      })}
    </div>

    <Button variant="outline" className="w-full" onClick={() => setTab("all")}>View All Insights</Button>
  </div>;
}
