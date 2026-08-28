import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  ListChecks,
  Loader2,
  Inbox,
  RefreshCw,
  ReceiptText,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  loadContractorIntelligence,
  type ContractorIntelligence,
  type TrustedMetric,
} from "@/lib/contractor-intelligence-client";
import { loadContractorMatchQueue } from "@/lib/contractor-match-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  for (const invoice of (data.accountsReceivable.overdueInvoices ?? []).slice(0, 2))
    risks.push({
      tone: "risk",
      title: `${invoice.number ? `Invoice #${invoice.number}` : invoice.title || "Jobber invoice"} · ${money.format(invoice.balance)} overdue`,
      detail: invoice.dueDate ? `Due ${new Date(`${invoice.dueDate}T00:00:00`).toLocaleDateString()}.` : "This exact Jobber invoice needs follow-up.",
      route: `/user/jobber-records?object_type=invoices&record_id=${encodeURIComponent(invoice.id)}`,
    });
  if (expenseChange != null && expenseChange > 0.15)
    risks.push({
      tone: "risk",
      title: `Expenses increased ${(expenseChange * 100).toFixed(1)}%`,
      detail:
        "Approved accounting expenses rose versus the previous equivalent period.",
    });
  if (data.netCashMovement.value != null && data.netCashMovement.value < 0)
    risks.push({
      tone: "risk",
      title: "Cash movement is negative",
      detail: `${money.format(Math.abs(data.netCashMovement.value))} more cash left than entered during this period.`,
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
      route: `/user/jobber-records?object_type=jobs&record_id=${encodeURIComponent(job.id)}`,
    });
  for (const transaction of data.unusualTransactions.slice(0, 2))
    risks.push({
      tone: "risk",
      title: `${transaction.title || "Approved purchase"} · ${money.format(transaction.amount)}`,
      detail: `Approved ${new Date(transaction.date).toLocaleDateString()} · ${transaction.reasons.map(label).join(" · ")}.`,
      route: `/user/reports?tab=transactions&transaction_id=${encodeURIComponent(transaction.transactionId)}`,
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
      route: `/user/jobber-records?object_type=jobs&record_id=${encodeURIComponent(attentionJob.id)}`,
    });
  const firstOverdueInvoice = data.accountsReceivable.overdueInvoices?.[0];
  if (firstOverdueInvoice)
    actions.push({
      tone: "action",
      title: `Follow up on ${firstOverdueInvoice.number ? `invoice #${firstOverdueInvoice.number}` : "the overdue invoice"}`,
      detail: `${money.format(firstOverdueInvoice.balance)} is overdue in Jobber.`,
      route: `/user/jobber-records?object_type=invoices&record_id=${encodeURIComponent(firstOverdueInvoice.id)}`,
    });
  if (!actions.length)
    actions.push({
      tone: "action",
      title: "Keep records current",
      detail:
        "Continue reviewing receipts, transactions, and Jobber activity as new information arrives.",
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
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const receiptEvidence = useQuery({
    queryKey: ["contractor-match-queue", organizationId],
    queryFn: () => loadContractorMatchQueue(organizationId),
    retry: false,
    staleTime: 30_000,
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
  const receiptByTransactionId = new Map((receiptEvidence.data?.receipts ?? [])
    .filter(receipt => receipt.linked_transaction)
    .map(receipt => [String(receipt.linked_transaction!.id), receipt]));
  const confirmedJobCosts = (data.confirmedJobCosts ?? []).map(cost => {
    const receipt = receiptByTransactionId.get(cost.transactionId);
    return receipt ? { ...cost, receiptApproved: true, receiptSourceId: receipt.source_id } : cost;
  });
  const items = buildItems(data);
  const sourceFreshness = Object.entries(data.dataFreshness)
    .filter(([, value]) => value)
    .sort((a, b) => new Date(b[1]!).getTime() - new Date(a[1]!).getTime());
  return (
    <section className="space-y-4" aria-label="Contractor intelligence summary">
      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-3 md:divide-x md:divide-border/60">
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
      </Card>
      <ApprovedJobCostEvidence costs={confirmedJobCosts} />
      <InsightOverview items={items} />
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

function gmailReceiptUrl(sourceId: string | null) {
  if (!sourceId) return null;
  const match = /^gmail:([^:]+):(?:attachment:[^:]+|body)$/.exec(sourceId);
  return match ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(match[1]!)}` : null;
}

function ApprovedJobCostEvidence({ costs }: { costs: ContractorIntelligence["confirmedJobCosts"] }) {
  return <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 p-4">
      <div><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-primary" />Approved job-cost evidence</CardTitle><CardDescription>Confirmed transaction, Jobber job, and receipt links in one place.</CardDescription></div>
      <Badge variant="outline">{costs.length} confirmed</Badge>
    </CardHeader>
    <CardContent className="space-y-2 px-4 pb-4">
      {costs.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/20 px-6 py-8 text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary"><Inbox className="h-6 w-6" /></div><p className="font-semibold">No approved job-cost evidence yet</p><p className="mt-1 max-w-md text-sm text-muted-foreground">Approved transaction, Jobber job, and receipt evidence will appear together here.</p></div> : costs.map(cost => {
        const receiptUrl = gmailReceiptUrl(cost.receiptSourceId);
        return <div key={`${cost.transactionId}:${cost.jobberJobId}`} className="grid gap-3 rounded-lg border border-border/60 bg-background/20 p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0"><p className="truncate font-semibold">{cost.transactionTitle || `Transaction #${cost.transactionId}`} · {money.format(cost.amount)}</p><div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><Badge variant="outline" className="h-5">Approved</Badge><span>→</span><span>{[cost.jobNumber, cost.jobTitle].filter(Boolean).join(" · ") || cost.jobberJobId}</span><span>→</span><span className={cost.receiptApproved ? "text-emerald-700 dark:text-emerald-300" : ""}>{cost.receiptApproved ? "Receipt linked" : "Receipt missing"}</span>{cost.confirmedAt && <span>· {new Date(cost.confirmedAt).toLocaleDateString()}</span>}</div></div>
          <div className="flex flex-wrap gap-2 lg:justify-end"><Button asChild size="sm" variant="outline"><Link href="/user/tasks">View transaction</Link></Button>{cost.receiptApproved ? (receiptUrl ? <Button asChild size="sm" variant="outline"><a href={receiptUrl} target="_blank" rel="noopener noreferrer">View receipt<ArrowRight className="ml-1 h-3.5 w-3.5" /></a></Button> : <Button asChild size="sm" variant="outline"><Link href="/user/tasks">View receipt</Link></Button>) : <Button asChild size="sm" variant="outline"><Link href="/user/tasks">Add receipt</Link></Button>}</div>
        </div>;
      })}
    </CardContent>
  </Card>;
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
    <div className="min-w-0 border-b border-border/60 p-4 last:border-b-0 md:border-b-0">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-semibold">{metric(value)}</p>
        <p className={`mt-1.5 flex items-start gap-1 text-xs font-medium ${change.value === 0 ? "text-muted-foreground" : changeTone}`}>
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
    </div>
  );
}
function InsightOverview({ items }: { items: { risks: InsightItem[]; positives: InsightItem[]; actions: InsightItem[] } }) {
  const [tab, setTab] = useState<"risks" | "positive" | "actions">("risks");
  const groups = {
    risks: { title: "Financial risks", empty: "No supported high-priority financial risk was detected.", tone: "risk" as const, icon: AlertTriangle, items: items.risks },
    positive: { title: "Positive trends", empty: "More comparison history is needed to identify a reliable positive trend.", tone: "positive" as const, icon: CheckCircle2, items: items.positives },
    actions: { title: "Recommended actions", empty: "No supported action is available.", tone: "action" as const, icon: ListChecks, items: items.actions },
  };
  const group = groups[tab];
  const Icon = group.icon;
  return (
    <Card className="overflow-hidden">
      <Tabs value={tab} onValueChange={value => setTab(value as typeof tab)}>
        <CardHeader className="p-4 pb-3"><CardTitle>Business insight overview</CardTitle><TabsList className="mt-3 grid h-9 w-full grid-cols-3"><TabsTrigger value="risks" className="gap-1.5 text-xs">Risks <Badge variant="secondary">{items.risks.length}</Badge></TabsTrigger><TabsTrigger value="positive" className="gap-1.5 text-xs">Positive <Badge variant="secondary">{items.positives.length}</Badge></TabsTrigger><TabsTrigger value="actions" className="gap-1.5 text-xs">Actions <Badge variant="secondary">{items.actions.length}</Badge></TabsTrigger></TabsList></CardHeader>
        <TabsContent value={tab} className="m-0"><CardContent className="space-y-2 px-4 pb-4">
        <div className="flex items-center gap-2 pb-1"><Icon className={`h-4 w-4 ${group.tone === "risk" ? "text-rose-500" : group.tone === "positive" ? "text-emerald-500" : "text-amber-500"}`} /><p className="text-sm font-semibold">{group.title}</p></div>
        {group.items.length ? (
          group.items.map((item, index) => (
            <div
              key={`${item.title}:${index}`}
              className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div><p className="font-medium">{item.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p></div>
              {item.route && (
                <Button asChild size="sm" variant="outline" className="shrink-0"><Link href={item.route}>Review<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
              )}
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">{group.empty}</p>
        )}
      </CardContent></TabsContent></Tabs>
    </Card>
  );
}
