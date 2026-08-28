import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CircleDollarSign,
  Loader2,
  ReceiptText,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  loadContractorIntelligence,
  type ContractorJobSummary,
  type TrustedMetric,
} from "@/lib/contractor-intelligence-client";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const metric = (value: TrustedMetric) =>
  value.value == null ? "Unavailable" : money.format(value.value);
const confidence = (value: TrustedMetric) =>
  value.confidence === "high"
    ? "Trusted records"
    : value.confidence === "unavailable"
      ? "More data needed"
      : "Estimated";

export function ContractorMoneySummary({
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
      "contractor-money-intelligence",
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
      <Card>
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Loading receivables and job financials…
        </CardContent>
      </Card>
    );
  if (query.isError || !query.data)
    return (
      <Card className="border-amber-400/30">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">
              Contractor Money is temporarily unavailable
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {query.error instanceof Error
                ? query.error.message
                : "Refresh this page or try again shortly."}
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
  const trackedJobs = data.jobs.filter(
    (job) =>
      job.currentTrackedMargin.value != null || job.trackedCosts.value != null,
  );
  const jobs = trackedJobs.slice(0, 8);
  return (
    <section className="space-y-4" aria-label="Contractor money intelligence">
      <div>
        <h2 className="text-xl font-semibold">Contractor Money</h2>
        <p className="text-sm text-muted-foreground">
          Operational receivables and current tracked job performance. Jobber
          values are not added to accounting revenue.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <MetricCard
          icon={CircleDollarSign}
          label="Outstanding"
          value={data.accountsReceivable.totalOutstanding}
          detail={`${data.accountsReceivable.overdueInvoiceCount} overdue invoice${data.accountsReceivable.overdueInvoiceCount === 1 ? "" : "s"}`}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Overdue"
          value={data.accountsReceivable.overdueAmount}
          detail={
            data.accountsReceivable.averageInvoiceAgeDays.value == null
              ? "Invoice age unavailable"
              : `${Math.round(data.accountsReceivable.averageInvoiceAgeDays.value)} average days outstanding`
          }
          warning
        />
        <MetricCard
          icon={BriefcaseBusiness}
          label="Tracked job costs"
          value={{
            value: trackedJobs.reduce(
              (sum, job) => sum + Number(job.trackedCosts.value ?? 0),
              0,
            ),
            confidence: trackedJobs.length ? "high" : "unavailable",
            sources: ["booksmart"],
            missingInputs: trackedJobs.length ? [] : ["confirmed_job_costs"],
          }}
          detail={`${trackedJobs.length} job${trackedJobs.length === 1 ? "" : "s"} with tracked financial data`}
        />
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card id="job-financial-health" className="h-full scroll-mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BriefcaseBusiness className="h-5 w-5 text-primary" />
              Job financial health
            </CardTitle>
            <CardDescription>
              Current tracked margin—not final projected profit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.length === 0 ? (
              <Empty text="Confirm transaction-to-job assignments to calculate tracked job margins." />
            ) : (
              jobs.map((job) => <JobRow key={job.id} job={job} />)
            )}
          </CardContent>
        </Card>
        <Card id="receivables" className="h-full scroll-mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Who owes you
            </CardTitle>
            <CardDescription>
              Largest explicit Jobber invoice balances.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.accountsReceivable.largestCustomerBalances.length === 0 ? (
              <Empty text="No explicit outstanding customer balances are available from Jobber." />
            ) : (
              data.accountsReceivable.largestCustomerBalances.map(
                (customer) => (
                  <div
                    key={customer.customerId}
                    className="flex items-center justify-between gap-4 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {customer.customerName || "Unnamed Jobber customer"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {customer.overdue > 0
                          ? `${money.format(customer.overdue)} overdue`
                          : "No overdue balance detected"}
                      </p>
                    </div>
                    <p className="font-semibold">
                      {money.format(customer.outstanding)}
                    </p>
                  </div>
                ),
              )
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card id="expense-movement" className="h-full scroll-mt-6">
          <CardHeader>
            <CardTitle>Expense movement</CardTitle>
            <CardDescription>
              Canonical expense groups versus the previous equivalent period.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.expenseCategoryChanges.length === 0 ? (
              <Empty text="No supported expense-group comparison is available." />
            ) : (
              data.expenseCategoryChanges.map((group) => (
                <div
                  key={group.key}
                  className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{group.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Previous {money.format(group.previous)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {money.format(group.current)}
                    </p>
                    <p
                      className={`text-xs ${group.changePercent != null && group.changePercent > 0 ? "text-rose-400" : "text-muted-foreground"}`}
                    >
                      {group.changePercent == null
                        ? "No baseline"
                        : `${group.changePercent >= 0 ? "+" : ""}${(group.changePercent * 100).toFixed(1)}%`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card id="unusual-transactions" className="h-full scroll-mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-primary" />
              Unusual approved purchases
            </CardTitle>
            <CardDescription>
              Large trusted transactions that may deserve review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.unusualTransactions.length === 0 ? (
              <Empty text="No unusually large approved purchases were detected in this period." />
            ) : (
              data.unusualTransactions.map((transaction) => (
                <Link
                  key={transaction.transactionId}
                  href={`/user/reports?tab=transactions&sourceTransaction=${encodeURIComponent(transaction.transactionId)}`}
                  className="flex items-center justify-between gap-4 rounded-lg border p-3 transition-colors hover:bg-muted/40"
                >
                  <div>
                    <p className="font-medium">
                      {transaction.title || "Transaction"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(transaction.date).toLocaleDateString()} ·{" "}
                      {transaction.reasons
                        .map((reason) => reason.replaceAll("_", " "))
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-xs text-primary">
                      Open canonical transaction ledger
                    </p>
                  </div>
                  <p className="font-semibold text-rose-700 dark:text-rose-300">
                    {money.format(transaction.amount)}
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  warning = false,
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: TrustedMetric;
  detail: string;
  warning?: boolean;
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full items-start gap-3 p-5">
        <div
          className={`shrink-0 rounded-lg p-2 ${warning && Number(value.value ?? 0) > 0 ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-primary/10 text-primary"}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col self-stretch">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{metric(value)}</p>
          <p className="mt-auto pt-1 text-xs text-muted-foreground">
            {detail} · {confidence(value)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
function JobRow({ job }: { job: ContractorJobSummary }) {
  const margin = job.currentTrackedMargin.value;
  return (
    <Link
      href={`/user/jobber-records?object_type=jobs&record_id=${encodeURIComponent(job.id)}`}
      className="grid gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40 sm:grid-cols-[1fr_auto_auto] sm:items-center"
    >
      <div>
        <p className="font-medium">
          {job.title || (job.jobNumber ? `Job #${job.jobNumber}` : "Job")}
        </p>
        <p className="text-xs text-muted-foreground">
          Tracked costs {metric(job.trackedCosts)} · Invoiced{" "}
          {metric(job.amountInvoiced)}
        </p>
        <p className="mt-1 text-xs text-primary">
          Open synchronized Jobber source
        </p>
      </div>
      <div className="sm:text-right">
        <p className="text-xs text-muted-foreground">Tracked margin</p>
        <p
          className={`font-semibold ${margin != null && job.targetGrossMargin != null && margin < job.targetGrossMargin ? "text-rose-700 dark:text-rose-300" : ""}`}
        >
          {margin == null ? "Unavailable" : `${(margin * 100).toFixed(1)}%`}
        </p>
      </div>
      <span
        className={`w-fit rounded-full px-2 py-1 text-xs capitalize ${job.attentionStatus === "needs_attention" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : job.attentionStatus === "watch" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : job.attentionStatus === "insufficient_data" ? "bg-muted text-muted-foreground" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}
      >
        {job.attentionStatus.replaceAll("_", " ")}
      </span>
    </Link>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      {text}
    </p>
  );
}
