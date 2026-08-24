import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { authenticatedApi, apiErrorMessage } from "@/lib/authenticated-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type MonitoringRun = {
  id: number;
  trigger_type: "manual" | "scheduled" | "event";
  status: "running" | "completed" | "partial" | "failed";
  started_at: string;
  completed_at: string | null;
  organizations_evaluated: number;
  signals_created: number;
  signals_updated: number;
  signals_resolved: number;
  tasks_created: number;
  notification_events_created: number;
  error_count: number;
  errors: Array<{ organization_id?: number; message: string }>;
};
type MonitoringConfig = {
  interval_minutes: number;
  execution_lease_minutes: number;
  scheduler_health: {
    status:
      | "not_configured"
      | "never_run"
      | "running"
      | "stalled"
      | "failed"
      | "partial"
      | "overdue"
      | "healthy";
    next_expected_at: string | null;
    overdue_since: string | null;
  };
  notifications_enabled: boolean;
  transaction_writes_enabled: boolean;
};
type RolloutEvent = {
  id: number;
  organization_id: number;
  surface: "home" | "reports";
  mode: "canonical" | "fallback";
  response_ms: number | null;
  failure_reason: string | null;
  calculation_version: string;
  created_at: string;
};
type ShadowComparison = {
  id: number;
  organization_id: number;
  surface: "home" | "reports";
  period_start: string;
  period_end: string;
  classification:
    | "match"
    | "expected_source_difference"
    | "unexpected_mismatch";
  calculation_version: string;
  differences: Array<{
    metric: string;
    legacy: number | null;
    canonical: number | null;
    delta: number | null;
    reason: string;
  }>;
  legacy_sources: Record<string, string>;
  canonical_sources: Record<string, string>;
  created_at: string;
};
type ContractorDiagnostic = {
  organization: { id: number; name: string };
  connections: {
    plaid: Array<{
      status: string;
      last_sync_status: string | null;
      last_synced_at: string | null;
    }>;
    quickbooks: { status: string; updated_at: string | null } | null;
    jobber: {
      status: string;
      last_successful_sync_at: string | null;
      last_sync_error: string | null;
    } | null;
  };
  dataCounts: Record<string, number>;
  matching: {
    byConfidence: Record<string, number>;
    byStatus: Record<string, number>;
    requiresConfirmation: number;
  };
  metrics: {
    revenue: number;
    expenses: number;
    netIncome: number;
    outstandingInvoices: number;
    trackedJobCosts: number;
    jobsWithMarginAvailable: number;
  };
  signals: {
    active: number;
    byCategory: Record<string, number>;
    requiringCpaReview: number;
  };
  tasks: { byStatus: Record<string, number>; highPriority: number };
  dataQuality: {
    confidence: string;
    missingSources: string[];
    staleProviders: string[];
  };
};
const formatStoredPeriodDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));

async function getJson<T>(path: string): Promise<T> {
  const response = await authenticatedApi(path);
  if (!response.ok)
    throw new Error(
      await apiErrorMessage(response, "Monitoring request failed."),
    );
  return response.json() as Promise<T>;
}

export default function AdminMonitoring() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [diagnosticInput, setDiagnosticInput] = useState("");
  const [diagnosticOrganizationId, setDiagnosticOrganizationId] = useState<
    number | null
  >(null);
  const runs = useQuery({
    queryKey: ["admin-monitoring-runs"],
    queryFn: () =>
      getJson<{ runs: MonitoringRun[] }>("/api/admin/monitoring/runs"),
    refetchInterval: 30_000,
  });
  const config = useQuery({
    queryKey: ["admin-monitoring-config"],
    queryFn: () => getJson<MonitoringConfig>("/api/admin/monitoring/config"),
  });
  const comparisons = useQuery({
    queryKey: ["admin-financial-summary-comparisons", "financial-summary-v2"],
    queryFn: () =>
      getJson<{ comparisons: ShadowComparison[] }>(
        "/api/admin/monitoring/financial-summary-comparisons",
      ),
    select: (data) => ({
      comparisons: data.comparisons.filter(
        (item) => item.calculation_version === "financial-summary-v2",
      ),
    }),
    refetchInterval: 30_000,
    retry: false,
  });
  const rolloutEvents = useQuery({
    queryKey: ["admin-financial-summary-rollout-events"],
    queryFn: () =>
      getJson<{ events: RolloutEvent[] }>(
        "/api/admin/monitoring/financial-summary-rollout-events",
      ),
    refetchInterval: 30_000,
    retry: false,
  });
  const contractorDiagnostic = useQuery({
    queryKey: ["admin-contractor-diagnostic", diagnosticOrganizationId],
    queryFn: () =>
      getJson<ContractorDiagnostic>(
        `/api/admin/contractor-diagnostics/${diagnosticOrganizationId}`,
      ),
    enabled: diagnosticOrganizationId !== null,
    retry: false,
  });
  const runNow = useMutation({
    mutationFn: async () => {
      const response = await authenticatedApi("/api/admin/monitoring/run", {
        method: "POST",
        headers: { "X-Idempotency-Key": `manual:${Date.now()}` },
        body: JSON.stringify({}),
      });
      if (!response.ok)
        throw new Error(
          await apiErrorMessage(response, "Monitoring run failed."),
        );
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-monitoring-runs"],
      });
      toast({ title: "Monitoring run completed" });
    },
    onError: (error) =>
      toast({
        title: "Monitoring run failed",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      }),
  });
  const latest = runs.data?.runs[0];
  const latestScheduled = runs.data?.runs.find(
    (run) => run.trigger_type === "scheduled",
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Monitoring operations
          </h1>
          <p className="text-muted-foreground">
            Auditable scheduled evaluations. Notifications and transaction
            writes remain disabled.
          </p>
        </div>
        <Button onClick={() => runNow.mutate()} disabled={runNow.isPending}>
          <Play className="mr-2 h-4 w-4" />
          {runNow.isPending ? "Running…" : "Run now"}
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Metric
          title="Latest status"
          value={latest?.status ?? "No runs"}
          icon={latest?.status === "failed" ? AlertTriangle : CheckCircle2}
        />
        <Metric
          title="Scheduled health"
          value={
            config.data?.scheduler_health.status.replaceAll("_", " ") ??
            (latestScheduled ? latestScheduled.status : "Checking")
          }
          icon={
            config.data?.scheduler_health.status === "healthy"
              ? CheckCircle2
              : config.data?.scheduler_health.status === "running"
                ? Clock3
                : AlertTriangle
          }
        />
        <Metric
          title="Notifications"
          value={config.data?.notifications_enabled ? "Enabled" : "Suppressed"}
          icon={Activity}
        />
        <Metric
          title="Accounting safety"
          value={
            config.data?.transaction_writes_enabled
              ? "Writes enabled"
              : "Read-only"
          }
          icon={ShieldCheck}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Contractor diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <form
            className="flex max-w-md gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const id = Number(diagnosticInput);
              if (Number.isSafeInteger(id) && id > 0)
                setDiagnosticOrganizationId(id);
            }}
          >
            <Input
              aria-label="Organization ID"
              inputMode="numeric"
              placeholder="Organization ID"
              value={diagnosticInput}
              onChange={(event) => setDiagnosticInput(event.target.value)}
            />
            <Button type="submit" variant="outline">
              Inspect
            </Button>
          </form>
          {contractorDiagnostic.isFetching && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading contractor data…
            </div>
          )}
          {contractorDiagnostic.isError && (
            <p className="text-sm text-destructive">
              {contractorDiagnostic.error instanceof Error
                ? contractorDiagnostic.error.message
                : "Contractor diagnostics could not be loaded."}
            </p>
          )}
          {contractorDiagnostic.data && (
            <ContractorDiagnosticPanel diagnostic={contractorDiagnostic.data} />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Canonical financial-summary rollout</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rolloutEvents.isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rolloutEvents.isError ? (
            <p className="p-6 text-sm text-muted-foreground">
              Apply the rollout telemetry migration to begin recording canonical
              and fallback usage.
            </p>
          ) : rolloutEvents.data?.events.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No rollout events recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="p-4">Observed</th>
                    <th>Organization</th>
                    <th>Surface</th>
                    <th>Mode</th>
                    <th>Response</th>
                    <th>Failure</th>
                  </tr>
                </thead>
                <tbody>
                  {rolloutEvents.data?.events.map((event) => (
                    <tr key={event.id} className="border-b last:border-0">
                      <td className="p-4 whitespace-nowrap">
                        {new Date(event.created_at).toLocaleString()}
                      </td>
                      <td>{event.organization_id}</td>
                      <td className="capitalize">{event.surface}</td>
                      <td>
                        <Badge
                          variant={
                            event.mode === "fallback"
                              ? "destructive"
                              : "outline"
                          }
                          className="capitalize"
                        >
                          {event.mode}
                        </Badge>
                      </td>
                      <td>
                        {event.response_ms == null
                          ? "—"
                          : `${event.response_ms} ms`}
                      </td>
                      <td className="max-w-96 pr-4 text-xs text-muted-foreground">
                        {event.failure_reason ?? "None"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs.isLoading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : runs.isError ? (
            <p className="p-6 text-sm text-destructive">
              Could not load monitoring runs.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="p-4">Started</th>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th>Organizations</th>
                    <th>Signals</th>
                    <th>Resolved</th>
                    <th>Tasks</th>
                    <th>Events</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {(runs.data?.runs ?? []).map((run) => (
                    <tr
                      key={run.id}
                      className="border-b last:border-0 align-top"
                    >
                      <td className="p-4">
                        {new Date(run.started_at).toLocaleString()}
                      </td>
                      <td className="capitalize">{run.trigger_type}</td>
                      <td>
                        <Badge
                          variant={
                            run.status === "failed" ? "destructive" : "outline"
                          }
                          className="capitalize"
                        >
                          {run.status}
                        </Badge>
                      </td>
                      <td>{run.organizations_evaluated}</td>
                      <td>
                        {run.signals_created} new / {run.signals_updated}{" "}
                        updated
                      </td>
                      <td>{run.signals_resolved}</td>
                      <td>{run.tasks_created}</td>
                      <td>{run.notification_events_created ?? 0}</td>
                      <td className="max-w-64 pr-4">
                        {run.error_count === 0 ? (
                          "0"
                        ) : (
                          <details>
                            <summary className="cursor-pointer text-destructive">
                              {run.error_count} failed
                            </summary>
                            <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                              {run.errors.map((error, index) => (
                                <p key={`${run.id}-${index}`}>
                                  {error.organization_id
                                    ? `Organization ${error.organization_id}: `
                                    : ""}
                                  {error.message}
                                </p>
                              ))}
                            </div>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Financial summary parity</CardTitle>
            {comparisons.data && (
              <Badge variant="outline">
                {
                  comparisons.data.comparisons.filter(
                    (item) => item.classification === "unexpected_mismatch",
                  ).length
                }{" "}
                unexpected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {comparisons.isLoading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : comparisons.isError ? (
            <p className="p-6 text-sm text-muted-foreground">
              Apply the financial-summary shadow migration to begin collecting
              comparisons.
            </p>
          ) : comparisons.data?.comparisons.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No shadow comparisons recorded yet. Development and explicitly
              enabled staging sessions report here without changing displayed
              values.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="p-4">Observed</th>
                    <th>Organization</th>
                    <th>Surface</th>
                    <th>Period</th>
                    <th>Result</th>
                    <th>Differences</th>
                    <th>Sources</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.data?.comparisons.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b last:border-0 align-top"
                    >
                      <td className="p-4 whitespace-nowrap">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                      <td>{item.organization_id}</td>
                      <td className="capitalize">{item.surface}</td>
                      <td className="whitespace-nowrap">
                        {formatStoredPeriodDate(item.period_start)} –{" "}
                        {formatStoredPeriodDate(item.period_end)}
                      </td>
                      <td>
                        <Badge
                          variant={
                            item.classification === "unexpected_mismatch"
                              ? "destructive"
                              : "outline"
                          }
                          className="whitespace-nowrap"
                        >
                          {item.classification.replaceAll("_", " ")}
                        </Badge>
                      </td>
                      <td className="max-w-80 pr-3">
                        {item.differences.length === 0 ? (
                          "None"
                        ) : (
                          <details>
                            <summary className="cursor-pointer">
                              {item.differences.length} metric
                              {item.differences.length === 1 ? "" : "s"}
                            </summary>
                            <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                              {item.differences.map((diff) => (
                                <p key={diff.metric}>
                                  {diff.metric}: {diff.legacy ?? "missing"} →{" "}
                                  {diff.canonical ?? "missing"}
                                  {diff.delta == null
                                    ? ""
                                    : ` (${diff.delta >= 0 ? "+" : ""}${diff.delta})`}
                                </p>
                              ))}
                            </div>
                          </details>
                        )}
                      </td>
                      <td className="max-w-64 pr-4 text-xs text-muted-foreground">
                        Legacy {JSON.stringify(item.legacy_sources)}
                        <br />
                        Canonical {JSON.stringify(item.canonical_sources)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ContractorDiagnosticPanel({
  diagnostic,
}: {
  diagnostic: ContractorDiagnostic;
}) {
  const currency = (value: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  const connectionRows = [
    {
      provider: "Plaid",
      status: diagnostic.connections.plaid.some(
        (row) => row.status === "active",
      )
        ? "connected"
        : "disconnected",
      refreshed:
        diagnostic.connections.plaid
          .map((row) => row.last_synced_at)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
    },
    {
      provider: "QuickBooks",
      status: diagnostic.connections.quickbooks?.status ?? "disconnected",
      refreshed: diagnostic.connections.quickbooks?.updated_at ?? null,
    },
    {
      provider: "Jobber",
      status: diagnostic.connections.jobber?.status ?? "disconnected",
      refreshed: diagnostic.connections.jobber?.last_successful_sync_at ?? null,
    },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{diagnostic.organization.name}</strong>
        <Badge variant="outline">
          Organization {diagnostic.organization.id}
        </Badge>
        <Badge
          variant={
            diagnostic.dataQuality.confidence === "high"
              ? "default"
              : "secondary"
          }
        >
          {diagnostic.dataQuality.confidence} confidence
        </Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {connectionRows.map((row) => (
          <div key={row.provider} className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{row.provider}</span>
              <Badge
                variant={
                  row.status === "active" || row.status === "connected"
                    ? "outline"
                    : "destructive"
                }
              >
                {row.status === "active" ? "connected" : row.status}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {row.refreshed
                ? `Refreshed ${new Date(row.refreshed).toLocaleString()}`
                : "No successful refresh recorded"}
            </p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <DiagnosticValue
          label="Revenue"
          value={currency(diagnostic.metrics.revenue)}
        />
        <DiagnosticValue
          label="Expenses"
          value={currency(diagnostic.metrics.expenses)}
        />
        <DiagnosticValue
          label="Net income"
          value={currency(diagnostic.metrics.netIncome)}
        />
        <DiagnosticValue
          label="Outstanding"
          value={currency(diagnostic.metrics.outstandingInvoices)}
        />
        <DiagnosticValue
          label="Tracked job costs"
          value={currency(diagnostic.metrics.trackedJobCosts)}
        />
        <DiagnosticValue
          label="Jobs with margin"
          value={String(diagnostic.metrics.jobsWithMarginAvailable)}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <DiagnosticGroup title="Data counts" values={diagnostic.dataCounts} />
        <DiagnosticGroup
          title="Matching"
          values={{
            ...diagnostic.matching.byStatus,
            requiresConfirmation: diagnostic.matching.requiresConfirmation,
          }}
        />
        <DiagnosticGroup
          title="Signals"
          values={{
            active: diagnostic.signals.active,
            cpaReview: diagnostic.signals.requiringCpaReview,
            ...diagnostic.signals.byCategory,
          }}
        />
        <DiagnosticGroup
          title="Tasks"
          values={{
            ...diagnostic.tasks.byStatus,
            highPriority: diagnostic.tasks.highPriority,
          }}
        />
      </div>
      {(diagnostic.dataQuality.staleProviders.length > 0 ||
        diagnostic.dataQuality.missingSources.length > 0) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {diagnostic.dataQuality.staleProviders.length > 0 && (
            <p>Stale: {diagnostic.dataQuality.staleProviders.join(", ")}</p>
          )}
          {diagnostic.dataQuality.missingSources.length > 0 && (
            <p>Missing: {diagnostic.dataQuality.missingSources.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function DiagnosticValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function DiagnosticGroup({
  title,
  values,
}: {
  title: string;
  values: Record<string, number>;
}) {
  const rows = Object.entries(values).filter(([, value]) => value > 0);
  return (
    <div className="rounded-lg border p-3">
      <p className="font-medium">{title}</p>
      <div className="mt-2 space-y-1 text-sm">
        {rows.length ? (
          rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {diagnosticLabel(label)}
              </span>
              <span>{value}</span>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">None</p>
        )}
      </div>
    </div>
  );
}

function Metric({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: typeof Activity;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold capitalize">{value}</p>
      </CardContent>
    </Card>
  );
}

function diagnosticLabel(value: string) {
  const words = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim()
    .replace(/\bcpa\b/gi, "CPA")
    .replace(/\bquick books\b/gi, "QuickBooks")
    .replace(/\bplaid\b/gi, "Plaid");
  return words.replace(/^./, (letter) => letter.toUpperCase());
}
