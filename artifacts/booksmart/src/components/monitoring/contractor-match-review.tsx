import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Loader2, ReceiptText, Trash2, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  confirmContractorMatch,
  confirmContractorTransactionJob,
  extractContractorReceipt,
  loadContractorMatchQueue,
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
}: {
  organizationId: number;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [receiptToRemove, setReceiptToRemove] = useState<string | null>(null);
  const [assignmentToRemove, setAssignmentToRemove] = useState<number | null>(null);
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
  const transactionSuggestions = transactionQuery.data?.suggestions ?? [];
  const approvedJobCosts = transactionQuery.data?.approved ?? [];
  const selectedAssignment = approvedJobCosts.find((cost) => cost.assignmentId === assignmentToRemove) ?? null;
  return (
    <>
      <Card className={transactionSuggestions.length ? "border-amber-400/30" : undefined}>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Transaction job-cost review</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Booksmart checks approved expenses against Jobber jobs. A receipt is optional.</p>
            </div>
            {transactionSuggestions.length > 0 && <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300">{transactionSuggestions.length} to review</Badge>}
          </div>
        </CardHeader>
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
            return <div key={suggestion.transaction.id} className="rounded-lg border p-4">
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
                <div key={cost.assignmentId} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
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
                    <Button size="sm" variant="outline" onClick={() => setAssignmentToRemove(cost.assignmentId)}>Remove assignment</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
      <Card className={suggestions.length ? "border-amber-400/30" : undefined}>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Receipt job-cost review</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Review receipts Booksmart matched to transactions and Jobber jobs. Upload only when a receipt is missing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {suggestions.length > 0 && (
                <Badge
                  variant="outline"
                  className="border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300"
                >
                  {suggestions.length} to review
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
                No receipts waiting for review
              </p>
              <p className="mt-1">
                Booksmart will show receipt matches here when they need confirmation. You can also add a missing receipt.
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
        {(query.data?.receipts?.length ?? 0) > 0 && (
          <CardContent className="border-t pt-5">
            <div className="mb-3">
              <p className="font-semibold">Processed receipts</p>
              <p className="text-sm text-muted-foreground">
                Receipts processed for job-cost matching. Removing one does not
                delete or change accounting transactions.
              </p>
            </div>
            <div className="space-y-2">
              {(query.data?.receipts ?? []).map((receipt) => {
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
                            ? "No Jobber job match"
                            : receipt.status === "awaiting_review"
                              ? "Waiting for review"
                              : "Processed"}
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
      <AlertDialog
        open={receiptToRemove !== null}
        onOpenChange={(open) => !open && setReceiptToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>Delete this receipt only?</AlertDialogTitle>
          <AlertDialogDescription>
              The uploaded receipt, extracted details, and receipt-match links
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
