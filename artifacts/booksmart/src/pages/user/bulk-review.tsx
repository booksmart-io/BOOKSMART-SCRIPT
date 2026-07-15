import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { checkAddTransaction } from "@/lib/plan-limits";
import { categorizeUncategorizedTransactions } from "@/lib/ai-categorization";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Wand2, Loader2, CheckCircle2, XCircle, ArrowUpRight,
  ArrowDownRight, InboxIcon,
} from "lucide-react";

type PendingTx = {
  id: number;
  title: string;
  amount: number;
  transaction_type: "credit" | "debit";
  date_time: string;
  description: string;
  import_id: number | null;
  org_id: number | null;
  is_duplicate: boolean;
  status: string;
  document_id: number | null;
};

type Category = { id: number; name: string };

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function fmtMoney(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

export default function BulkReview() {
  const { profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeOrgId] = useActiveOrganizationId(numericId);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [categoryMap, setCategoryMap] = useState<Record<number, number>>({});
  const [approvingId, setApprovingId] = useState<number | null>(null);

  // ── Org lookup ──────────────────────────────────────────────────────────────
  const { data: orgId } = useQuery<number | null>({
    queryKey: ["user_org_bulk", numericId, activeOrgId],
    enabled: numericId !== null,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations").select("id").eq("owner_id", numericId!).order("id", { ascending: true });
      if (error) throw error;
      return pickActiveOrganization(data as { id: number }[] | null, activeOrgId)?.id ?? null;
    },
  });

  // ── Pending transactions ────────────────────────────────────────────────────
  const { data: pending = [], isLoading } = useQuery<PendingTx[]>({
    queryKey: ["pending_txs", numericId, orgId],
    enabled: numericId !== null && orgId !== null,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_transactions")
        .select("id,title,amount,transaction_type,date_time,description,import_id,org_id,is_duplicate,status,statement_imports(document_id)")
        .eq("user_id", numericId!)
        .eq("status", "pending")
        .or(`org_id.eq.${orgId},org_id.is.null`)
        .order("date_time", { ascending: false });
      if (error) throw error;
      // Flatten the nested join result into a flat document_id field
      return (data ?? []).map((row: Record<string, unknown>) => {
        const imp = row.statement_imports as { document_id: number } | null;
        return { ...row, document_id: imp?.document_id ?? null };
      }) as PendingTx[];
    },
  });

  // ── Categories for dropdown ─────────────────────────────────────────────────
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories_bulk"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("category").select("id,name").eq("is_deleted", false).order("name");
      return data ?? [];
    },
  });

  // ── Approve single transaction ──────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: async (tx: PendingTx) => {
      const signedAmount = tx.transaction_type === "credit" ? tx.amount : -tx.amount;
      const catId = categoryMap[tx.id] ?? null;
      const targetOrgId = tx.org_id ?? orgId;

      await checkAddTransaction();

      const { error: insertErr } = await supabase.from("transactions").insert({
        title: tx.title,
        amount: signedAmount,
        date_time: tx.date_time,
        description: tx.description || tx.title,
        org_id: targetOrgId,
        user_id: numericId,
        type: "Business",
        deductible: tx.transaction_type === "debit",
        is_ai_verified: false,
        ...(catId ? { category_id: catId } : {}),
        ...(tx.document_id !== null ? { file_path: String(tx.document_id) } : {}),
      });
      if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);

      await categorizeUncategorizedTransactions(1);

      const { error: updateErr } = await supabase
        .from("pending_transactions")
        .update({ status: "approved" })
        .eq("id", tx.id);
      if (updateErr) throw new Error(`Status update failed: ${updateErr.message}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending_txs", numericId] });
      qc.invalidateQueries({ queryKey: ["tx_month", orgId] });
      qc.invalidateQueries({ queryKey: ["tx_recent", orgId] });
      qc.invalidateQueries({ queryKey: ["tx_count", orgId] });
      qc.invalidateQueries({ queryKey: ["tx_period", orgId] });
      qc.invalidateQueries({ queryKey: ["pending_count", numericId] });
    },
    onError: (e: Error) => {
      toast({ title: "Approve failed", description: e.message, variant: "destructive" });
    },
  });

  // ── Reject single transaction ───────────────────────────────────────────────
  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("pending_transactions")
        .update({ status: "rejected" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending_txs", numericId] });
      qc.invalidateQueries({ queryKey: ["pending_count", numericId] });
    },
    onError: (e: Error) => toast({ title: "Reject failed", description: e.message, variant: "destructive" }),
  });

  // ── Approve selected ────────────────────────────────────────────────────────
  async function approveSelected() {
    const toApprove = pending.filter((t) => selectedIds.has(t.id));
    if (!toApprove.length) {
      toast({ title: "Nothing selected", description: "Check at least one transaction to approve." });
      return;
    }
    let approved = 0;
    for (const tx of toApprove) {
      setApprovingId(tx.id);
      try {
        await approveMutation.mutateAsync(tx);
        approved++;
      } catch {
        // already toasted per item
      }
    }
    setApprovingId(null);
    setSelectedIds(new Set());
    if (approved > 0) {
      toast({
        title: `${approved} transaction${approved === 1 ? "" : "s"} approved`,
        description: "Your income & expense totals now include these entries.",
      });
    }
  }

  // ── Approve all ─────────────────────────────────────────────────────────────
  async function approveAll() {
    if (!pending.length) return;
    let approved = 0;
    for (const tx of pending) {
      setApprovingId(tx.id);
      try {
        await approveMutation.mutateAsync(tx);
        approved++;
      } catch {
        // already toasted
      }
    }
    setApprovingId(null);
    setSelectedIds(new Set());
    if (approved > 0) {
      toast({
        title: `All ${approved} transactions approved`,
        description: "Your income & expense totals are now updated.",
      });
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === pending.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(pending.map((t) => t.id)));
  }

  const totalCredit = pending.filter((t) => t.transaction_type === "credit").reduce((s, t) => s + t.amount, 0);
  const totalDebit = pending.filter((t) => t.transaction_type === "debit").reduce((s, t) => s + t.amount, 0);
  const isBusy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bulk Review</h1>
          <p className="text-muted-foreground">
            Approve AI-scanned transactions to reflect them in your income & expense totals.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={approveSelected}
            disabled={selectedIds.size === 0 || isBusy}
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Approve Selected ({selectedIds.size})
          </Button>
          <Button
            className="gap-2 bg-primary text-primary-foreground"
            onClick={approveAll}
            disabled={pending.length === 0 || isBusy}
          >
            <Wand2 className="h-4 w-4" /> Approve All
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      {pending.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-border/50 bg-secondary/10">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Pending</p>
              <p className="text-xl font-bold">{pending.length}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-1 mb-1">
                <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                <p className="text-xs text-muted-foreground">Incoming</p>
              </div>
              <p className="text-xl font-bold text-emerald-500">{fmtMoney(totalCredit)}</p>
            </CardContent>
          </Card>
          <Card className="border-rose-500/20 bg-rose-500/5">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-1 mb-1">
                <ArrowDownRight className="h-3 w-3 text-rose-500" />
                <p className="text-xs text-muted-foreground">Outgoing</p>
              </div>
              <p className="text-xl font-bold text-rose-500">{fmtMoney(totalDebit)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>
            Needs Review
            {!isLoading && (
              <Badge variant="outline" className="ml-2 text-xs font-normal">
                {pending.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            These transactions were extracted from your uploaded documents. Approve them to add to your financials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <InboxIcon className="h-12 w-12 opacity-20" />
              <p className="text-sm font-medium">No pending transactions</p>
              <p className="text-xs text-center max-w-xs">
                Upload a bank statement from the Reports page — AI will scan it and extracted transactions will appear here for review.
              </p>
            </div>
          ) : (
            <>
              <div className="border rounded-md border-border/50">
                <Table>
                  <TableHeader className="bg-secondary/20">
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedIds.size === pending.length && pending.length > 0}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="w-48">Category</TableHead>
                      <TableHead className="text-right w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((tx) => (
                      <TableRow key={tx.id} className={selectedIds.has(tx.id) ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(tx.id)}
                            onCheckedChange={() => toggleSelect(tx.id)}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {fmtDate(tx.date_time)}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{tx.title}</div>
                          {tx.description && tx.description !== tx.title && (
                            <div className="text-xs text-muted-foreground truncate max-w-[240px]">
                              {tx.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`font-semibold ${tx.transaction_type === "credit" ? "text-emerald-500" : "text-rose-400"}`}>
                            {tx.transaction_type === "credit" ? "+" : "-"}{fmtMoney(tx.amount)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={categoryMap[tx.id] ? String(categoryMap[tx.id]) : ""}
                            onValueChange={(v) =>
                              setCategoryMap((prev) => ({ ...prev, [tx.id]: Number(v) }))
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select…" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-emerald-500 hover:bg-emerald-500/10"
                              disabled={isBusy}
                              onClick={async () => {
                                setApprovingId(tx.id);
                                await approveMutation.mutateAsync(tx);
                                setApprovingId(null);
                                toast({ title: "Transaction approved", description: `${tx.title} added to your financials.` });
                              }}
                            >
                              {approvingId === tx.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              disabled={isBusy}
                              onClick={() => rejectMutation.mutate(tx.id)}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>{selectedIds.size} of {pending.length} selected</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10"
                  onClick={approveSelected}
                  disabled={selectedIds.size === 0 || isBusy}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve {selectedIds.size > 0 ? `(${selectedIds.size})` : "Selected"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
