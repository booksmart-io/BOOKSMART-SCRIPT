import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Loader2, Play, ShieldCheck } from "lucide-react";
import { authenticatedApi, apiErrorMessage } from "@/lib/authenticated-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type MonitoringRun = {
  id: number; trigger_type: "manual" | "scheduled" | "event"; status: "running" | "completed" | "partial" | "failed";
  started_at: string; completed_at: string | null; organizations_evaluated: number;
  signals_created: number; signals_updated: number; signals_resolved: number; tasks_created: number;
  notification_events_created: number; error_count: number; errors: Array<{ organization_id?: number; message: string }>;
};
type MonitoringConfig = { interval_minutes: number; execution_lease_minutes: number; notifications_enabled: boolean; transaction_writes_enabled: boolean };
type RolloutEvent = { id: number; organization_id: number; surface: "home" | "reports"; mode: "canonical" | "fallback"; response_ms: number | null; failure_reason: string | null; calculation_version: string; created_at: string };
type ShadowComparison = {
  id: number; organization_id: number; surface: "home" | "reports"; period_start: string; period_end: string;
  classification: "match" | "expected_source_difference" | "unexpected_mismatch"; calculation_version: string;
  differences: Array<{ metric: string; legacy: number | null; canonical: number | null; delta: number | null; reason: string }>;
  legacy_sources: Record<string, string>; canonical_sources: Record<string, string>; created_at: string;
};
const formatStoredPeriodDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC",
}).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));

async function getJson<T>(path: string): Promise<T> {
  const response = await authenticatedApi(path);
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Monitoring request failed."));
  return response.json() as Promise<T>;
}

export default function AdminMonitoring() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const runs = useQuery({ queryKey: ["admin-monitoring-runs"], queryFn: () => getJson<{ runs: MonitoringRun[] }>("/api/admin/monitoring/runs"), refetchInterval: 30_000 });
  const config = useQuery({ queryKey: ["admin-monitoring-config"], queryFn: () => getJson<MonitoringConfig>("/api/admin/monitoring/config") });
  const comparisons = useQuery({
    queryKey: ["admin-financial-summary-comparisons", "financial-summary-v2"],
    queryFn: () => getJson<{ comparisons: ShadowComparison[] }>("/api/admin/monitoring/financial-summary-comparisons"),
    select: data => ({ comparisons: data.comparisons.filter(item => item.calculation_version === "financial-summary-v2") }),
    refetchInterval: 30_000,
    retry: false,
  });
  const rolloutEvents = useQuery({ queryKey: ["admin-financial-summary-rollout-events"], queryFn: () => getJson<{ events: RolloutEvent[] }>("/api/admin/monitoring/financial-summary-rollout-events"), refetchInterval: 30_000, retry: false });
  const runNow = useMutation({
    mutationFn: async () => {
      const response = await authenticatedApi("/api/admin/monitoring/run", { method: "POST", headers: { "X-Idempotency-Key": `manual:${Date.now()}` }, body: JSON.stringify({}) });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Monitoring run failed."));
      return response.json();
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-monitoring-runs"] }); toast({ title: "Monitoring run completed" }); },
    onError: error => toast({ title: "Monitoring run failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });
  const latest = runs.data?.runs[0];
  const latestScheduled = runs.data?.runs.find(run => run.trigger_type === "scheduled");
  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-bold tracking-tight">Monitoring operations</h1><p className="text-muted-foreground">Auditable scheduled evaluations. Notifications and transaction writes remain disabled.</p></div><Button onClick={() => runNow.mutate()} disabled={runNow.isPending}><Play className="mr-2 h-4 w-4" />{runNow.isPending ? "Running…" : "Run now"}</Button></div>
    <div className="grid gap-4 md:grid-cols-4">
      <Metric title="Latest status" value={latest?.status ?? "No runs"} icon={latest?.status === "failed" ? AlertTriangle : CheckCircle2} />
      <Metric title="Scheduled health" value={latestScheduled ? `${latestScheduled.status} · ${new Date(latestScheduled.started_at).toLocaleDateString()}` : "Not run yet"} icon={Clock3} />
      <Metric title="Notifications" value={config.data?.notifications_enabled ? "Enabled" : "Suppressed"} icon={Activity} />
      <Metric title="Accounting safety" value={config.data?.transaction_writes_enabled ? "Writes enabled" : "Read-only"} icon={ShieldCheck} />
    </div>
    <Card><CardHeader><CardTitle>Canonical financial-summary rollout</CardTitle></CardHeader><CardContent className="p-0">{rolloutEvents.isLoading ? <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : rolloutEvents.isError ? <p className="p-6 text-sm text-muted-foreground">Apply the rollout telemetry migration to begin recording canonical and fallback usage.</p> : rolloutEvents.data?.events.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No rollout events recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="p-4">Observed</th><th>Organization</th><th>Surface</th><th>Mode</th><th>Response</th><th>Failure</th></tr></thead><tbody>{rolloutEvents.data?.events.map(event => <tr key={event.id} className="border-b last:border-0"><td className="p-4 whitespace-nowrap">{new Date(event.created_at).toLocaleString()}</td><td>{event.organization_id}</td><td className="capitalize">{event.surface}</td><td><Badge variant={event.mode === "fallback" ? "destructive" : "outline"} className="capitalize">{event.mode}</Badge></td><td>{event.response_ms == null ? "—" : `${event.response_ms} ms`}</td><td className="max-w-96 pr-4 text-xs text-muted-foreground">{event.failure_reason ?? "None"}</td></tr>)}</tbody></table></div>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Run history</CardTitle></CardHeader><CardContent className="p-0">{runs.isLoading ? <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : runs.isError ? <p className="p-6 text-sm text-destructive">Could not load monitoring runs.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="p-4">Started</th><th>Trigger</th><th>Status</th><th>Organizations</th><th>Signals</th><th>Resolved</th><th>Tasks</th><th>Events</th><th>Errors</th></tr></thead><tbody>{(runs.data?.runs ?? []).map(run => <tr key={run.id} className="border-b last:border-0 align-top"><td className="p-4">{new Date(run.started_at).toLocaleString()}</td><td className="capitalize">{run.trigger_type}</td><td><Badge variant={run.status === "failed" ? "destructive" : "outline"} className="capitalize">{run.status}</Badge></td><td>{run.organizations_evaluated}</td><td>{run.signals_created} new / {run.signals_updated} updated</td><td>{run.signals_resolved}</td><td>{run.tasks_created}</td><td>{run.notification_events_created ?? 0}</td><td className="max-w-64 pr-4">{run.error_count === 0 ? "0" : <details><summary className="cursor-pointer text-destructive">{run.error_count} failed</summary><div className="mt-1 space-y-1 text-xs text-muted-foreground">{run.errors.map((error, index) => <p key={`${run.id}-${index}`}>{error.organization_id ? `Organization ${error.organization_id}: ` : ""}{error.message}</p>)}</div></details>}</td></tr>)}</tbody></table></div>}</CardContent></Card>
    <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Financial summary parity</CardTitle>{comparisons.data && <Badge variant="outline">{comparisons.data.comparisons.filter(item => item.classification === "unexpected_mismatch").length} unexpected</Badge>}</div></CardHeader><CardContent className="p-0">{comparisons.isLoading ? <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : comparisons.isError ? <p className="p-6 text-sm text-muted-foreground">Apply the financial-summary shadow migration to begin collecting comparisons.</p> : comparisons.data?.comparisons.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No shadow comparisons recorded yet. Development and explicitly enabled staging sessions report here without changing displayed values.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="p-4">Observed</th><th>Organization</th><th>Surface</th><th>Period</th><th>Result</th><th>Differences</th><th>Sources</th></tr></thead><tbody>{comparisons.data?.comparisons.map(item => <tr key={item.id} className="border-b last:border-0 align-top"><td className="p-4 whitespace-nowrap">{new Date(item.created_at).toLocaleString()}</td><td>{item.organization_id}</td><td className="capitalize">{item.surface}</td><td className="whitespace-nowrap">{formatStoredPeriodDate(item.period_start)} – {formatStoredPeriodDate(item.period_end)}</td><td><Badge variant={item.classification === "unexpected_mismatch" ? "destructive" : "outline"} className="whitespace-nowrap">{item.classification.replaceAll("_", " ")}</Badge></td><td className="max-w-80 pr-3">{item.differences.length === 0 ? "None" : <details><summary className="cursor-pointer">{item.differences.length} metric{item.differences.length === 1 ? "" : "s"}</summary><div className="mt-1 space-y-1 text-xs text-muted-foreground">{item.differences.map(diff => <p key={diff.metric}>{diff.metric}: {diff.legacy ?? "missing"} → {diff.canonical ?? "missing"}{diff.delta == null ? "" : ` (${diff.delta >= 0 ? "+" : ""}${diff.delta})`}</p>)}</div></details>}</td><td className="max-w-64 pr-4 text-xs text-muted-foreground">Legacy {JSON.stringify(item.legacy_sources)}<br />Canonical {JSON.stringify(item.canonical_sources)}</td></tr>)}</tbody></table></div>}</CardContent></Card>
  </div>;
}

function Metric({ title, value, icon: Icon }: { title: string; value: string; icon: typeof Activity }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle><Icon className="h-4 w-4 text-primary" /></CardHeader><CardContent><p className="text-2xl font-bold capitalize">{value}</p></CardContent></Card>;
}
