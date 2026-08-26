import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Loader2, Mail, ReceiptText, Send, Trash2, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  confirmContractorMatch,
  confirmContractorTransactionJob,
  extractContractorReceipt,
  linkContractorReceiptTransaction,
  loadContractorMatchQueue,
  loadContractorReceiptTransactionOptions,
  loadContractorTransactionJobQueue,
  loadJobberExpensePreview,
  removeContractorReceipt,
  removeContractorTransactionJobCost,
  rejectContractorMatch,
  rejectContractorTransactionJob,
  sendJobCostToJobber,
  type ContractorMatchSuggestion,
  type ContractorTransactionJobSuggestion,
  type JobberExpensePreview,
} from "@/lib/contractor-match-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [expensePreview, setExpensePreview] = useState<{ assignmentId: number; data: JobberExpensePreview } | null>(null);
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
  const previewExpense = useMutation({
    mutationFn: (assignmentId: number) => loadJobberExpensePreview(organizationId, assignmentId),
    onSuccess: (data, assignmentId) => setExpensePreview({ assignmentId, data }),
    onError: (error) => toast({ title: "Could not prepare Jobber expense", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
  });
  const sendExpense = useMutation({
    mutationFn: (assignmentId: number) => sendJobCostToJobber(organizationId, assignmentId),
    onSuccess: () => { setExpensePreview(null); refresh(); toast({ title: "Expense sent to Jobber", description: "Jobber now has one expense linked to the confirmed job. The BookSmart transaction was not changed." }); },
    onError: (error) => toast({ title: "Could not send expense", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
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
    window.setTimeout(() => document.getElementById(`job-cost-assignment-${highlightedAssignment.assignmentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }, [highlightedAssignment]);
  const highlightedSuggestion = transactionSuggestions.find(suggestion => suggestion.transaction.id === highlightTransactionId) ?? null;
  useEffect(() => {
    if (!highlightedSuggestion) return;
    window.setTimeout(() => document.getElementById(`job-match-transaction-${highlightedSuggestion.transaction.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }, [highlightedSuggestion]);
  useEffect(() => {
    if (!query.data || window.location.hash !== "#receipt-review") return;
    window.setTimeout(() => document.getElementById("receipt-review")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }, [query.data]);
  return (
    <>
      <Card className={`flex h-[640px] min-h-[420px] max-h-[70vh] flex-col overflow-hidden ${transactionSuggestions.length ? "border-amber-400/30" : ""}`}>
        <CardHeader className="shrink-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Transaction job-cost review</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Booksmart checks approved expenses against Jobber jobs. A receipt is optional.</p>
            </div>
            {transactionSuggestions.length > 0 && <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300">{transactionSuggestions.length} to review</Badge>}
          </div>
        </CardHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <CardContent className="space-y-3">
          {transactionQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking approved expenses against Jobber…</div>
          ) : transactionQuery.isError ? (
            <p className="text-sm text-muted-foreground">Transaction-to-job suggestions are temporarily unavailable.</p>
          ) : transactionSuggestions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><p className="font-medium text-foreground">No transaction matches need review</p><p className="mt-1">Booksmart will show approved expenses here when transaction details suggest a Jobber job.</p></div>
          ) : transactionSuggestions.map((suggestion) => {
            const busy = (confirmTransaction.isPending && confirmTransaction.variables?.transaction.id === suggestion.transaction.id)
              || (rejectTransaction.isPending && rejectTransaction.variables === suggestion.transaction.id);
            return <div id={`job-match-transaction-${suggestion.transaction.id}`} key={suggestion.transaction.id} className={`rounded-lg border p-4 ${highlightTransactionId === suggestion.transaction.id ? "ring-2 ring-primary/50" : ""}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-700 dark:text-amber-300"><Banknote className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <p className="font-semibold">{suggestion.transaction.title || suggestion.transaction.description || "Expense"} · {money(suggestion.transaction.amount)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{new Date(suggestion.transaction.date_time).toLocaleDateString()} → {suggestion.job.record_number || "Job"} {suggestion.job.title || suggestion.job.external_id}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Confidence: {suggestion.confidence} ({Math.min(100, Math.round(suggestion.score))}%) · Source: {suggestion.sourceProvider}</p>
                    {suggestion.reasons.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Why it matched: {suggestion.reasons.map(friendlyReason).join(" · ")}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">Confirming assigns this existing expense once. It does not create or alter an accounting transaction.</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2 lg:justify-end">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => rejectTransaction.mutate(suggestion.transaction.id)}><X className="mr-1.5 h-4 w-4" />Reject</Button>
                  <Button size="sm" disabled={busy} onClick={() => confirmTransaction.mutate(suggestion)}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Confirm job cost</Button>
                </div>
              </div>
            </div>;
          })}
        </CardContent>
        {approvedJobCosts.length > 0 && (
          <CardContent className="border-t pt-5">
            <div className="mb-3">
              <p className="font-semibold">Approved job costs</p>
              <p className="text-sm text-muted-foreground">Confirmed transaction assignments remain visible here for traceability.</p>
            </div>
            <div className="space-y-2">
              {approvedJobCosts.map((cost) => (
                <div id={`job-cost-assignment-${cost.assignmentId}`} key={cost.assignmentId} className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${highlightAssignmentId === cost.assignmentId ? "ring-2 ring-primary/50" : ""}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                    <div className="min-w-0">
                      <p className="font-medium">{cost.transaction.title || cost.transaction.description || "Expense"} · {money(cost.amount)}</p>
                      <p className="text-xs text-muted-foreground">→ {cost.job.record_number || "Job"} {cost.job.title || cost.job.external_id}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Confirmed {new Date(cost.confirmedAt).toLocaleString()} · Source: {cost.sourceProvider} · {cost.receiptLinked ? "Receipt linked" : "Receipt missing (optional)"}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="w-fit border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300">Approved</Badge>
                    <Button size="sm" variant="outline" disabled={previewExpense.isPending} onClick={() => previewExpense.mutate(cost.assignmentId)}>{previewExpense.isPending && previewExpense.variables === cost.assignmentId ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}Send to Jobber</Button>
                    <Button size="sm" variant="outline" onClick={() => setAssignmentToRemove(cost.assignmentId)}>Remove assignment</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
        </div>
      </Card>
      <AlertDialog open={expensePreview !== null} onOpenChange={(open) => { if (!open && !sendExpense.isPending) setExpensePreview(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this expense to Jobber?</AlertDialogTitle>
            <AlertDialogDescription>This creates one new Jobber expense linked to the job. It will not alter the BookSmart transaction.</AlertDialogDescription>
          </AlertDialogHeader>
          {expensePreview && <div className="space-y-2 rounded-lg border p-4 text-sm">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Expense</span><span className="font-medium text-right">{expensePreview.data.expense.title}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Amount</span><span className="font-medium">{money(expensePreview.data.expense.total)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Date</span><span>{new Date(expensePreview.data.expense.date).toLocaleDateString()}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Job</span><span className="text-right">{expensePreview.data.job.record_number || "Job"} {expensePreview.data.job.title || ""}</span></div>
            {!expensePreview.data.enabled && <p className="rounded-md bg-amber-400/10 p-2 text-amber-700 dark:text-amber-300">Test sending is safely turned off on the server.</p>}
            {expensePreview.data.alreadySent && <p className="rounded-md bg-emerald-400/10 p-2 text-emerald-700 dark:text-emerald-300">This cost was already sent to Jobber.</p>}
          </div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendExpense.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!expensePreview?.data.enabled || expensePreview.data.alreadySent || sendExpense.isPending} onClick={(event) => { event.preventDefault(); if (expensePreview) sendExpense.mutate(expensePreview.assignmentId); }}>{sendExpense.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Create expense in Jobber</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {(suggestions.length > 0 || (query.data?.receipts?.length ?? 0) > 0 || uploadResult !== null) && (
      <Card id="receipt-review" className={suggestions.length || unmatchedReceipts.length ? "scroll-mt-6 border-amber-400/30" : "scroll-mt-6"}>
        <CardHeader>
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
                  variant="outline"
                  className="border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300"
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
        </CardHeader>
        {gmailReceipts.length > 0 && (
          <CardContent className="border-t border-amber-400/20 bg-amber-400/[0.04] pt-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-red-500" /><p className="font-semibold">Gmail receipt inbox</p></div>
                <p className="mt-1 text-sm text-muted-foreground">Receipt evidence found by the manual Gmail scan. These items have not changed your accounting records.</p>
              </div>
              <Badge variant="outline" className="w-fit border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-300">{gmailReceipts.length} from Gmail</Badge>
            </div>
            <div className="space-y-2">
              {gmailReceipts.map((receipt) => {
                const removing = remove.isPending && remove.variables === receipt.source_id;
                return <div key={receipt.source_id} className="flex flex-col gap-3 rounded-lg border border-red-400/20 bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500"><Mail className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{receipt.vendor || "Gmail receipt"} · {money(receipt.total)}</p><Badge variant="outline" className="border-red-400/30 text-red-700 dark:text-red-300">Gmail</Badge>{receipt.status === "unmatched" && <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300">Unmatched</Badge>}{duplicateGmailReceiptSources.has(receipt.source_id) && <Badge variant="destructive">Possible duplicate</Badge>}</div>
                      <p className="mt-1 text-sm text-muted-foreground">{receipt.receipt_date ? new Date(`${receipt.receipt_date}T00:00:00`).toLocaleDateString() : "Date unavailable"}{receipt.receipt_number ? ` · Receipt #${receipt.receipt_number}` : ""}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{receipt.status === "unmatched" ? "No matching approved transaction was found. Keep this as evidence or delete it." : receipt.status === "awaiting_review" ? "A possible match is waiting for confirmation." : "Processed as supporting evidence."}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:min-w-72">
                    {receipt.linked_transaction ? <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">Linked to {receipt.linked_transaction.title || receipt.linked_transaction.description || "transaction"} · {money(receipt.linked_transaction.amount)}</div> : <div className="flex gap-2"><select aria-label={`Transaction for ${receipt.vendor || "Gmail receipt"}`} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs" value={selectedReceiptTransactions[receipt.source_id] ?? ""} disabled={receiptTransactionOptions.isLoading || linkReceipt.isPending} onChange={(event) => setSelectedReceiptTransactions((current) => ({ ...current, [receipt.source_id]: event.target.value }))}><option value="">{receiptTransactionOptions.isLoading ? "Loading transactions…" : "Choose transaction…"}</option>{(receiptTransactionOptions.data?.transactions ?? []).map((transaction) => <option key={transaction.id} value={transaction.id}>{new Date(transaction.date_time).toLocaleDateString()} · {money(transaction.amount)} · {transaction.title || transaction.description || "Transaction"}</option>)}</select><Button size="sm" disabled={!selectedReceiptTransactions[receipt.source_id] || linkReceipt.isPending} onClick={() => linkReceipt.mutate({ sourceId: receipt.source_id, transactionId: Number(selectedReceiptTransactions[receipt.source_id]) })}>{linkReceipt.isPending && linkReceipt.variables?.sourceId === receipt.source_id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Match</Button></div>}
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={removing || linkReceipt.isPending} onClick={() => setReceiptToRemove(receipt.source_id)}>{removing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}Delete evidence</Button>
                  </div>
                </div>;
              })}
            </div>
          </CardContent>
        )}
        <CardContent className="space-y-3">
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
          ) : suggestions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {unmatchedReceipts.length ? `${unmatchedReceipts.length} unmatched receipt${unmatchedReceipts.length === 1 ? "" : "s"}` : "No receipts waiting for review"}
              </p>
              <p className="mt-1">
                {unmatchedReceipts.length ? "These receipts are listed below as supporting evidence. No accounting transaction has been changed." : "Booksmart will show receipt matches here when they need confirmation. You can also add a missing receipt."}
              </p>
            </div>
          ) : (
            suggestions.map((suggestion) => {
              const busy =
                (confirm.isPending &&
                  confirm.variables?.sourceId === suggestion.sourceId) ||
                (reject.isPending && reject.variables === suggestion.sourceId);
              const ready = Boolean(suggestion.transaction && suggestion.job);
              return (
                <div
                  key={suggestion.sourceId}
                  className="rounded-lg border p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-700 dark:text-amber-300">
                        <ReceiptText className="h-5 w-5" />
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
                    <div className="flex shrink-0 gap-2 lg:justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => reject.mutate(suggestion.sourceId)}
                      >
                        <X className="mr-1.5 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy || !ready}
                        onClick={() => confirm.mutate(suggestion)}
                      >
                        {busy ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-1.5 h-4 w-4" />
                        )}
                        Confirm job cost
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
        {uploadedReceipts.length > 0 && (
          <CardContent className="border-t pt-5">
            <div className="mb-3">
              <p className="font-semibold">Receipt evidence</p>
              <p className="text-sm text-muted-foreground">
                Uploaded receipts processed for matching. Removing one does not
                delete or change accounting transactions.
              </p>
            </div>
            <div className="space-y-2">
              {uploadedReceipts.map((receipt) => {
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
      </Card>
      )}
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
