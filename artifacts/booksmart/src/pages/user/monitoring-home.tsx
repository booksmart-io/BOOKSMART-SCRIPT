import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CloudUpload,
  Landmark,
  ListTodo,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  useActiveOrganizationId,
  pickActiveOrganization,
} from "@/lib/active-organization";
import { supabase } from "@/lib/supabase";
import type { BusinessHealthScore } from "@/lib/financial-summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HealthGauge } from "@/components/monitoring/monitoring-visuals";
import {
  loadConnectionStatus,
  loadMonitoring,
  type MonitoringData,
} from "@/lib/monitoring-client";
import { authenticatedApi, apiErrorMessage } from "@/lib/authenticated-api";
import type { OrgRow } from "@/lib/deduction-calculation";
import { isActiveCpaEngagement } from "@/lib/route-access";
import {
  forecastShortfallDate,
  hasCanonicalFinancialHistory,
  planningSetupMessage,
} from "@/lib/home-readiness";
import { ContractorHomeSummary } from "@/components/monitoring/contractor-home-summary";

type PlanningReadiness = {
  available: boolean;
  missingInputs?: string[];
  safeToSpend?: number;
  shortfall?: number;
  shortfallDate?: string | null;
  remainingReserve?: number | null;
  endingCash?: number;
  lowestBalance?: number;
  lowestBalanceDate?: string;
};
type PlanningSummary = {
  verified_cash: { available: boolean; refreshed_at: string | null };
  readiness: {
    safe_to_spend: PlanningReadiness;
    tax_reserve: PlanningReadiness;
    forecast: PlanningReadiness;
  };
};
type HomeCpaOrder = {
  id: number;
  cpa_id: number | null;
  status: string;
  cpa: { first_name: string | null; last_name: string | null } | null;
};
type CanonicalHomeSummary = {
  revenue: number;
  accountingExpenses: number;
  netIncome: number;
  moneyIn: number;
  moneyOut: number;
  netCashMovement: number;
  health: BusinessHealthScore;
  completeness: {
    approvedTransactionCount: number;
    uncategorizedTransactionCount: number;
    confirmedStatementCount: number;
  };
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const signedMoney = (value: number) =>
  value < 0 ? `−${money.format(Math.abs(value))}` : money.format(value);
const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export default function MonitoringHome() {
  const { profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const [activeOrgId] = useActiveOrganizationId(numericId);
  const {
    data: organization,
    isLoading: organizationLoading,
    isError: organizationError,
  } = useQuery<OrgRow | null>({
    queryKey: ["monitoring-organization", numericId, activeOrgId],
    enabled: numericId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("owner_id", numericId!)
        .order("id", { ascending: true });
      if (error) throw error;
      return pickActiveOrganization(data, activeOrgId);
    },
  });
  const orgId = organization?.id ?? null;
  const today = startOfDay(new Date());
  const currentEnd = new Date(today);
  currentEnd.setDate(currentEnd.getDate() + 1);
  currentEnd.setMilliseconds(-1);
  const currentStart = new Date(today);
  currentStart.setDate(currentStart.getDate() - 29);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - 30);
  const previousEnd = new Date(currentStart);
  previousEnd.setMilliseconds(-1);
  const canonicalHome = useQuery({
    queryKey: [
      "canonical-home-summary",
      orgId,
      currentStart.toISOString(),
      currentEnd.toISOString(),
    ],
    enabled: orgId !== null,
    retry: false,
    queryFn: async () => {
      const query = new URLSearchParams({
        currentStartInstant: currentStart.toISOString(),
        currentEndInstant: currentEnd.toISOString(),
        previousStartInstant: previousStart.toISOString(),
        previousEndInstant: previousEnd.toISOString(),
      });
      const response = await authenticatedApi(
        `/api/organizations/${orgId}/financial-summary/home-pair?${query}`,
      );
      if (!response.ok)
        throw new Error(
          await apiErrorMessage(
            response,
            "Canonical Home summary is unavailable.",
          ),
        );
      return response.json() as Promise<{
        current: CanonicalHomeSummary;
        previous: CanonicalHomeSummary;
      }>;
    },
  });

  const {
    data: monitoring,
    isLoading: monitoringLoading,
    isError: monitoringError,
    refetch: retryMonitoring,
  } = useQuery<MonitoringData>({
    queryKey: ["monitoring-projection", orgId],
    enabled: orgId !== null,
    retry: false,
    queryFn: () => loadMonitoring(orgId!),
  });
  const {
    data: connections,
    isLoading: connectionLoading,
    isError: connectionError,
  } = useQuery({
    queryKey: ["normalized-connection-status", orgId],
    enabled: orgId !== null,
    queryFn: () => loadConnectionStatus(orgId!),
    staleTime: 60_000,
    retry: false,
  });
  const {
    data: planning,
    isLoading: planningLoading,
    isError: planningError,
  } = useQuery<PlanningSummary>({
    queryKey: ["home-financial-planning", orgId],
    enabled: orgId !== null,
    retry: false,
    queryFn: async () => {
      const response = await authenticatedApi(
        `/api/financial-inputs?organization_id=${orgId}`,
      );
      if (!response.ok)
        throw new Error(
          await apiErrorMessage(response, "Planning results are unavailable."),
        );
      return response.json();
    },
  });
  const {
    data: cpaOrders = [],
    isLoading: cpaLoading,
    isError: cpaError,
  } = useQuery<HomeCpaOrder[]>({
    queryKey: ["home-cpa-orders", numericId],
    enabled: numericId !== null,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,cpa_id,status,cpa:users!cpa_id(first_name,last_name)")
        .eq("user_id", numericId!)
        .order("created_at", { ascending: false });
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      return (data ?? []) as unknown as HomeCpaOrder[];
    },
  });

  if (organizationLoading || canonicalHome.isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (organizationError || !orgId) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Card>
          <CardContent className="space-y-3 p-6">
            <CardTitle>Choose a business first</CardTitle>
            <p className="text-sm text-muted-foreground">
              BookSmart could not resolve an active organization for this
              preview.
            </p>
            <Button asChild>
              <Link href="/user/organizations">Manage organizations</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!canonicalHome.data) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Card>
          <CardContent className="space-y-3 p-6">
            <CardTitle>Home financial summary is unavailable</CardTitle>
            <p className="text-sm text-muted-foreground">
              BookSmart will not substitute independently calculated totals.
              Your accounting data has not been changed.
            </p>
            <Button asChild variant="outline">
              <Link href="/user/reports">Open financial reports</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  const current = {
    ...canonicalHome.data.current,
    transactionCount:
      canonicalHome.data.current.completeness.approvedTransactionCount,
    unclassifiedTransactionCount:
      canonicalHome.data.current.completeness.uncategorizedTransactionCount,
  };
  const previous = {
    ...canonicalHome.data.previous,
    transactionCount:
      canonicalHome.data.previous.completeness.approvedTransactionCount,
    unclassifiedTransactionCount:
      canonicalHome.data.previous.completeness.uncategorizedTransactionCount,
  };
  const hasFinancialHistory = hasCanonicalFinancialHistory(
    current.completeness,
    previous.completeness,
  );
  const activeSignals = distinctByMeaning(
    (monitoring?.signals ?? []).filter((signal) => signal.status === "active"),
  );
  const priorityRank: Record<string, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
    positive: 0,
  };
  const prioritySignals = [...activeSignals]
    .sort(
      (a, b) =>
        (priorityRank[b.severity] ?? 0) - (priorityRank[a.severity] ?? 0),
    )
    .slice(0, 3);
  const activeTasks = distinctByMeaning(
    (monitoring?.tasks ?? []).filter((task) =>
      ["open", "in_progress", "waiting"].includes(task.status),
    ),
  );
  const priorityTasks = [...activeTasks]
    .sort(
      (a, b) =>
        (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0),
    )
    .slice(0, 3);
  const activeCpaOrder =
    cpaOrders.find(
      (order) => Boolean(order.cpa_id) && isActiveCpaEngagement(order.status),
    ) ?? null;
  const activeCpaName = activeCpaOrder
    ? [activeCpaOrder.cpa?.first_name, activeCpaOrder.cpa?.last_name]
        .filter(Boolean)
        .join(" ") || "Your CPA"
    : null;
  const metricCards = [
    ["Revenue", current.revenue, previous.revenue, false],
    [
      "Accounting expenses",
      current.accountingExpenses,
      previous.accountingExpenses,
      false,
    ],
    ["Net income", current.netIncome, previous.netIncome, true],
    [
      "Net cash movement",
      current.netCashMovement,
      previous.netCashMovement,
      true,
    ],
  ] as const;
  const firstName =
    profile?.full_name?.trim().split(/\s+/)[0] ||
    profile?.email?.split("@")[0] ||
    "there";

  return (
    <div className="monitoring-page w-full max-w-none space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">
          Good morning, {firstName} 👋
        </h1>
        <p className="text-muted-foreground">
          Here’s what changed in your business.
        </p>
        {monitoring?.generated_at && (
          <p className="mt-1 text-xs text-muted-foreground">
            BookSmart last checked your business at{" "}
            {new Date(monitoring.generated_at).toLocaleString()}.
          </p>
        )}
      </div>
      {!hasFinancialHistory ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">
                BookSmart is learning your business
              </h2>
              <p className="text-sm text-muted-foreground">
                Connect a financial account or approve imported records to begin
                monitoring changes. We need transaction history before comparing
                periods.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/user/settings">Connect an account</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {metricCards.map(([label, value, prior, signed]) => {
            const change =
              prior === 0
                ? null
                : Math.round(((value - prior) / Math.abs(prior)) * 1000) / 10;
            const direction =
              label === "Net cash movement"
                ? value < 0
                  ? "Outflow"
                  : value > 0
                    ? "Inflow"
                    : "No change"
                : null;
            return (
              <Card key={label} className="h-full">
                <CardHeader className="min-h-12 p-4 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
                    {label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex min-h-16 flex-col justify-end p-4 pt-0">
                  <div
                    className={`text-xl font-bold sm:text-2xl ${signed && value < 0 ? "text-rose-400" : ""}`}
                  >
                    {signed ? signedMoney(value) : money.format(value)}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground sm:text-xs">
                    {direction ? `${direction} • ` : ""}
                    {change === null
                      ? "No comparable baseline"
                      : `${change >= 0 ? "+" : ""}${change}% vs prior 30 days`}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <ContractorHomeSummary
        organizationId={orgId}
        start={currentStart}
        end={currentEnd}
      />
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Cash planning</h2>
            <p className="text-sm text-muted-foreground">
              Guarded estimates from verified balances and saved planning
              inputs.
            </p>
          </div>
          <Button asChild size="sm" variant="ghost" className="w-fit">
            <Link href="/user/financial-inputs">
              Manage inputs
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
        {planningError ? (
          <Card>
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="font-medium">
                  Cash planning is temporarily unavailable
                </p>
                <p className="text-sm text-muted-foreground">
                  No estimate has been substituted.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/user/financial-inputs">Review setup</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid items-stretch gap-3 lg:grid-cols-3">
            <HomePlanningCard
              loading={planningLoading}
              icon={WalletCards}
              title="Safe to Spend"
              value={planning?.readiness.safe_to_spend.safeToSpend}
              ready={planning?.readiness.safe_to_spend.available}
              detail={
                planning?.readiness.safe_to_spend.shortfall
                  ? `${money.format(planning.readiness.safe_to_spend.shortfall)} cash shortfall`
                  : planning?.verified_cash.refreshed_at
                    ? `Cash verified ${new Date(planning.verified_cash.refreshed_at).toLocaleString()}`
                    : planningSetupMessage(
                        planning?.readiness.safe_to_spend.missingInputs,
                      )
              }
              warning={Boolean(planning?.readiness.safe_to_spend.shortfall)}
            />
            <HomePlanningCard
              loading={planningLoading}
              icon={ShieldCheck}
              title="Remaining Tax Reserve"
              value={
                planning?.readiness.tax_reserve.remainingReserve ?? undefined
              }
              ready={planning?.readiness.tax_reserve.available}
              detail={
                planning?.readiness.tax_reserve.available
                  ? "Monitoring estimate—not tax advice"
                  : planningSetupMessage(
                      planning?.readiness.tax_reserve.missingInputs,
                    )
              }
            />
            <HomePlanningCard
              loading={planningLoading}
              icon={CalendarDays}
              title="30-Day Ending Cash"
              value={planning?.readiness.forecast.endingCash}
              ready={planning?.readiness.forecast.available}
              detail={
                planning?.readiness.forecast.shortfall
                  ? `${money.format(planning.readiness.forecast.shortfall)} maximum shortfall${forecastShortfallDate(planning.readiness.forecast) ? ` on ${new Date(`${forecastShortfallDate(planning.readiness.forecast)}T00:00:00`).toLocaleDateString()}` : ""}`
                  : planning?.readiness.forecast.lowestBalance != null
                    ? `Lowest point ${money.format(planning.readiness.forecast.lowestBalance)}`
                    : planningSetupMessage(
                        planning?.readiness.forecast.missingInputs,
                      )
              }
              warning={Boolean(planning?.readiness.forecast.shortfall)}
            />
          </div>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-3 p-4 sm:p-5">
            <div>
              <p className="font-semibold">Financial connections</p>
              <p className="text-sm text-muted-foreground">
                {connectionLoading
                  ? "Checking connected financial sources…"
                  : connectionError
                    ? "Connection status is temporarily unavailable."
                    : connections?.status === "connected"
                      ? "Connected sources are healthy."
                      : connections?.status === "attention"
                        ? `${connections.attentionRequired} connection${connections.attentionRequired === 1 ? " needs" : "s need"} attention.`
                        : connections?.providers.some(
                              (provider) =>
                                provider.type === "uploaded_statement",
                            )
                          ? "Uploaded financial statements are available; no live connection is active."
                          : "Connect a bank or QuickBooks for automatic monitoring."}
              </p>
              {connections?.lastDataRefresh && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Last data refresh{" "}
                  {new Date(connections.lastDataRefresh).toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {connections?.providers.map((provider) => (
                <div
                  key={provider.id}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${provider.status === "healthy" || provider.status === "available" ? "border-emerald-400/30 text-emerald-300" : "border-amber-400/30 text-amber-300"}`}
                  title={provider.error ?? undefined}
                >
                  {provider.type === "uploaded_statement" ? (
                    <CloudUpload className="h-3.5 w-3.5" />
                  ) : (
                    <Landmark className="h-3.5 w-3.5" />
                  )}
                  <span>{provider.name}</span>
                  {provider.stale && <RefreshCw className="h-3.5 w-3.5" />}
                </div>
              ))}
              <Button asChild size="sm" variant="outline">
                <Link href="/user/settings">Manage</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-4 p-4 sm:p-5">
            <div className="flex gap-3">
              <Users className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">CPA relationship</p>
                <p className="text-sm text-muted-foreground">
                  {cpaLoading
                    ? "Checking CPA access…"
                    : cpaError
                      ? "CPA access status is temporarily unavailable."
                      : activeCpaOrder
                        ? `${activeCpaName} has status-controlled access through an active engagement.`
                        : "No active CPA engagement is sharing financial access."}
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline" className="w-fit">
              <Link href="/user/my-cpa">
                {activeCpaOrder ? "View CPA access" : "Set up My CPA"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Tasks needing action</CardTitle>
            <Button asChild size="sm" variant="ghost">
              <Link href="/user/tasks">View all</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {monitoringLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading persisted tasks…
            </div>
          ) : monitoringError ? (
            <p className="text-sm text-muted-foreground">
              Tasks are temporarily unavailable.
            </p>
          ) : priorityTasks.length === 0 ? (
            <div className="flex gap-3 rounded-lg border p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
              <div>
                <p className="font-medium">No active tasks</p>
                <p className="text-sm text-muted-foreground">
                  Persisted work will appear here with its owner, priority, and
                  due date.
                </p>
              </div>
            </div>
          ) : (
            priorityTasks.map((task) => (
              <div
                key={task.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex gap-3">
                  <ListTodo className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {task.description}
                    </p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">
                      {task.priority} priority · Owner:{" "}
                      {task.assignment_role === "booksmart"
                        ? "BookSmart"
                        : task.assignment_role === "cpa"
                          ? "CPA"
                          : "You"}
                      {task.due_date
                        ? ` · Due ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString()}`
                        : " · No due date"}
                    </p>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href="/user/tasks">Review</Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>
                {monitoringLoading
                  ? "BookSmart is checking your business"
                  : `BookSmart found ${activeSignals.length} ${activeSignals.length === 1 ? "thing" : "things"}`}
              </CardTitle>
              <Button asChild size="sm" variant="ghost">
                <Link href="/user/insights">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {monitoringLoading ? (
              <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading persisted monitoring results…
              </div>
            ) : monitoringError ? (
              <div className="flex items-start justify-between gap-4 rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
                <div className="flex gap-3">
                  <CircleAlert className="mt-0.5 h-5 w-5 text-amber-400" />
                  <div>
                    <p className="font-medium">
                      Monitoring service is not available locally
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Restart the local API server to load persisted signals and
                      tasks. Financial totals above are still coming from the
                      shared accounting engine.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void retryMonitoring()}
                >
                  Retry
                </Button>
              </div>
            ) : activeSignals.length === 0 ? (
              <div className="flex gap-3 rounded-lg border p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
                <div>
                  <p className="font-medium">No active monitoring alerts</p>
                  <p className="text-sm text-muted-foreground">
                    BookSmart will show persisted, reviewable signals here. It
                    will not invent alerts from incomplete data.
                  </p>
                </div>
              </div>
            ) : (
              prioritySignals.map((signal) => (
                <div
                  key={signal.id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-4"
                >
                  <div className="flex gap-3">
                    <CircleAlert className="mt-0.5 h-5 w-5 text-amber-400" />
                    <div>
                      <p className="font-medium">{signal.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {signal.description}
                      </p>
                    </div>
                  </div>
                  {signal.cta_route && (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={signal.cta_route}>
                        {signal.cta_label ?? "Review"}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Business Health Score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasFinancialHistory ? (
              <>
                <HealthGauge score={current.health.score} />
                <div className="space-y-2 border-t pt-3 text-sm">
                  <StatusLine
                    color="bg-rose-500"
                    label={`${activeSignals.filter((item) => ["high", "critical"].includes(item.severity)).length} financial issues`}
                  />
                  <StatusLine
                    color="bg-amber-400"
                    label={`${activeTasks.length} active tasks`}
                  />
                  <StatusLine
                    color="bg-yellow-400"
                    label={`${current.unclassifiedTransactionCount} uncategorized items`}
                  />
                  <div className="flex gap-2 text-emerald-300">
                    <ShieldCheck className="h-5 w-5" />
                    <span>Canonical financial summary</span>
                  </div>
                </div>
                <Button asChild className="w-full">
                  <Link href="/user/tasks">Fix the biggest issues</Link>
                </Button>
              </>
            ) : (
              <div className="rounded-lg border p-5">
                <p className="font-medium">More data needed</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  BookSmart will calculate one shared, explainable health score
                  after approved financial activity is available.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusLine({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}
function HomePlanningCard({
  icon: Icon,
  title,
  value,
  ready,
  loading = false,
  detail,
  warning = false,
}: {
  icon: typeof WalletCards;
  title: string;
  value?: number;
  ready?: boolean;
  loading?: boolean;
  detail: string;
  warning?: boolean;
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <p className="font-semibold">{title}</p>
        </div>
        <div className="mt-4 flex-1">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking readiness…
            </div>
          ) : ready && value != null ? (
            <p
              className={`text-2xl font-bold ${warning ? "text-amber-500" : "text-emerald-500"}`}
            >
              {money.format(value)}
            </p>
          ) : (
            <p className="font-medium text-amber-500">
              More information needed
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {loading ? "Loading trusted planning inputs" : detail}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="mt-4 w-full">
          <Link href="/user/financial-inputs">
            {ready ? "View calculation" : "Finish setup"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function distinctByMeaning<
  T extends {
    title: string;
    category: string;
    severity?: string;
    percentage?: number | null;
  },
>(items: T[]) {
  const severityRank: Record<string, number> = {
    critical: 6,
    high: 5,
    medium: 4,
    low: 3,
    info: 2,
    positive: 1,
  };
  const distinct = new Map<string, T>();
  for (const item of items) {
    const normalizedTitle = item.title
      .toLowerCase()
      .replace(/-?\d+(?:\.\d+)?%/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const key = `${item.category}:${normalizedTitle}`;
    const existing = distinct.get(key);
    const itemWeight =
      (severityRank[item.severity ?? ""] ?? 0) * 1_000 +
      Math.abs(item.percentage ?? 0);
    const existingWeight = existing
      ? (severityRank[existing.severity ?? ""] ?? 0) * 1_000 +
        Math.abs(existing.percentage ?? 0)
      : -1;
    if (!existing || itemWeight > existingWeight) distinct.set(key, item);
  }
  return [...distinct.values()];
}
