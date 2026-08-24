import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowRight,
  BriefcaseBusiness,
  CircleAlert,
  Loader2,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  loadContractorIntelligence,
  type TrustedMetric,
} from "@/lib/contractor-intelligence-client";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const metricText = (metric: TrustedMetric) =>
  metric.value == null ? "Unavailable" : money.format(metric.value);
const confidenceText = (metric: TrustedMetric) =>
  metric.confidence === "high"
    ? "Verified from trusted records"
    : metric.confidence === "unavailable"
      ? "More data needed"
      : "Estimated from available records";

export function ContractorHomeSummary({
  organizationId,
  start,
  end,
}: {
  organizationId: number;
  start: Date;
  end: Date;
}) {
  const query = useQuery({
    queryKey: [
      "contractor-home-intelligence",
      organizationId,
      start.toISOString(),
      end.toISOString(),
    ],
    queryFn: () => loadContractorIntelligence(organizationId, start, end),
    retry: false,
    staleTime: 60_000,
  });
  if (query.isLoading)
    return (
      <Card aria-label="Loading contractor financial intelligence">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Loading receivables, cash, and job health…
        </CardContent>
      </Card>
    );
  if (query.isError || !query.data)
    return (
      <Card className="border-amber-400/30">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">
              Contractor financial health is temporarily unavailable
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your canonical accounting summary above is unaffected.
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
  const attentionJobs = data.jobs
    .filter((job) => ["needs_attention", "watch"].includes(job.attentionStatus))
    .slice(0, 3);
  const summary = [
    {
      label: "Outstanding invoices",
      metric: data.accountsReceivable.totalOutstanding,
    },
    {
      label: "Overdue invoices",
      metric: data.accountsReceivable.overdueAmount,
    },
    { label: "Available cash", metric: data.cashPosition.availableBalance },
    {
      label: "Jobs needing attention",
      metric: {
        value: attentionJobs.length,
        confidence: data.jobs.length ? "high" : "unavailable",
        sources: ["jobber"],
        missingInputs: data.jobs.length ? [] : ["jobber_jobs"],
      } as TrustedMetric,
      count: true,
    },
  ];
  return (
    <section
      className="space-y-3"
      aria-label="Contractor financial intelligence"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Contractor financial health</h2>
          <p className="text-sm text-muted-foreground">
            Receivables, verified cash, and current tracked job margins.
          </p>
        </div>
        <Button asChild size="sm" variant="ghost" className="w-fit">
          <Link href="/user/money">
            Open Money
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.label} className="h-full">
            <CardHeader className="min-h-12 p-4 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-16 flex-col justify-end p-4 pt-0">
              <p className="text-xl font-bold sm:text-2xl">
                {item.count && item.metric.value != null
                  ? item.metric.value
                  : metricText(item.metric)}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground sm:text-xs">
                {confidenceText(item.metric)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {attentionJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BriefcaseBusiness className="h-5 w-5 text-primary" />
              Job financial health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {attentionJobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {job.title ||
                      (job.jobNumber ? `Job #${job.jobNumber}` : "Job")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {job.currentTrackedMargin.value == null
                      ? "Not enough confirmed cost data to calculate tracked margin."
                      : `Current tracked margin: ${(job.currentTrackedMargin.value * 100).toFixed(1)}%${job.targetGrossMargin == null ? "" : ` · Target ${(job.targetGrossMargin * 100).toFixed(0)}%`}`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {job.attentionReasons
                      .map((reason) => reason.replaceAll("_", " "))
                      .join(" · ")}
                  </p>
                </div>
                <span
                  className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs capitalize ${job.attentionStatus === "needs_attention" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}
                >
                  <CircleAlert className="h-3.5 w-3.5" />
                  {job.attentionStatus.replaceAll("_", " ")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {data.bookkeepingIssues.length > 0 && (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <WalletCards className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="min-w-0">
              <p className="font-medium">Bookkeeping items need attention</p>
              <p className="text-sm text-muted-foreground">
                {data.bookkeepingIssues
                  .map(
                    (issue) =>
                      `${issue.count} ${issue.type.replaceAll("_", " ")}`,
                  )
                  .join(" · ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
