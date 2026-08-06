import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import { categorizeTransaction } from "@/lib/ai-categorization";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Organization = { id: number; name: string };
type ReviewStatus = "staged" | "approved" | "rejected" | "imported";
type DepositClassification = "business_income" | "bank_transfer" | "loan_proceeds" | "owner_contribution" | "customer_payment" | "refund" | "non_business";
type StagedRow = {
  id: number;
  entity_type: "Account" | "Purchase" | "Bill" | "Invoice" | "Payment" | "Deposit";
  external_id: string;
  display_name: string | null;
  transaction_date: string | null;
  total_amount: number | null;
  source_updated_at: string | null;
  staged_at: string;
  import_status: ReviewStatus;
  deposit_classification: DepositClassification | null;
};

const depositClassifications: Array<{ value: DepositClassification; label: string; importable: boolean }> = [
  { value: "business_income", label: "Business income", importable: true },
  { value: "bank_transfer", label: "Bank transfer", importable: true },
  { value: "loan_proceeds", label: "Loan proceeds", importable: true },
  { value: "owner_contribution", label: "Owner contribution", importable: true },
  { value: "customer_payment", label: "Customer payment — matching required", importable: false },
  { value: "refund", label: "Refund — matching required", importable: false },
  { value: "non_business", label: "Non-business — reject instead", importable: false },
];

function isImportable(row: StagedRow) {
  if (row.entity_type === "Purchase") return true;
  if (row.entity_type !== "Deposit" || !row.deposit_classification) return false;
  return depositClassifications.some((item) => item.value === row.deposit_classification && item.importable);
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  return data.session.access_token;
}

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { message?: string };
  return new Error(body.message || fallback);
}

type ImportResult = { imported: number; skipped: number; transaction_ids: number[] };
type CategoryOption = { id: number; name: string };
type SubCategoryOption = { id: number; name: string; category_id: number };
type AccountMappingRow = {
  quickbooks_account_id: string;
  quickbooks_account_name: string;
  quickbooks_account_type: string | null;
  quickbooks_account_subtype: string | null;
  mapping: null | { mapping_kind: "category" | "role" | "ignored"; category_id: number | null; sub_category_id: number | null; account_role: string | null };
};

function mappingFor(row: StagedRow) {
  if (row.entity_type === "Account") return { label: "Reference account", amount: null, warning: "Reference only; never becomes a transaction." };
  if (row.entity_type === "Deposit") {
    const selected = depositClassifications.find((item) => item.value === row.deposit_classification);
    return {
      label: selected?.label ?? "Classification required",
      amount: row.total_amount == null || !selected?.importable ? null : Math.abs(row.total_amount),
      warning: selected?.importable ? "Ready to approve and import." : "Choose an importable classification before approval.",
    };
  }
  const expense = row.entity_type === "Purchase" || row.entity_type === "Bill";
  const amount = row.total_amount == null ? null : expense ? -Math.abs(row.total_amount) : Math.abs(row.total_amount);
  const warning = row.entity_type === "Bill"
    ? "May overlap a later purchase or payment."
    : row.entity_type === "Invoice"
      ? "May overlap a customer payment under cash accounting."
      : row.entity_type === "Payment"
        ? "May settle an invoice already present in QuickBooks."
        : null;
  return { label: expense ? "Suggested expense" : "Suggested income", amount, warning };
}

export default function QuickBooksReview() {
  const { profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const [activeOrgId] = useActiveOrganizationId(numericId);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"transactions" | "accounts">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "accounts" ? "accounts" : "transactions",
  );
  const [entityType, setEntityType] = useState("all");
  const [status, setStatus] = useState<ReviewStatus>("staged");
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingDecision, setPendingDecision] = useState<"approved" | "rejected" | "imported" | null>(null);

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["settings-organizations", numericId],
    enabled: numericId != null,
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id,name").eq("owner_id", numericId!).order("id");
      if (error) throw error;
      return (data as Organization[]) ?? [];
    },
  });
  const organization = pickActiveOrganization(organizations, activeOrgId);
  const organizationId = organization?.id ?? null;

  const { data: categories = [] } = useQuery<CategoryOption[]>({
    queryKey: ["quickbooks-mapping-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("category").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: subCategories = [] } = useQuery<SubCategoryOption[]>({
    queryKey: ["quickbooks-mapping-subcategories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sub_category").select("id,name,category_id").eq("is_deleted", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const accountMappingsQuery = useQuery<AccountMappingRow[]>({
    queryKey: ["quickbooks-account-mappings", organizationId],
    enabled: organizationId != null && view === "accounts",
    queryFn: async () => {
      const token = await accessToken();
      const response = await fetch(`/api/integrations/quickbooks/account-mappings?organization_id=${organizationId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw await apiError(response, "Could not load QuickBooks account mappings.");
      const body = await response.json() as { rows?: AccountMappingRow[] };
      return body.rows ?? [];
    },
  });

  const saveAccountMapping = useMutation({
    mutationFn: async ({ row, value, subCategoryId }: { row: AccountMappingRow; value: string; subCategoryId?: number | null }) => {
      if (!organizationId) throw new Error("No active organization selected.");
      const [mappingKind, target] = value.split(":");
      const token = await accessToken();
      const response = await fetch("/api/integrations/quickbooks/account-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          organization_id: organizationId,
          quickbooks_account_id: row.quickbooks_account_id,
          mapping_kind: mappingKind,
          category_id: mappingKind === "category" ? Number(target) : null,
          sub_category_id: mappingKind === "category" ? subCategoryId ?? null : null,
          account_role: mappingKind === "role" ? target : null,
        }),
      });
      if (!response.ok) throw await apiError(response, "Could not save QuickBooks account mapping.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["quickbooks-account-mappings", organizationId] });
      toast.success("QuickBooks account mapping saved. Existing transactions were not changed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stagedQuery = useQuery<StagedRow[]>({
    queryKey: ["quickbooks-staged-review", organizationId, entityType, status],
    enabled: organizationId != null,
    queryFn: async () => {
      const token = await accessToken();
      const params = new URLSearchParams({ organization_id: String(organizationId), status, limit: "100" });
      if (entityType !== "all") params.set("entity_type", entityType);
      const response = await fetch(`/api/integrations/quickbooks/staged?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw await apiError(response, "Could not load staged QuickBooks records.");
      const body = await response.json() as { rows?: StagedRow[] };
      return body.rows ?? [];
    },
  });
  const rows = stagedQuery.data ?? [];
  const selectableIds = useMemo(
    () => rows.filter((row) => status === "staged" ? row.entity_type !== "Account" : status === "approved" && isImportable(row)).map((row) => row.id),
    [rows, status],
  );
  const selectedRows = rows.filter((row) => selected.includes(row.id));
  const canApproveSelection = selectedRows.length > 0 && selectedRows.every(isImportable);

  const classificationMutation = useMutation({
    mutationFn: async ({ id, classification }: { id: number; classification: DepositClassification }) => {
      if (!organizationId) throw new Error("No active organization selected.");
      const token = await accessToken();
      const response = await fetch("/api/integrations/quickbooks/staged/classification", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ organization_id: organizationId, id, classification }),
      });
      if (!response.ok) throw await apiError(response, "Could not save deposit classification.");
      return response.json();
    },
    onSuccess: async () => {
      setSelected([]);
      await queryClient.invalidateQueries({ queryKey: ["quickbooks-staged-review", organizationId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function importAndCategorize(ids: number[]): Promise<ImportResult & { categorized: number }> {
    if (!organizationId || !ids.length) return { imported: 0, skipped: 0, transaction_ids: [], categorized: 0 };
    const token = await accessToken();
    const response = await fetch("/api/integrations/quickbooks/staged/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ organization_id: organizationId, ids }),
    });
    if (!response.ok) throw await apiError(response, "Could not process approved QuickBooks records.");
    const result = await response.json() as ImportResult;
    let categorized = 0;
    for (const transactionId of result.transaction_ids ?? []) {
      const categorization = await categorizeTransaction(transactionId, organizationId);
      categorized += categorization.updated;
    }
    return { ...result, categorized };
  }

  const decisionMutation = useMutation({
    mutationFn: async (decision: "approved" | "rejected") => {
      if (!organizationId || !selected.length) throw new Error("Select at least one staged record.");
      const token = await accessToken();
      const response = await fetch("/api/integrations/quickbooks/staged/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ organization_id: organizationId, ids: selected, decision }),
      });
      if (!response.ok) throw await apiError(response, "Could not save the review decision.");
      const result = await response.json() as { updated: number; imported_transactions: number };
      if (decision !== "approved") return { ...result, imported: 0, skipped: 0, categorized: 0 };
      const promotion = await importAndCategorize(selected);
      return { ...result, ...promotion };
    },
    onSuccess: async (result, decision) => {
      setPendingDecision(null);
      setSelected([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["quickbooks-staged-review", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["quickbooks-sync-status", organizationId] }),
      ]);
      if (decision === "approved") {
        toast.success(`${result.updated} records approved and processed. ${result.imported} imported and ${result.categorized} categorized.`);
      } else {
        toast.success(`${result.updated} records rejected. No BookSmart transactions were created.`);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !selected.length) throw new Error("Select at least one approved record.");
      return importAndCategorize(selected);
    },
    onSuccess: async (result) => {
      setPendingDecision(null);
      setSelected([]);
      await queryClient.invalidateQueries({ queryKey: ["quickbooks-staged-review", organizationId] });
      toast.success(`${result.imported} records imported, ${result.categorized} categorized, and ${result.skipped} safely skipped.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function toggle(id: number) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  return (
    <div className="min-w-0 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" className="mb-2 px-0" onClick={() => navigate("/user/settings")}><ArrowLeft /> Settings</Button>
          <h1 className="text-2xl font-bold tracking-tight">{view === "accounts" ? "QuickBooks account mappings" : "Review QuickBooks transactions"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === "accounts"
              ? `Configure how QuickBooks accounts map into ${organization?.name ?? "the active organization"}.`
              : `Review and classify records for ${organization?.name ?? "the active organization"}. Approve means the transaction will be processed.`}
          </p>
        </div>
        <Button variant="outline" onClick={() => view === "accounts" ? accountMappingsQuery.refetch() : stagedQuery.refetch()} disabled={view === "accounts" ? accountMappingsQuery.isFetching : stagedQuery.isFetching}>
          <RefreshCw className={(view === "accounts" ? accountMappingsQuery.isFetching : stagedQuery.isFetching) ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      <div className="flex w-fit rounded-lg border bg-card p-1">
        <Button variant={view === "transactions" ? "secondary" : "ghost"} onClick={() => { setView("transactions"); setSelected([]); }}>Transaction review</Button>
        <Button variant={view === "accounts" ? "secondary" : "ghost"} onClick={() => { setView("accounts"); setSelected([]); }}>Account mappings</Button>
      </div>

      {view === "transactions" && <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-medium">Record type
          <select className="mt-1.5 min-h-10 w-full rounded-md border border-input bg-background px-3" value={entityType} onChange={(event) => { setEntityType(event.target.value); setSelected([]); }}>
            <option value="all">All types</option>
            {['Purchase','Bill','Invoice','Payment','Deposit'].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex-1 text-sm font-medium">Review status
          <select className="mt-1.5 min-h-10 w-full rounded-md border border-input bg-background px-3" value={status} onChange={(event) => { setStatus(event.target.value as ReviewStatus); setSelected([]); }}>
            <option value="staged">Needs review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="imported">Imported</option>
          </select>
        </label>
      </div>}

      {view === "transactions" && status === "staged" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setSelected(selected.length === selectableIds.length ? [] : selectableIds)} disabled={!rows.length}>
            {selected.length === selectableIds.length && rows.length ? "Clear selection" : "Select visible"}
          </Button>
          <Button variant="secondary" disabled={!canApproveSelection} onClick={() => setPendingDecision("approved")}><CheckCircle2 /> Approve & process ({selected.length})</Button>
          <Button variant="outline" className="text-destructive" disabled={!selected.length} onClick={() => setPendingDecision("rejected")}><XCircle /> Reject ({selected.length})</Button>
        </div>
      )}

      {view === "transactions" && status === "approved" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setSelected(selected.length === selectableIds.length ? [] : selectableIds)} disabled={!rows.length}>
            {selected.length === selectableIds.length && rows.length ? "Clear selection" : "Select visible"}
          </Button>
          <Button disabled={!selected.length || importMutation.isPending} onClick={() => setPendingDecision("imported")}>
            {importMutation.isPending && <Loader2 className="animate-spin" />} Process approved ({selected.length})
          </Button>
          <p className="text-xs text-muted-foreground">Only purchases and safely classified deposits can be processed.</p>
        </div>
      )}

      {view === "accounts" ? (
        accountMappingsQuery.isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin" /></div> :
        accountMappingsQuery.isError ? <div className="rounded-xl border border-destructive/40 p-6 text-sm text-destructive">Could not load QuickBooks account mappings.</div> :
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">QuickBooks account</th><th className="p-3">Type</th><th className="p-3">BookSmart handling</th><th className="p-3">Subcategory</th><th className="p-3">Status</th></tr></thead>
              <tbody className="divide-y divide-border/50">
                {(accountMappingsQuery.data ?? []).map((row) => {
                  const currentValue = row.mapping?.mapping_kind === "category" ? `category:${row.mapping.category_id}` : row.mapping?.mapping_kind === "role" ? `role:${row.mapping.account_role}` : row.mapping?.mapping_kind === "ignored" ? "ignored:" : "";
                  const categoryId = row.mapping?.mapping_kind === "category" ? row.mapping.category_id : null;
                  return <tr key={row.quickbooks_account_id}>
                    <td className="p-3"><p className="font-medium">{row.quickbooks_account_name}</p><p className="text-xs text-muted-foreground">ID {row.quickbooks_account_id}</p></td>
                    <td className="p-3 text-muted-foreground">{row.quickbooks_account_type || "Unknown"}</td>
                    <td className="p-3"><select aria-label={`Map ${row.quickbooks_account_name}`} className="min-h-9 w-full rounded-md border border-input bg-background px-2" value={currentValue} disabled={saveAccountMapping.isPending} onChange={(event) => saveAccountMapping.mutate({ row, value: event.target.value })}>
                      <option value="" disabled>Choose mapping</option>
                      <optgroup label="BookSmart category">{categories.map((category) => <option key={category.id} value={`category:${category.id}`}>{category.name}</option>)}</optgroup>
                      <optgroup label="Accounting role"><option value="role:bank">Bank account</option><option value="role:credit_card">Credit card</option><option value="role:loan">Loan</option><option value="role:accounts_receivable">Accounts receivable</option><option value="role:accounts_payable">Accounts payable</option><option value="role:equity">Equity</option></optgroup>
                      <option value="ignored:">Ignore this account</option>
                    </select></td>
                    <td className="p-3">{categoryId ? <select aria-label={`Subcategory for ${row.quickbooks_account_name}`} className="min-h-9 w-full rounded-md border border-input bg-background px-2" value={row.mapping?.sub_category_id ?? ""} disabled={saveAccountMapping.isPending} onChange={(event) => saveAccountMapping.mutate({ row, value: `category:${categoryId}`, subCategoryId: event.target.value ? Number(event.target.value) : null })}><option value="">No subcategory</option>{subCategories.filter((sub) => sub.category_id === categoryId).map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}</select> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td className="p-3"><span className="rounded-full border px-2 py-1 text-xs">{row.mapping ? row.mapping.mapping_kind === "ignored" ? "Ignored" : "Mapped" : "Unmapped"}</span></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : stagedQuery.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
      ) : stagedQuery.isError ? (
        <div className="rounded-xl border border-destructive/40 p-6 text-sm text-destructive">Could not load staged QuickBooks records.</div>
      ) : !rows.length ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">No records match these filters.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="w-12 p-3">Select</th><th className="p-3">QuickBooks record</th><th className="p-3">Date</th><th className="p-3 text-right">Amount</th><th className="p-3">Suggested mapping</th><th className="p-3">Safety note</th></tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((row) => {
                  const mapping = mappingFor(row);
                  return <tr key={row.id} className="align-top">
                    <td className="p-3"><input type="checkbox" aria-label={`Select ${row.entity_type} ${row.external_id}`} checked={selected.includes(row.id)} disabled={row.entity_type === "Account" || (status === "approved" && !isImportable(row)) || (status !== "staged" && status !== "approved")} onChange={() => toggle(row.id)} className="h-4 w-4" /></td>
                    <td className="p-3"><p className="font-medium">{row.display_name || `${row.entity_type} ${row.external_id}`}</p><p className="text-xs text-muted-foreground">{row.entity_type} · ID {row.external_id}</p></td>
                    <td className="p-3 text-muted-foreground">{row.transaction_date || "—"}</td>
                    <td className="p-3 text-right font-medium">{row.total_amount == null ? "—" : row.total_amount.toLocaleString(undefined, { style: "currency", currency: "USD" })}</td>
                    <td className="p-3">
                      {row.entity_type === "Deposit" && status === "staged" ? (
                        <select aria-label={`Classify Deposit ${row.external_id}`} className="min-h-9 w-full min-w-52 rounded-md border border-input bg-background px-2 text-xs" value={row.deposit_classification ?? ""} disabled={classificationMutation.isPending} onChange={(event) => classificationMutation.mutate({ id: row.id, classification: event.target.value as DepositClassification })}>
                          <option value="" disabled>Choose classification</option>
                          {depositClassifications.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                      ) : <p>{mapping.label}</p>}
                      {mapping.amount != null && <p className="text-xs text-muted-foreground">Preview: {mapping.amount.toLocaleString(undefined, { style: "currency", currency: "USD" })}</p>}
                    </td>
                    <td className="max-w-xs p-3 text-xs text-muted-foreground">{mapping.warning || "No obvious overlap warning."}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{view === "accounts" ? "Accounts configure future QuickBooks imports only. They never create transactions, and existing BookSmart transactions are unchanged." : "Showing up to 100 records. Approval processes purchases and safely classified deposits through categorization. Customer payments and refunds require matching; duplicate retries are blocked."}</p>

      <AlertDialog open={pendingDecision !== null} onOpenChange={(open) => !open && setPendingDecision(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDecision === "approved" ? "Approve and process records?" : pendingDecision === "rejected" ? "Reject staged records?" : "Process approved records?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDecision === "imported"
                ? `This will create up to ${selected.length} correctly classified BookSmart transactions. Duplicate QuickBooks IDs will be skipped, and the operation is atomic.`
                : pendingDecision === "approved"
                  ? `This will approve and import ${selected.length} records, then immediately send them through BookSmart categorization.`
                  : `This will mark ${selected.length} records as rejected. It will not import anything into BookSmart transactions or alter reports.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={decisionMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={decisionMutation.isPending || importMutation.isPending} onClick={(event) => { event.preventDefault(); if (pendingDecision === "imported") importMutation.mutate(); else if (pendingDecision) decisionMutation.mutate(pendingDecision); }}>
              {(decisionMutation.isPending || importMutation.isPending) && <Loader2 className="animate-spin" />} Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
