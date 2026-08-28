import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, ExternalLink, Inbox, Loader2, Mail, ReceiptText, Trash2, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  confirmContractorMatch,
  confirmContractorTransactionJob,
  extractContractorReceipt,
  linkContractorReceiptTransaction,
  loadContractorMatchQueue,
  loadContractorReceiptTransactionOptions,
  loadContractorTransactionJobQueue,
  removeContractorReceipt,
  removeContractorTransactionJobCost,
  rejectContractorMatch,
  rejectContractorTransactionJob,
  type ContractorMatchSuggestion,
  type ContractorTransactionJobSuggestion,
} from "@/lib/contractor-match-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const money = (value: number | null | undefined) =>
  value == null
    ? "Amount unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(Math.abs(value));
const friendlyReason = (reason: string) =>
  reason.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const gmailOriginalUrl = (sourceId: string, apiUrl?: string | null) => {
  if (apiUrl) return apiUrl;
  const match = /^gmail:([^:]+):(?:attachment:[^:]+|body)$/.exec(sourceId);
  return match ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(match[1]!)}` : null;
};

function EmptySection({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/20 px-6 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
        <Inbox className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function ContractorMatchReview({
  organizationId,
  highlightAssignmentId = null,
  highlightTransactionId = null,
}: {
  organizationId: number;
  highlightAssignmentId?: number | null;
  highlightTransactionId?: number | null;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [receiptToRemove, setReceiptToRemove] = useState<string | null>(null);
  const [selectedReceiptTransactions, setSelectedReceiptTransactions] = useState<Record<string, string>>({});
  const [assignmentToRemove, setAssignmentToRemove] = useState<number | null>(null);
  const [reviewTab, setReviewTab] = useState<"transactions" | "receipts">(
    window.location.hash === "#receipt-review" ? "receipts" : "transactions",
  );
  const [transactionStatusTab, setTransactionStatusTab] = useState<"review" | "approved">("review");
  const [receiptStatusTab, setReceiptStatusTab] = useState<"review" | "matched">("review");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["contractor-match-queue", organizationId],
    queryFn: () => loadContractorMatchQueue(organizationId),
    retry: false,
    staleTime: 30_000,
  });
  const transactionQuery = useQuery({
    queryKey: ["contractor-transaction-job-queue", organizationId],
    queryFn: () => loadContractorTransactionJobQueue(organizationId),
    retry: false,
    staleTime: 30_000,
  });
  const receiptTransactionOptions = useQuery({
    queryKey: ["contractor-receipt-transaction-options", organizationId],
    queryFn: () => loadContractorReceiptTransactionOptions(organizationId),
    enabled: Boolean(query.data?.receipts.some((receipt) => receipt.source === "gmail" && receipt.status === "unmatched")),
    retry: false,
    staleTime: 30_000,
  });
  const refresh = () => {
    queryClient.invalidateQueries({
      queryKey: ["contractor-match-queue", organizationId],
    });
    queryClient.invalidateQueries({
      queryKey: ["contractor-transaction-job-queue", organizationId],
    });
    queryClient.invalidateQueries({
      queryKey: ["contractor-money-intelligence", organizationId],
    });
    queryClient.invalidateQueries({
      queryKey: ["contractor-insights", organizationId],
    });
    queryClient.invalidateQueries({
      queryKey: ["contractor-home-intelligence", organizationId],
    });
    queryClient.invalidateQueries({
      queryKey: ["monitoring-projection", organizationId],
    });
  };
  const confirm = useMutation({
    mutationFn: (suggestion: ContractorMatchSuggestion) =>
      confirmContractorMatch(organizationId, suggestion),
    onSuccess: () => {
      refresh();
      toast({
        title: "Job cost confirmed",
        description:
          "The approved expense is now included in the job's tracked costs.",
      });
    },
    onError: (error) =>
      toast({
        title: "Could not confirm match",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      }),
  });
  const reject = useMutation({
    mutationFn: (sourceId: string) =>
      rejectContractorMatch(organizationId, sourceId),
    onSuccess: () => {
      refresh();
      toast({
        title: "Suggestion dismissed",
        description: "No accounting records were changed.",
      });
    },
    onError: (error) =>
      toast({
        title: "Could not dismiss suggestion",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      }),
  });
  const confirmTransaction = useMutation({
    mutationFn: (suggestion: ContractorTransactionJobSuggestion) =>
      confirmContractorTransactionJob(organizationId, suggestion),
    onSuccess: () => {
      refresh();
      toast({ title: "Job cost confirmed", description: "The existing approved expense is now included in the job's tracked costs. No receipt was required." });
    },
    onError: (error) => toast({ title: "Could not confirm match", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });
  const rejectTransaction = useMutation({
    mutationFn: (transactionId: number) => rejectContractorTransactionJob(organizationId, transactionId),
    onSuccess: () => { refresh(); toast({ title: "Suggestion dismissed", description: "No accounting records were changed." }); },
    onError: (error) => toast({ title: "Could not dismiss suggestion", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (sourceId: string) =>
      removeContractorReceipt(organizationId, sourceId),
    onSuccess: () => {
      setReceiptToRemove(null);
      refresh();
      toast({
        title: "Receipt removed",
        description:
          "Its extracted details and unconfirmed matches were removed. No accounting records were changed.",
      });
    },
    onError: (error) =>
      toast({
        title: "Could not remove receipt",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      }),
  });
  const linkReceipt = useMutation({
    mutationFn: ({ sourceId, transactionId }: { sourceId: string; transactionId: number }) => linkContractorReceiptTransaction(organizationId, sourceId, transactionId),
    onSuccess: (_, variables) => {
      setSelectedReceiptTransactions((current) => { const next = { ...current }; delete next[variables.sourceId]; return next; });
      refresh();
      toast({ title: "Receipt linked", description: "The evidence was linked to the existing transaction. No accounting values were changed." });
    },
    onError: (error) => toast({ title: "Could not link receipt", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });
  const removeAssignment = useMutation({
    mutationFn: (assignmentId: number) => removeContractorTransactionJobCost(organizationId, assignmentId),
    onSuccess: () => {
      setAssignmentToRemove(null);
      refresh();
      toast({ title: "Job assignment removed", description: "The accounting transaction and receipt were not changed. Job totals will be recalculated." });
    },
    onError: (error) => toast({ title: "Could not remove job assignment", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      setUploadResult(null);
      return extractContractorReceipt(organizationId, file);
    },
    onSuccess: (result) => {
      const summary = `${result.receipt.vendor || "Receipt"}${result.receipt.total == null ? "" : ` · ${money(result.receipt.total)}`}${result.receipt.date ? ` · ${new Date(`${result.receipt.date}T00:00:00`).toLocaleDateString()}` : ""}`;
      setUploadResult({
        tone: "success",
        message: `${summary} was extracted. No accounting record was changed.`,
      });
      refresh();
      toast({
        title: "Receipt processed",
        description: `${summary}. Review any suggested match below.`,
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Try again.";
      setUploadResult({ tone: "error", message });
      toast({
        title: "Could not process receipt",
        description: message,
        variant: "destructive",
      });
    },
  });
  const suggestions = query.data?.suggestions ?? [];
  const gmailReceipts = (query.data?.receipts ?? []).filter((receipt) => receipt.source === "gmail");
  const uploadedReceipts = (query.data?.receipts ?? []).filter((receipt) => receipt.source !== "gmail");
  const unmatchedReceipts = gmailReceipts.filter((receipt) => receipt.status === "unmatched");
  const receiptHasApprovedMatch = (receipt: (typeof gmailReceipts)[number]) => Boolean(receipt.linked_transaction || receipt.confirmed);
  const receiptsNeedingReview = (query.data?.receipts ?? []).filter(receipt => !receiptHasApprovedMatch(receipt));
  const matchedReceipts = (query.data?.receipts ?? []).filter(receiptHasApprovedMatch);
  const visibleGmailReceipts = gmailReceipts.filter(receipt => receiptStatusTab === "review" ? !receiptHasApprovedMatch(receipt) : receiptHasApprovedMatch(receipt));
  const visibleUploadedReceipts = uploadedReceipts.filter(receipt => receiptStatusTab === "review" ? !receiptHasApprovedMatch(receipt) : receiptHasApprovedMatch(receipt));
  const duplicateGmailReceiptSources = new Set<string>();
  const seenGmailReceiptFingerprints = new Set<string>();
  for (const receipt of gmailReceipts) {
    const fingerprint = receipt.receipt_number
      ? `number:${receipt.receipt_number.toLowerCase()}:${receipt.receipt_date ?? ""}`
      : receipt.vendor && receipt.receipt_date && receipt.total != null
        ? `facts:${receipt.vendor.toLowerCase()}:${receipt.receipt_date}:${Math.abs(receipt.total).toFixed(2)}`
        : "";
    if (fingerprint && seenGmailReceiptFingerprints.has(fingerprint)) duplicateGmailReceiptSources.add(receipt.source_id);
    else if (fingerprint) seenGmailReceiptFingerprints.add(fingerprint);
  }
  const transactionSuggestions = transactionQuery.data?.suggestions ?? [];
  const approvedJobCosts = transactionQuery.data?.approved ?? [];
  const selectedAssignment = approvedJobCosts.find((cost) => cost.assignmentId === assignmentToRemove) ?? null;
  const highlightedAssignment = approvedJobCosts.find((cost) => cost.assignmentId === highlightAssignmentId) ?? null;
  useEffect(() => {
    if (!highlightedAssignment) return;
    setReviewTab("transactions");
    setTransactionStatusTab("approved");
    window.setTimeout(() => document.getElementById(`job-cost-assignment-${highlightedAssignment.assignmentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }, [highlightedAssignment]);
  const highlightedSuggestion = transactionSuggestions.find(suggestion => suggestion.transaction.id === highlightTransactionId) ?? null;
  useEffect(() => {
    if (!highlightedSuggestion) return;
    setReviewTab("transactions");
    setTransactionStatusTab("review");
    window.setTimeout(() => document.getElementById(`job-match-transaction-${highlightedSuggestion.transaction.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }, [highlightedSuggestion]);
  useEffect(() => {
    if (!query.data || window.location.hash !== "#receipt-review") return;
    setReviewTab("receipts");
    window.setTimeout(() => document.getElementById("receipt-review")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }, [query.data]);
  return (
    <>
      <Tabs value={reviewTab} onValueChange={(value) => setReviewTab(value as "transactions" | "receipts")} className="space-y-3">
        <TabsList className="grid h-auto w-full grid-cols-2 p-1 sm:w-[32rem]">
          <TabsTrigger value="transactions" className="gap-2 py-2"><Banknote className="h-4 w-4" />Transactions<Badge variant="secondary" className="ml-1">{transactionSuggestions.length + approvedJobCosts.length}</Badge></TabsTrigger>
          <TabsTrigger value="receipts" className="gap-2 py-2"><ReceiptText className="h-4 w-4" />Receipts<Badge variant="secondary" className="ml-1">{query.data?.receipts.length ?? 0}</Badge></TabsTrigger>
        </TabsList>
        <TabsContent value="transactions" className="m-0">
      <Card className={`flex h-[640px] min-h-[420px] max-h-[70vh] flex-col overflow-hidden ${transactionSuggestions.length ? "border-amber-400/30" : ""}`}>
        <CardHeader className="shrink-0 border-b border-border/50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Transaction job-cost review</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Booksmart checks approved expenses against Jobber jobs. A receipt is optional.</p>
            </div>
            {transactionSuggestions.length > 0 && <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300">{transactionSuggestions.length} to review</Badge>}
          </div>
          <Tabs value={transactionStatusTab} onValueChange={(value) => setTransactionStatusTab(value as "review" | "approved")} className="mt-3">
            <TabsList className="grid h-9 w-full grid-cols-2 sm:w-80">
              <TabsTrigger value="review" className="gap-1.5 text-xs">Needs review <Badge variant="secondary">{transactionSuggestions.length}</Badge></TabsTrigger>
              <TabsTrigger value="approved" className="gap-1.5 text-xs">Approved <Badge variant="secondary">{approvedJobCosts.length}</Badge></TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {transactionStatusTab === "review" && (
        <CardContent className="space-y-2 p-4">
          {transactionQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking approved expenses against Jobber…</div>
          ) : transactionQuery.isError ? (
            <p className="text-sm text-muted-foreground">Transaction-to-job suggestions are temporarily unavailable.</p>
          ) : transactionSuggestions.length === 0 ? (
            <EmptySection title="No transaction matches need review" description="Booksmart will show approved expenses here when transaction details suggest a Jobber job." />
          ) : transactionSuggestions.map((suggestion) => {
            const busy = (confirmTransaction.isPending && confirmTransaction.variables?.transaction.id === suggestion.transaction.id)
              || (rejectTransaction.isPending && rejectTransaction.variables === suggestion.transaction.id);
            return <div id={`job-match-transaction-${suggestion.transaction.id}`} key={suggestion.transaction.id} className={`rounded-lg border p-3 ${highlightTransactionId === suggestion.transaction.id ? "ring-2 ring-primary/50" : ""}`}>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-center">
                <div className="flex min-w-0 gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-700 dark:text-amber-300"><Banknote className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="font-semibold">{suggestion.transaction.title || suggestion.transaction.description || "Expense"} · {money(suggestion.transaction.amount)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{new Date(suggestion.transaction.date_time).toLocaleDateString()} → {suggestion.job.record_number || "Job"} {suggestion.job.title || suggestion.job.external_id}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Confidence: {suggestion.confidence} ({Math.min(100, Math.round(suggestion.score))}%) · Source: {suggestion.sourceProvider}</p>
                    {suggestion.reasons.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Why it matched: {suggestion.reasons.map(friendlyReason).join(" · ")}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">Confirming assigns this existing expense once. It does not alter the accounting transaction.</p>
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 lg:w-[17rem]">
                  <Button className="w-full" size="sm" variant="outline" disabled={busy} onClick={() => rejectTransaction.mutate(suggestion.transaction.id)}><X className="mr-1.5 h-4 w-4" />Reject</Button>
                  <Button className="w-full" size="sm" disabled={busy} onClick={() => confirmTransaction.mutate(suggestion)}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Confirm</Button>
                </div>
              </div>
            </div>;
          })}
        </CardContent>
        )}
        {transactionStatusTab === "approved" && (
          <CardContent className="p-4">
            <div className="mb-3">
              <p className="font-semibold">Approved job costs</p>
              <p className="text-sm text-muted-foreground">Confirmed transaction assignments remain visible here for traceability.</p>
            </div>
            <div className="space-y-2">
              {approvedJobCosts.length === 0 ? <EmptySection title="No approved job costs yet" description="Approved transaction and Jobber job matches will appear here for traceability." /> : approvedJobCosts.map((cost) => (
                <div id={`job-cost-assignment-${cost.assignmentId}`} key={cost.assignmentId} className={`grid gap-3 rounded-lg border p-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center ${highlightAssignmentId === cost.assignmentId ? "ring-2 ring-primary/50" : ""}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                    <div className="min-w-0">
                      <p className="font-medium">{cost.transaction.title || cost.transaction.description || "Expense"} · {money(cost.amount)}</p>
                      <p className="text-xs text-muted-foreground">→ {cost.job.record_number || "Job"} {cost.job.title || cost.job.external_id}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Confirmed {new Date(cost.confirmedAt).toLocaleString()} · Source: {cost.sourceProvider} · {cost.receiptLinked ? "Receipt linked" : "Receipt missing (optional)"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_auto]">
                    <Badge variant="outline" className="w-fit border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300">Approved</Badge>
                    <Button className="w-full" size="sm" variant="outline" onClick={() => setAssignmentToRemove(cost.assignmentId)}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
        </div>
      </Card>
        </TabsContent>
        <TabsContent value="receipts" className="m-0">
      {(suggestions.length > 0 || (query.data?.receipts?.length ?? 0) > 0 || uploadResult !== null) && (
      <Card id="receipt-review" className="scroll-mt-6 overflow-hidden border-border/50">
        <CardHeader className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Receipt job-cost review</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Review receipts Booksmart matched to transactions and Jobber jobs. Upload only when a receipt is missing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(suggestions.length > 0 || unmatchedReceipts.length > 0) && (
                <Badge
                  variant="secondary"
                >
                  {suggestions.length + unmatchedReceipts.length} to review
                </Badge>
              )}
              <input
                ref={fileInput}
                className="hidden"
                type="file"
                accept="image/*,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) upload.mutate(file);
                  event.currentTarget.value = "";
                }}
              />
              <Button
                size="sm"
                disabled={upload.isPending}
                onClick={() => fileInput.current?.click()}
              >
                {upload.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}
                {upload.isPending ? "Processing…" : "Add missing receipt"}
              </Button>
            </div>
          </div>
          <Tabs value={receiptStatusTab} onValueChange={(value) => setReceiptStatusTab(value as "review" | "matched")} className="mt-3">
            <TabsList className="grid h-9 w-full grid-cols-2 sm:w-80">
              <TabsTrigger value="review" className="gap-1.5 text-xs">Needs review <Badge variant="secondary">{receiptsNeedingReview.length}</Badge></TabsTrigger>
              <TabsTrigger value="matched" className="gap-1.5 text-xs">Matched <Badge variant="secondary">{matchedReceipts.length}</Badge></TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        {visibleGmailReceipts.length > 0 && (
          <CardContent className="border-t border-border/50 bg-muted/10 p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /><p className="font-semibold">Gmail receipt inbox</p></div>
                <p className="mt-1 text-sm text-muted-foreground">Receipt evidence found by the manual Gmail scan. These items have not changed your accounting records.</p>
              </div>
              <Badge variant="secondary" className="w-fit">{visibleGmailReceipts.length} from Gmail</Badge>
            </div>
            <div className="h-[28rem] max-h-[55vh] space-y-2 overflow-y-auto overscroll-contain pr-2">
              {visibleGmailReceipts.map((receipt) => {
                const removing = remove.isPending && remove.variables === receipt.source_id;
                const originalUrl = gmailOriginalUrl(receipt.source_id, receipt.original_url);
                return <div key={receipt.source_id} className="grid gap-3 rounded-lg border border-border/50 bg-card p-3 transition-colors hover:bg-muted/20 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Mail className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{receipt.vendor || "Gmail receipt"} · {money(receipt.total)}</p><Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">Gmail</Badge>{receipt.status === "unmatched" && <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300">Unmatched</Badge>}{duplicateGmailReceiptSources.has(receipt.source_id) && <Badge variant="destructive">Possible duplicate</Badge>}</div>
                      <p className="mt-1 text-sm text-muted-foreground">{receipt.receipt_date ? new Date(`${receipt.receipt_date}T00:00:00`).toLocaleDateString() : "Date unavailable"}{receipt.receipt_number ? ` · Receipt #${receipt.receipt_number}` : ""}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{receipt.status === "unmatched" ? "No matching approved transaction was found. Keep this as evidence or delete it." : receipt.status === "awaiting_review" ? "A possible match is waiting for confirmation." : "Processed as supporting evidence."}</p>
                    </div>
                  </div>
                  <div className="grid w-full gap-2 lg:w-[24rem]">
                    {receipt.linked_transaction ? <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">Linked to {receipt.linked_transaction.title || receipt.linked_transaction.description || "transaction"} · {money(receipt.linked_transaction.amount)}</div> : <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2"><select aria-label={`Transaction for ${receipt.vendor || "Gmail receipt"}`} className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs" value={selectedReceiptTransactions[receipt.source_id] ?? ""} disabled={receiptTransactionOptions.isLoading || linkReceipt.isPending} onChange={(event) => setSelectedReceiptTransactions((current) => ({ ...current, [receipt.source_id]: event.target.value }))}><option value="">{receiptTransactionOptions.isLoading ? "Loading transactions…" : "Choose transaction…"}</option>{(receiptTransactionOptions.data?.transactions ?? []).map((transaction) => <option key={transaction.id} value={transaction.id}>{new Date(transaction.date_time).toLocaleDateString()} · {money(transaction.amount)} · {transaction.title || transaction.description || "Transaction"}</option>)}</select><Button className="w-full" size="sm" disabled={!selectedReceiptTransactions[receipt.source_id] || linkReceipt.isPending} onClick={() => linkReceipt.mutate({ sourceId: receipt.source_id, transactionId: Number(selectedReceiptTransactions[receipt.source_id]) })}>{linkReceipt.isPending && linkReceipt.variables?.sourceId === receipt.source_id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Match</Button></div>}
                    {originalUrl && <Button asChild size="sm" variant="outline"><a href={originalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />View original in Gmail</a></Button>}
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={removing || linkReceipt.isPending} onClick={() => setReceiptToRemove(receipt.source_id)}>{removing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}Delete evidence</Button>
                  </div>
                </div>;
              })}
            </div>
          </CardContent>
        )}
        {receiptStatusTab === "review" && <CardContent className="space-y-2 p-4">
          {uploadResult && (
            <div
              role="status"
              className={`rounded-lg border p-3 text-sm ${uploadResult.tone === "success" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-red-400/30 bg-red-500/10 text-red-200"}`}
            >
              {uploadResult.message}
            </div>
          )}
          {query.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking suggested job costs…
            </div>
          ) : query.isError ? (
            <p className="text-sm text-muted-foreground">
              Suggestions are temporarily unavailable. You can still upload a
              receipt and refresh this page.
            </p>
          ) : suggestions.length === 0 && unmatchedReceipts.length > 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {`${unmatchedReceipts.length} unmatched receipt${unmatchedReceipts.length === 1 ? "" : "s"}`}
              </p>
              <p className="mt-1">
                These receipts are listed below as supporting evidence. No accounting transaction has been changed.
              </p>
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map((suggestion) => {
              const busy =
                (confirm.isPending &&
                  confirm.variables?.sourceId === suggestion.sourceId) ||
                (reject.isPending && reject.variables === suggestion.sourceId);
              const ready = Boolean(suggestion.transaction && suggestion.job);
              return (
                <div
                  key={suggestion.sourceId}
                  className="rounded-lg border p-3"
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-center">
                    <div className="flex min-w-0 gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-700 dark:text-amber-300">
                        <ReceiptText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {suggestion.receipt?.vendor || "Receipt"} ·{" "}
                          {money(suggestion.receipt?.total)}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {suggestion.receipt?.receipt_date
                            ? new Date(
                                `${suggestion.receipt.receipt_date}T00:00:00`,
                              ).toLocaleDateString()
                            : "Date unavailable"}{" "}
                          →{" "}
                          {suggestion.job
                            ? `${suggestion.job.record_number || "Job"} ${suggestion.job.title || suggestion.job.external_id}`
                            : "No Jobber job match"}
                        </p>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                          <span>
                            Bank:{" "}
                            {suggestion.transaction
                              ? `${suggestion.transaction.title || suggestion.transaction.description || "Expense"} · ${money(suggestion.transaction.amount)}`
                              : "No transaction match"}
                          </span>
                          <span>
                            Confidence: {suggestion.confidence} (
                            {Math.min(100, Math.round(suggestion.score))}%)
                          </span>
                          {suggestion.receipt?.po_number && (
                            <span>PO: {suggestion.receipt.po_number}</span>
                          )}
                          {suggestion.receipt?.job_number && (
                            <span>
                              Receipt job #: {suggestion.receipt.job_number}
                            </span>
                          )}
                        </div>
                        {suggestion.reasons?.length > 0 && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Why it matched:{" "}
                            {suggestion.reasons.map(friendlyReason).join(" · ")}
                          </p>
                        )}
                        {!ready && (
                          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                            This suggestion is incomplete and cannot be
                            confirmed yet.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 lg:w-[17rem]">
                      <Button
                        className="w-full"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => reject.mutate(suggestion.sourceId)}
                      >
                        <X className="mr-1.5 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        className="w-full"
                        size="sm"
                        disabled={busy || !ready}
                        onClick={() => confirm.mutate(suggestion)}
                      >
                        {busy ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-1.5 h-4 w-4" />
                        )}
                        Confirm
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : null}
        </CardContent>}
        {visibleUploadedReceipts.length > 0 && (
          <CardContent className="border-t pt-5">
            <div className="mb-3">
              <p className="font-semibold">Receipt evidence</p>
              <p className="text-sm text-muted-foreground">
                Uploaded receipts processed for matching. Removing one does not
                delete or change accounting transactions.
              </p>
            </div>
            <div className="space-y-2">
              {visibleUploadedReceipts.map((receipt) => {
                const removing =
                  remove.isPending && remove.variables === receipt.source_id;
                return (
                  <div
                    key={receipt.source_id}
                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <ReceiptText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="font-medium">
                          {receipt.vendor || "Receipt"} · {money(receipt.total)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {receipt.receipt_date
                            ? new Date(
                                `${receipt.receipt_date}T00:00:00`,
                              ).toLocaleDateString()
                            : "Date unavailable"}{" "}
                          ·{" "}
                          {receipt.status === "unmatched"
                            ? "Unmatched — available for manual review"
                            : receipt.status === "awaiting_review"
                              ? "Waiting for review"
                              : "Processed"} · Uploaded
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={removing}
                      onClick={() => setReceiptToRemove(receipt.source_id)}
                    >
                      {removing ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1.5 h-4 w-4" />
                      )}
                      Delete receipt
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        )}
        {((receiptStatusTab === "review" && receiptsNeedingReview.length === 0) || (receiptStatusTab === "matched" && matchedReceipts.length === 0)) && (
          <CardContent className="p-4"><EmptySection title={receiptStatusTab === "review" ? "No receipts need review" : "No approved receipt matches yet"} description={receiptStatusTab === "review" ? "Receipt matches that need your confirmation will appear here." : "Receipts linked to approved transactions will appear here for traceability."} /></CardContent>
        )}
      </Card>
      )}
        </TabsContent>
      </Tabs>
      <AlertDialog
        open={receiptToRemove !== null}
        onOpenChange={(open) => !open && setReceiptToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>Delete this receipt only?</AlertDialogTitle>
          <AlertDialogDescription>
              The receipt evidence, extracted details, and receipt-match links
              will be permanently deleted. The accounting transaction and any
              confirmed tracked job cost will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={() => receiptToRemove && remove.mutate(receiptToRemove)}
            >
              {remove.isPending ? "Deleting…" : "Delete receipt only"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={assignmentToRemove !== null} onOpenChange={(open) => !open && setAssignmentToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this job assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {selectedAssignment ? money(selectedAssignment.amount) : "this expense"} from {selectedAssignment ? selectedAssignment.job.title || selectedAssignment.job.record_number || selectedAssignment.job.external_id : "the Jobber job"}? The original transaction and receipt will not be deleted. Job totals and tracked margin will be recalculated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeAssignment.isPending}
              onClick={() => assignmentToRemove && removeAssignment.mutate(assignmentToRemove)}
            >
              {removeAssignment.isPending ? "Removing…" : "Remove job assignment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
