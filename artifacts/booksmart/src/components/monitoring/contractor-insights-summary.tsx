import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Lightbulb,
  ListChecks,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  loadContractorIntelligence,
  type ContractorIntelligence,
  type TrustedMetric,
} from "@/lib/contractor-intelligence-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const metric = (value: TrustedMetric) =>
  value.value == null ? "Unavailable" : money.format(value.value);
const percent = (value: TrustedMetric) =>
  value.value == null
    ? "No reliable comparison"
    : `${value.value >= 0 ? "+" : ""}${(value.value * 100).toFixed(1)}%`;
const label = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
type InsightItem = {
  title: string;
  detail: string;
  route?: string;
  tone: "risk" | "positive" | "action";
};

function buildItems(data: ContractorIntelligence) {
  const risks: InsightItem[] = [];
  const positives: InsightItem[] = [];
  const actions: InsightItem[] = [];
  const expenseChange =
    data.comparisons.previousPeriod.expenseChangePercent.value;
  const revenueChange =
    data.comparisons.previousPeriod.revenueChangePercent.value;
  const netChange =
    data.comparisons.previousPeriod.netIncomeChangePercent.value;
  if (
    data.accountsReceivable.overdueAmount.value &&
    data.accountsReceivable.overdueAmount.value > 0
  )
    risks.push({
      tone: "risk",
      title: `${money.format(data.accountsReceivable.overdueAmount.value)} is overdue`,
      detail: `${data.accountsReceivable.overdueInvoiceCount} Jobber invoice${data.accountsReceivable.overdueInvoiceCount === 1 ? "" : "s"} need follow-up.`,
      route: "/user/money",
    });
  if (expenseChange != null && expenseChange > 0.15)
    risks.push({
      tone: "risk",
      title: `Expenses increased ${(expenseChange * 100).toFixed(1)}%`,
      detail:
        "Approved accounting expenses rose versus the previous equivalent period.",
      route: "/user/money",
    });
  if (data.netCashMovement.value != null && data.netCashMovement.value < 0)
    risks.push({
      tone: "risk",
      title: "Cash movement is negative",
      detail: `${money.format(Math.abs(data.netCashMovement.value))} more cash left than entered during this period.`,
      route: "/user/money",
    });
  for (const job of data.jobs
    .filter((item) => item.attentionStatus === "needs_attention")
    .slice(0, 2))
    risks.push({
      tone: "risk",
      title: `${job.title || job.jobNumber || "A job"} needs attention`,
      detail:
        job.attentionReasons.map(label).join(" · ") ||
        "Tracked financial performance needs review.",
      route: "/user/money",
    });
  if (data.unusualTransactions.length)
    risks.push({
      tone: "risk",
      title: `${data.unusualTransactions.length} unusual approved purchase${data.unusualTransactions.length === 1 ? "" : "s"}`,
      detail:
        "These are existing approved expenses that stand out from recent activity.",
      route: "/user/money",
    });
  if (revenueChange != null && revenueChange > 0)
    positives.push({
      tone: "positive",
      title: `Revenue increased ${(revenueChange * 100).toFixed(1)}%`,
      detail:
        "Canonical revenue improved versus the previous equivalent period.",
    });
  if (netChange != null && netChange > 0)
    positives.push({
      tone: "positive",
      title: `Net income improved ${(netChange * 100).toFixed(1)}%`,
      detail:
        "Canonical net income improved versus the previous equivalent period.",
    });
  if (expenseChange != null && expenseChange < 0)
    positives.push({
      tone: "positive",
      title: `Expenses decreased ${Math.abs(expenseChange * 100).toFixed(1)}%`,
      detail:
        "Approved expenses declined versus the previous equivalent period.",
    });
  const healthyJobs = data.jobs.filter(
    (job) => job.attentionStatus === "healthy",
  );
  if (healthyJobs.length)
    positives.push({
      tone: "positive",
      title: `${healthyJobs.length} tracked job${healthyJobs.length === 1 ? " is" : "s are"} healthy`,
      detail:
        "Current tracked information is not showing a margin or receivable warning.",
    });
  if (data.accountsReceivable.overdueAmount.value === 0)
    positives.push({
      tone: "positive",
      title: "No overdue Jobber balance detected",
      detail:
        "Connected Jobber records show no explicit overdue invoice balance.",
    });
  for (const issue of data.bookkeepingIssues.slice(0, 2))
    actions.push({
      tone: "action",
      title: `Review ${issue.count} ${label(issue.type).toLowerCase()}`,
      detail:
        "Resolving this will improve the reliability of contractor intelligence.",
      route: issue.type.includes("receipt") ? "/user/tasks" : "/user/reports",
    });
  const attentionJob = data.jobs.find((job) =>
    ["needs_attention", "watch"].includes(job.attentionStatus),
  );
  if (attentionJob)
    actions.push({
      tone: "action",
      title: `Review ${attentionJob.title || attentionJob.jobNumber || "job financials"}`,
      detail:
        attentionJob.attentionReasons.map(label).join(" · ") ||
        "Review current tracked performance.",
      route: "/user/money",
    });
  if (data.accountsReceivable.overdueInvoiceCount > 0)
    actions.push({
      tone: "action",
      title: "Follow up on overdue invoices",
      detail: "Start with the largest explicit overdue customer balance.",
      route: "/user/money",
    });
  if (!actions.length)
    actions.push({
      tone: "action",
      title: "Keep records current",
      detail:
        "Continue reviewing receipts, transactions, and Jobber activity as new information arrives.",
      route: "/user/tasks",
    });
  return {
    risks: risks.slice(0, 3),
    positives: positives.slice(0, 3),
    actions: actions.slice(0, 3),
  };
}

export function ContractorInsightsSummary({
  organizationId,
}: {
  organizationId: number;
}) {
  const period = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    return { start, end };
  }, []);
  const query = useQuery({
    queryKey: [
      "contractor-insights",
      organizationId,
      period.start.toISOString(),
      period.end.toISOString(),
    ],
    queryFn: () =>
      loadContractorIntelligence(organizationId, period.start, period.end),
    retry: false,
    staleTime: 60_000,
  });
  if (query.isLoading)
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Building contractor insights from trusted records…
        </CardContent>
      </Card>
    );
  if (query.isError || !query.data)
    return (
      <Card className="border-amber-400/30">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">
              Contractor insights are temporarily unavailable
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              The signal history below remains available. Refresh after checking
              your connections.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  const data = query.data;
  const items = buildItems(data);
  const sourceFreshness = Object.entries(data.dataFreshness)
    .filter(([, value]) => value)
    .sort((a, b) => new Date(b[1]!).getTime() - new Date(a[1]!).getTime());
  return (
    <section className="space-y-4" aria-label="Contractor intelligence summary">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          title="Revenue this month"
          value={data.revenue}
          change={data.comparisons.previousPeriod.revenueChangePercent}
        />
        <Metric
          title="Expenses this month"
          value={data.expenses}
          change={data.comparisons.previousPeriod.expenseChangePercent}
        />
        <Metric
          title="Net income this month"
          value={data.netIncome}
          change={data.comparisons.previousPeriod.netIncomeChangePercent}
        />
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-3">
        <InsightList
          title="Top financial risks"
          tone="risk"
          empty="No supported high-priority financial risk was detected."
          icon={AlertTriangle}
          items={items.risks}
        />
        <InsightList
          title="Positive trends"
          tone="positive"
          empty="More comparison history is needed to identify a reliable positive trend."
          icon={CheckCircle2}
          items={items.positives}
        />
        <InsightList
          title="Actions to take next"
          tone="action"
          empty="No supported action is available."
          icon={ListChecks}
          items={items.actions}
        />
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Confidence and evidence
              </CardTitle>
              <CardDescription>
                Why these insights are available and what BookSmart still needs.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit capitalize">
              {data.dataConfidence} confidence
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <p className="font-medium">Sources used</p>
            <p className="mt-1 text-muted-foreground">
              {data.dataSources.length
                ? data.dataSources.map(label).join(" · ")
                : "No connected sources"}
            </p>
          </div>
          <div>
            <p className="font-medium">Latest source activity</p>
            <p className="mt-1 text-muted-foreground">
              {sourceFreshness.length
                ? `${label(sourceFreshness[0]![0])} · ${new Date(sourceFreshness[0]![1]!).toLocaleString()}`
                : "No reliable source timestamp"}
            </p>
          </div>
          <div>
            <p className="font-medium">Missing inputs</p>
            <p className="mt-1 text-muted-foreground">
              {data.missingInputs.length
                ? data.missingInputs.map(label).join(" · ")
                : "No major source gap detected"}
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({
  title,
  value,
  change,
}: {
  title: string;
  value: TrustedMetric;
  change: TrustedMetric;
}) {
  const rising = Number(change.value ?? 0) >= 0;
  const favorable = change.value == null ? null : title.toLowerCase().includes("expense") ? !rising : rising;
  const changeTone = favorable == null ? "text-muted-foreground" : favorable ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300";
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col p-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-semibold">{metric(value)}</p>
        <p className={`mt-auto flex items-start gap-1 pt-2 text-xs font-medium ${changeTone}`}>
          {change.value == null ? (
            <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : rising ? (
            <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          {percent(change)} versus previous period ·{" "}
          {value.confidence === "high" ? "Trusted records" : "Estimated"}
        </p>
      </CardContent>
    </Card>
  );
}
function InsightList({
  title,
  tone,
  empty,
  icon: Icon,
  items,
}: {
  title: string;
  tone: InsightItem["tone"];
  empty: string;
  icon: typeof Lightbulb;
  items: InsightItem[];
}) {
  return (
    <Card className={`h-full ${tone === "risk" ? "border-rose-400/45" : tone === "positive" ? "border-emerald-400/45" : "border-amber-400/35"}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${tone === "risk" ? "text-rose-500" : tone === "positive" ? "text-emerald-500" : "text-amber-500"}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length ? (
          items.map((item, index) => (
            <div
              key={`${item.title}:${index}`}
              className={`rounded-lg border px-3 py-2.5 ${item.tone === "risk" ? "border-rose-400/35 bg-rose-500/10" : item.tone === "positive" ? "border-emerald-400/35 bg-emerald-500/10" : "border-amber-400/30 bg-amber-500/10"}`}
            >
              <p className="font-medium">
                {index + 1}. {item.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.detail}
              </p>
              {item.route && (
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="mt-1 h-7 px-0"
                >
                  <Link href={item.route}>
                    Review evidence
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}
