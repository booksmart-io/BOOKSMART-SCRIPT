import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { checkAddTransaction } from "@/lib/plan-limits";
import { categorizeUncategorizedTransactions } from "@/lib/ai-categorization";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileUp,
  Search,
  FileText,
  FileImage,
  File,
  FolderOpen,
  MoreVertical,
  Trash2,
  ExternalLink,
  X,
  Calendar,
  Loader2,
  Sparkles,
  CheckCircle2,
  SkipForward,
  Plus,
  Minus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Storage helper ────────────────────────────────────────────────────────────

function extractStoragePath(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    const parts = url.pathname.split("/documents/");
    return parts[1] ? decodeURIComponent(parts[1]) : null;
  } catch {
    return null;
  }
}

async function getSignedUrl(fileUrl: string): Promise<string> {
  const path = extractStoragePath(fileUrl);
  if (!path) return fileUrl;
  const { data } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
  return data?.signedUrl ?? fileUrl;
}

// ── Types ────────────────────────────────────────────────────────────────────

type UserDocument = {
  id: number;
  user_id: number;
  name: string;
  file_url: string;
  category: string | null;
  tax_year: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
};

const CATEGORIES = [
  "Balance Sheet",
  "Profit & Loss",
  "Income Statement",
  "Cash Flow Statement",
  "Transactions",
] as const;

// ── AI Extraction types ───────────────────────────────────────────────────────

type PnlExtracted = {
  revenue: number;
  cost_of_goods_sold: number;
  gross_profit: number;
  operating_expenses: number;
  net_income: number;
};

type BsExtracted = {
  assets: { current: number; non_current: number };
  liabilities: { current: number; long_term: number };
  equity: number;
};

type CfExtracted = {
  operating_activities: number;
  investing_activities: number;
  financing_activities: number;
};

type ExtractedDoc =
  | { type: "pnl"; data: PnlExtracted }
  | { type: "bs"; data: BsExtracted }
  | { type: "cf"; data: CfExtracted };

function categoryToDocType(cat: string): string | null {
  if (cat === "Profit & Loss" || cat === "Income Statement") return "pnl";
  if (cat === "Balance Sheet") return "bs";
  if (cat === "Cash Flow Statement") return "cf";
  return null;
}

/** Mirrors Flutter's `_isZeroTemplate`: AI "succeeded" but returned an all-zero
 * template, which usually means it couldn't actually read the document. */
function isZeroExtraction(doc: ExtractedDoc): boolean {
  if (doc.type === "pnl") {
    const d = doc.data;
    return d.revenue === 0 && d.cost_of_goods_sold === 0 && d.operating_expenses === 0 && d.net_income === 0;
  }
  if (doc.type === "bs") {
    const d = doc.data;
    return (
      d.assets.current === 0 &&
      d.assets.non_current === 0 &&
      d.liabilities.current === 0 &&
      d.liabilities.long_term === 0 &&
      d.equity === 0
    );
  }
  const d = doc.data;
  return d.operating_activities === 0 && d.investing_activities === 0 && d.financing_activities === 0;
}

// ── Manual Review Template (fallback when AI extraction fails on P&L/BS/CF) ──
// Mirrors the Flutter `manual_pnl_review_helper.dart` field set + auto-calc rules.

const MANUAL_PNL_REVENUE_KEYS = ["salesRevenue", "serviceRevenue", "otherRevenue", "interestIncome"];
const MANUAL_PNL_COGS_KEYS = ["cogsDirect", "directLabor", "materials", "otherDirectCosts"];
const MANUAL_PNL_OPEX_KEYS = [
  "advertising", "bankCharges", "commissionsAndFees", "duesAndSubscriptions",
  "insurance", "legalAndProfessionalFees", "meals", "officeExpenses",
  "rentOrLease", "repairsAndMaintenance", "software", "supplies",
  "taxesAndLicenses", "travel", "utilities", "wages", "otherExpenses",
];
const MANUAL_PNL_AUTO_KEYS = new Set([
  "totalRevenue", "totalCogs", "grossProfit", "totalOperatingExpenses", "ebitda", "taxExpense", "netIncome",
]);

type ManualRowSpec = { label: string; key: string | null; isPercent?: boolean };

const MANUAL_PNL_ROWS: ManualRowSpec[] = [
  { label: "— Revenue —", key: null },
  { label: "Sales Revenue", key: "salesRevenue" },
  { label: "Service Revenue", key: "serviceRevenue" },
  { label: "Other Revenue", key: "otherRevenue" },
  { label: "Interest Income", key: "interestIncome" },
  { label: "Total Revenue", key: "totalRevenue" },
  { label: "— Cost of Goods Sold —", key: null },
  { label: "Cost of Goods Sold", key: "cogsDirect" },
  { label: "Direct Labor", key: "directLabor" },
  { label: "Materials", key: "materials" },
  { label: "Other Direct Costs", key: "otherDirectCosts" },
  { label: "Total COGS", key: "totalCogs" },
  { label: "— Operating Expenses —", key: null },
  { label: "Advertising", key: "advertising" },
  { label: "Bank Charges", key: "bankCharges" },
  { label: "Commissions and Fees", key: "commissionsAndFees" },
  { label: "Dues and Subscriptions", key: "duesAndSubscriptions" },
  { label: "Insurance", key: "insurance" },
  { label: "Legal and Professional Fees", key: "legalAndProfessionalFees" },
  { label: "Meals", key: "meals" },
  { label: "Office Expenses", key: "officeExpenses" },
  { label: "Rent or Lease", key: "rentOrLease" },
  { label: "Repairs and Maintenance", key: "repairsAndMaintenance" },
  { label: "Software", key: "software" },
  { label: "Supplies", key: "supplies" },
  { label: "Taxes and Licenses", key: "taxesAndLicenses" },
  { label: "Travel", key: "travel" },
  { label: "Utilities", key: "utilities" },
  { label: "Wages", key: "wages" },
  { label: "Other Expenses", key: "otherExpenses" },
  { label: "Total Operating Expenses", key: "totalOperatingExpenses" },
  { label: "Gross Profit", key: "grossProfit" },
  { label: "Taxes (rate %)", key: "taxRatePercent", isPercent: true },
  { label: "EBITDA", key: "ebitda" },
  { label: "— Depreciation & Amortization —", key: null },
  { label: "Depreciation", key: "depreciation" },
  { label: "Amortization", key: "amortization" },
  { label: "— Interest & Taxes —", key: null },
  { label: "Interest Expense", key: "interestExpense" },
  { label: "Tax Expense", key: "taxExpense" },
  { label: "Net Income", key: "netIncome" },
];

const MANUAL_BS_ROWS: ManualRowSpec[] = [
  { label: "Current Assets", key: "currentAssets" },
  { label: "Non-Current Assets", key: "nonCurrentAssets" },
  { label: "Current Liabilities", key: "currentLiabilities" },
  { label: "Long-Term Liabilities", key: "longTermLiabilities" },
  { label: "Equity", key: "equity" },
];

const MANUAL_CF_ROWS: ManualRowSpec[] = [
  { label: "Net Operating Activities", key: "operatingActivities" },
  { label: "Operating Adjustments", key: "operatingAdjustments" },
  { label: "Working Capital Changes", key: "workingCapitalChanges" },
  { label: "Net Investing Activities", key: "investingActivities" },
  { label: "Asset Purchases", key: "assetPurchases" },
  { label: "Investment Activities", key: "investmentActivities" },
  { label: "Net Financing Activities", key: "financingActivities" },
  { label: "Loan Activities (Debt)", key: "loanActivities" },
  { label: "Owner Contributions", key: "ownerContributions" },
  { label: "Distributions / Dividends", key: "distributions" },
];

const MANUAL_CF_READONLY_KEYS = new Set(["investingActivities", "financingActivities"]);

function manualRowsFor(type: "pnl" | "bs" | "cf"): ManualRowSpec[] {
  return type === "pnl" ? MANUAL_PNL_ROWS : type === "bs" ? MANUAL_BS_ROWS : MANUAL_CF_ROWS;
}

type ManualPeriod = {
  id: string;
  year: number;
  start: string;
  end: string;
  values: Record<string, string>;
  overrides: Set<string>;
};

function makeManualPeriod(type: "pnl" | "bs" | "cf", year: number, start: string, end: string): ManualPeriod {
  const values: Record<string, string> = {};
  for (const spec of manualRowsFor(type)) {
    if (spec.key) values[spec.key] = spec.isPercent ? "0" : "0.00";
  }
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    year,
    start,
    end,
    values,
    overrides: new Set(),
  };
}

function parseMoney(s: string): number {
  const n = parseFloat((s || "0").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function fmtInput(n: number): string {
  return n.toFixed(2);
}

function recalcPnlPeriod(p: ManualPeriod) {
  const v = (k: string) => parseMoney(p.values[k]);
  const ov = (k: string) => p.overrides.has(k);

  if (!ov("totalRevenue")) p.values.totalRevenue = fmtInput(MANUAL_PNL_REVENUE_KEYS.reduce((s, k) => s + v(k), 0));
  if (!ov("totalCogs")) p.values.totalCogs = fmtInput(MANUAL_PNL_COGS_KEYS.reduce((s, k) => s + v(k), 0));
  if (!ov("grossProfit")) p.values.grossProfit = fmtInput(v("totalRevenue") - v("totalCogs"));
  if (!ov("totalOperatingExpenses")) p.values.totalOperatingExpenses = fmtInput(MANUAL_PNL_OPEX_KEYS.reduce((s, k) => s + v(k), 0));
  if (!ov("ebitda")) p.values.ebitda = fmtInput(v("grossProfit") - v("totalOperatingExpenses"));
  if (!ov("taxExpense")) {
    const pretax = v("ebitda") - v("depreciation") - v("amortization") - v("interestExpense");
    p.values.taxExpense = fmtInput(pretax * (v("taxRatePercent") / 100));
  }
  if (!ov("netIncome")) {
    p.values.netIncome = fmtInput(v("ebitda") - v("depreciation") - v("amortization") - v("interestExpense") - v("taxExpense"));
  }
}

function recalcCfPeriod(p: ManualPeriod) {
  const v = (k: string) => parseMoney(p.values[k]);
  p.values.investingActivities = fmtInput(-Math.abs(v("assetPurchases")) + v("investmentActivities"));
  p.values.financingActivities = fmtInput(v("loanActivities") + v("ownerContributions") - Math.abs(v("distributions")));
}

function manualPeriodSummary(type: "pnl" | "bs" | "cf", p: ManualPeriod): number {
  const v = (k: string) => parseMoney(p.values[k]);
  if (type === "pnl") return v("netIncome");
  if (type === "bs") {
    return (v("currentAssets") + v("nonCurrentAssets")) - (v("currentLiabilities") + v("longTermLiabilities") + v("equity"));
  }
  return v("operatingActivities") + v("investingActivities") + v("financingActivities");
}

function manualSummaryLabel(type: "pnl" | "bs" | "cf"): string {
  if (type === "pnl") return "Net Income by Period";
  if (type === "bs") return "Balance Difference";
  return "Net Cash Change";
}

function fmtMoney(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

/** Safely converts a File to a base64 string using FileReader (no stack overflow). */
async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]); // strip "data:...;base64," prefix
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function callExtractDocument(
  file: File,
  mime: string,
  docType: string
): Promise<ExtractedDoc> {
  const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");

  // Use FileReader to safely base64-encode any file size.
  // btoa(String.fromCharCode(...bytes)) stack-overflows on large PDFs.
  const base64 = await fileToBase64(file);

  const res = await fetch("/api/extract-document", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fileData: base64, mimeType: mime, docType }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  const json = await res.json() as { extracted: unknown; docType: string };
  return { type: json.docType as "pnl" | "bs" | "cf", data: json.extracted } as ExtractedDoc;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1959 }, (_, i) =>
  String(CURRENT_YEAR - i)
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (["jpg", "jpeg"].includes(ext)) return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (["xls", "xlsx"].includes(ext)) return "application/vnd.ms-excel";
  if (["doc", "docx"].includes(ext)) return "application/msword";
  if (ext === "csv") return "text/csv";
  return "application/octet-stream";
}

function fileSizeLabel(bytes: number | null): string {
  if (!bytes) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function FileIcon({ mime }: { mime: string | null }) {
  if (!mime) return <File className="h-5 w-5 text-muted-foreground" />;
  if (mime === "application/pdf")
    return <FileText className="h-5 w-5 text-red-400" />;
  if (mime.startsWith("image/"))
    return <FileImage className="h-5 w-5 text-blue-400" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Statement Review Dialog ───────────────────────────────────────────────────

type PendingTx = {
  id: number;
  import_id: number;
  user_id: number;
  org_id: number;
  title: string;
  amount: number;
  date_time: string;
  description: string;
  transaction_type: "debit" | "credit";
  running_balance: number | null;
  is_duplicate: boolean;
  status: string;
};

function StatementReviewDialog({
  importId,
  open,
  onClose,
  numericUserId,
  onReviewComplete,
}: {
  importId: number;
  open: boolean;
  onClose: () => void;
  numericUserId: number;
  onReviewComplete: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [importStatus, setImportStatus] = useState<"processing" | "completed" | "failed">("processing");
  const [errorMsg, setErrorMsg] = useState("");
  const [rows, setRows] = useState<PendingTx[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [importDocId, setImportDocId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);

  const fetchRows = async () => {
    setLoadingRows(true);
    try {
      const [{ data: txData }, { data: importData }] = await Promise.all([
        supabase
          .from("pending_transactions")
          .select("*")
          .eq("import_id", importId)
          .eq("status", "pending")
          .order("date_time", { ascending: true }),
        supabase
          .from("statement_imports")
          .select("document_id")
          .eq("id", importId)
          .maybeSingle(),
      ]);
      setRows((txData as PendingTx[]) ?? []);
      setImportDocId((importData as { document_id: number } | null)?.document_id ?? null);
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    pollCountRef.current = 0;
    setImportStatus("processing");
    setErrorMsg("");
    setRows([]);

    const poll = async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > 30) {
        setImportStatus("failed");
        setErrorMsg("Processing timed out. Please try again.");
        return;
      }
      try {
        const { data } = await supabase
          .from("statement_imports")
          .select("status, error_message")
          .eq("id", importId)
          .single();
        const st = (data?.status ?? "processing") as typeof importStatus;
        if (st === "completed") {
          setImportStatus("completed");
          await fetchRows();
        } else if (st === "failed") {
          setImportStatus("failed");
          setErrorMsg(data?.error_message ?? "Import failed");
        } else {
          pollRef.current = setTimeout(poll, 3000);
        }
      } catch {
        pollRef.current = setTimeout(poll, 3000);
      }
    };

    pollRef.current = setTimeout(poll, 3000);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [open, importId]);

  function invalidateDashboard() {
    // Invalidate by prefix so it matches regardless of whether the key is
    // keyed by numericUserId or orgId (dashboard uses orgId after the fix).
    qc.invalidateQueries({ queryKey: ["tx_month"] });
    qc.invalidateQueries({ queryKey: ["tx_recent"] });
  }

  async function approveRow(row: PendingTx) {
    setApprovingId(row.id);
    try {
      await checkAddTransaction();
      // Supabase JS never throws — always check { error }
      const { error: insertError } = await supabase.from("transactions").insert({
        user_id: row.user_id,
        org_id: row.org_id,
        title: row.title,
        amount: row.transaction_type === "debit" ? -Math.abs(row.amount) : Math.abs(row.amount),
        description: row.description,
        type: "Business",
        deductible: true,
        date_time: row.date_time,
        is_ai_verified: false,
        ...(importDocId !== null ? { file_path: String(importDocId) } : {}),
      });
      if (insertError) throw new Error(insertError.message);

      await categorizeUncategorizedTransactions(1);

      const { error: deleteError } = await supabase
        .from("pending_transactions")
        .delete()
        .eq("id", row.id);
      if (deleteError) throw new Error(deleteError.message);

      setRows((prev) => prev.filter((r) => r.id !== row.id));
      invalidateDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed to approve transaction", description: msg, variant: "destructive" });
    } finally {
      setApprovingId(null);
    }
  }

  async function rejectRow(row: PendingTx) {
    setRejectingId(row.id);
    try {
      await supabase.from("pending_transactions").delete().eq("id", row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch {
      toast({ title: "Failed to reject transaction", variant: "destructive" });
    } finally {
      setRejectingId(null);
    }
  }

  async function approveAll() {
    for (const row of [...rows]) {
      await approveRow(row);
    }
    toast({ title: "All transactions approved" });
    onReviewComplete();
    onClose();
  }

  async function rejectAll() {
    try {
      await supabase.from("pending_transactions").delete().eq("import_id", importId);
      setRows([]);
      toast({ title: "All transactions rejected" });
    } catch {
      toast({ title: "Failed to reject all", variant: "destructive" });
    }
    onReviewComplete();
    onClose();
  }

  function fmtAmt(amount: number, type: string) {
    const abs = Math.abs(amount);
    const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(abs);
    return type === "debit" ? `-${fmt}` : `+${fmt}`;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {importStatus === "processing" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {importStatus === "completed" && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            {importStatus === "processing" ? "Processing Statement…" : importStatus === "completed" ? `Review Transactions (${rows.length})` : "Import Failed"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {importStatus === "processing" && (
            <div className="flex flex-col items-center gap-4 py-16">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                Your bank statement is being processed by AI. This usually takes 10–30 seconds.
              </p>
            </div>
          )}

          {importStatus === "failed" && (
            <div className="flex flex-col items-center gap-4 py-12 text-destructive">
              <X className="h-10 w-10" />
              <p className="text-sm text-center">{errorMsg || "Import failed. Please try again."}</p>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          )}

          {importStatus === "completed" && (
            loadingRows ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                <p className="text-sm">No transactions found to review.</p>
                <Button variant="outline" onClick={() => { onReviewComplete(); onClose(); }}>Done</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <div key={row.id} className={`flex items-center gap-3 rounded-md border px-3 py-2 ${row.is_duplicate ? "border-amber-500/30 bg-amber-500/5" : "border-border/50"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{row.title}</span>
                        {row.is_duplicate && <Badge variant="outline" className="text-xs text-amber-400 border-amber-600 flex-shrink-0">Duplicate</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{new Date(row.date_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                        {row.description && <span className="truncate max-w-[200px]">· {row.description}</span>}
                      </div>
                    </div>
                    <span className={`text-sm font-semibold flex-shrink-0 ${row.transaction_type === "debit" ? "text-rose-400" : "text-emerald-400"}`}>
                      {fmtAmt(row.amount, row.transaction_type)}
                    </span>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-rose-400 border-rose-800 hover:bg-rose-950"
                        disabled={rejectingId === row.id || approvingId === row.id}
                        onClick={() => rejectRow(row)}>
                        {rejectingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                      </Button>
                      <Button size="sm" className="h-7 px-2 text-xs bg-emerald-700 hover:bg-emerald-600"
                        disabled={approvingId === row.id || rejectingId === row.id}
                        onClick={() => approveRow(row)}>
                        {approvingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {importStatus === "completed" && rows.length > 0 && (
          <DialogFooter className="gap-2 pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground flex-1">{rows.length} transaction{rows.length !== 1 ? "s" : ""} pending</p>
            <Button variant="outline" size="sm" onClick={rejectAll} className="text-rose-400 border-rose-800 hover:bg-rose-950">
              Reject All
            </Button>
            <Button size="sm" onClick={approveAll} className="bg-emerald-700 hover:bg-emerald-600">
              Approve All
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Manual Review Template Dialog Body ────────────────────────────────────────

function ManualReviewTemplate({
  docType,
  initialYear,
  initialStart,
  initialEnd,
  onClose,
  onConfirm,
}: {
  docType: "pnl" | "bs" | "cf";
  initialYear: number;
  initialStart: string;
  initialEnd: string;
  onClose: () => void;
  onConfirm: (periods: ManualPeriod[]) => void;
}) {
  const [periods, setPeriods] = useState<ManualPeriod[]>(() => [
    makeManualPeriod(docType, initialYear, initialStart, initialEnd),
  ]);

  const rows = manualRowsFor(docType);
  const canAddPeriod = docType !== "bs" && periods.length < 8;

  function addPeriod() {
    if (!canAddPeriod) return;
    const last = periods[periods.length - 1];
    const nextYear = last.year + 1;
    setPeriods((prev) => [...prev, makeManualPeriod(docType, nextYear, `${nextYear}-01-01`, `${nextYear}-12-31`)]);
  }

  function removeLastPeriod() {
    if (periods.length <= 1) return;
    setPeriods((prev) => prev.slice(0, -1));
  }

  function updatePeriodMeta(idx: number, patch: Partial<Pick<ManualPeriod, "year" | "start" | "end">>) {
    setPeriods((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function updateField(idx: number, key: string, raw: string) {
    setPeriods((prev) => {
      const next = prev.map((p, i) =>
        i === idx ? { ...p, values: { ...p.values }, overrides: new Set(p.overrides) } : p
      );
      const p = next[idx];
      p.values[key] = raw;

      if (docType === "pnl") {
        if (MANUAL_PNL_AUTO_KEYS.has(key)) {
          p.overrides.add(key);
        } else if (MANUAL_PNL_REVENUE_KEYS.includes(key)) {
          ["totalRevenue", "grossProfit", "ebitda", "taxExpense", "netIncome"].forEach((k) => p.overrides.delete(k));
        } else if (MANUAL_PNL_COGS_KEYS.includes(key)) {
          ["totalCogs", "grossProfit", "ebitda", "taxExpense", "netIncome"].forEach((k) => p.overrides.delete(k));
        } else if (MANUAL_PNL_OPEX_KEYS.includes(key)) {
          ["totalOperatingExpenses", "ebitda", "taxExpense", "netIncome"].forEach((k) => p.overrides.delete(k));
        } else if (["depreciation", "amortization", "interestExpense", "taxRatePercent"].includes(key)) {
          ["taxExpense", "netIncome"].forEach((k) => p.overrides.delete(k));
        }
        recalcPnlPeriod(p);
      } else if (docType === "cf") {
        recalcCfPeriod(p);
      }
      return next;
    });
  }

  function useCalculated(idx: number, key: string) {
    setPeriods((prev) => {
      const next = prev.map((p, i) => (i === idx ? { ...p, overrides: new Set(p.overrides) } : p));
      next[idx].overrides.delete(key);
      recalcPnlPeriod(next[idx]);
      return next;
    });
  }

  return (
    <div className="space-y-4 py-1">
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
        AI could not auto-read this. Please enter values below.
      </div>

      {docType !== "bs" && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={addPeriod} disabled={!canAddPeriod} className="gap-1.5 text-muted-foreground">
            <Plus className="h-4 w-4" /> Add period
          </Button>
          {periods.length > 1 && (
            <Button type="button" variant="ghost" size="sm" onClick={removeLastPeriod} className="gap-1.5 text-muted-foreground">
              <Minus className="h-4 w-4" /> Remove last period
            </Button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="flex gap-2 mb-3">
          <div className="w-[180px] flex-shrink-0" />
          {periods.map((p, i) => (
            <div key={p.id} className="w-[190px] flex-shrink-0 rounded-md border border-border/50 bg-muted/30 p-2 space-y-1.5">
              <p className="text-[11px] text-muted-foreground">
                {docType === "pnl" ? "Profit & Loss / Income Statement" : docType === "bs" ? "Balance Sheet" : "Cash Flow Statement"}
              </p>
              {docType === "bs" ? (
                <>
                  <Label className="text-[10px]">As Of</Label>
                  <Input
                    type="date"
                    value={p.end}
                    onChange={(e) =>
                      updatePeriodMeta(i, { start: e.target.value, end: e.target.value, year: new Date(e.target.value).getFullYear() || p.year })
                    }
                    className="h-7 text-xs"
                  />
                </>
              ) : (
                <>
                  <Label className="text-[10px]">Year</Label>
                  <Select value={String(p.year)} onValueChange={(v) => updatePeriodMeta(i, { year: Number(v) })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="date" value={p.start} onChange={(e) => updatePeriodMeta(i, { start: e.target.value })} className="h-7 text-xs" />
                  <Input type="date" value={p.end} onChange={(e) => updatePeriodMeta(i, { end: e.target.value })} className="h-7 text-xs" />
                </>
              )}
            </div>
          ))}
        </div>

        <div className="divide-y divide-border/30">
          {rows.map((spec, rowIdx) =>
            spec.key === null ? (
              <p key={`hdr-${rowIdx}`} className="pt-3 pb-1 text-xs font-semibold text-muted-foreground">
                {spec.label}
              </p>
            ) : (
              <div key={spec.key} className="flex items-start gap-2 py-1.5">
                <div className="w-[180px] flex-shrink-0 text-xs pt-2">{spec.label}</div>
                {periods.map((p, i) => {
                  const isAuto = docType === "pnl" && MANUAL_PNL_AUTO_KEYS.has(spec.key as string);
                  const isReadOnly = docType === "cf" && MANUAL_CF_READONLY_KEYS.has(spec.key as string);
                  const overridden = isAuto && p.overrides.has(spec.key as string);
                  return (
                    <div key={p.id} className="w-[190px] flex-shrink-0">
                      <div className="relative">
                        {!spec.isPercent && (
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                        )}
                        <Input
                          value={p.values[spec.key as string] ?? "0.00"}
                          readOnly={isReadOnly}
                          onChange={(e) => updateField(i, spec.key as string, e.target.value)}
                          className={`h-8 text-xs ${spec.isPercent ? "pr-6" : "pl-5"}`}
                        />
                        {spec.isPercent && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                        )}
                      </div>
                      {overridden && (
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[10px] text-amber-400">Manually overridden</span>
                          <button type="button" onClick={() => useCalculated(i, spec.key as string)} className="text-[10px] text-primary underline">
                            Use calculated
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>

      <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground">{manualSummaryLabel(docType)}</p>
        {periods.map((p) => {
          const val = manualPeriodSummary(docType, p);
          return (
            <div key={p.id} className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {docType === "bs" ? `As of ${p.end}` : `${p.year} (${p.start} – ${p.end})`}
              </span>
              <span className={`font-semibold ${val < 0 ? "text-rose-400" : "text-emerald-400"}`}>{fmtMoney(val)}</span>
            </div>
          );
        })}
      </div>

      <DialogFooter className="gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={() => onConfirm(periods)} className="gap-1.5">
          <CheckCircle2 className="h-4 w-4" /> Confirm & Save
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Upload Dialog ─────────────────────────────────────────────────────────────

type UploadDialogProps = {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  onImportCreated: (importId: number) => void;
  numericUserId: number;
  authUuid: string; // used only for storage path namespacing
};

function UploadDialog({ open, onClose, onUploaded, onImportCreated, numericUserId, authUuid }: UploadDialogProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeOrgId] = useActiveOrganizationId(numericUserId);

  const { data: uploadOrgId } = useQuery<number | null>({
    queryKey: ["user_org_tax_upload", numericUserId, activeOrgId],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id")
        .eq("owner_id", numericUserId)
        .order("id", { ascending: true });
      if (error) throw error;
      return pickActiveOrganization(data as { id: number }[] | null, activeOrgId)?.id ?? null;
    },
  });

  // Form state
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [taxYear, setTaxYear] = useState(String(CURRENT_YEAR));
  const [periodStart, setPeriodStart] = useState(`${CURRENT_YEAR}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(`${CURRENT_YEAR}-12-31`);
  const [asOf, setAsOf] = useState(new Date().toISOString().split("T")[0]);

  // Multi-step state
  const [step, setStep] = useState<"form" | "uploading" | "extracting" | "review">("form");
  const [extracted, setExtracted] = useState<ExtractedDoc | null>(null);
  const [insertedDocId, setInsertedDocId] = useState<number | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  // Holds the period metadata (period_start/period_end/as_of/document_category)
  // saved at insert time, so handleConfirmExtraction can merge it back in
  // instead of clobbering it with the extracted figures.
  const [baseParsedData, setBaseParsedData] = useState<Record<string, string>>({});

  const isBalanceSheet = category === "Balance Sheet";
  const busy = step === "uploading" || step === "extracting";

  function reset() {
    setPickedFile(null);
    setDocName("");
    setCategory("");
    setTaxYear(String(CURRENT_YEAR));
    setPeriodStart(`${CURRENT_YEAR}-01-01`);
    setPeriodEnd(`${CURRENT_YEAR}-12-31`);
    setAsOf(new Date().toISOString().split("T")[0]);
    setStep("form");
    setExtracted(null);
    setInsertedDocId(null);
    setExtractError(null);
    setBaseParsedData({});
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPickedFile(f);
    if (!docName) setDocName(f.name.replace(/\.[^.]+$/, ""));
  }

  function handleYearChange(y: string) {
    setTaxYear(y);
    if (!isBalanceSheet) {
      setPeriodStart(`${y}-01-01`);
      setPeriodEnd(`${y}-12-31`);
    }
  }

  async function handleSave() {
    if (!pickedFile) { toast({ title: "Please select a file", variant: "destructive" }); return; }
    const name = docName.trim();
    if (!name) { toast({ title: "Please enter a document name", variant: "destructive" }); return; }
    if (!category) { toast({ title: "Please select a category", variant: "destructive" }); return; }
    if (!taxYear) { toast({ title: "Please select a year", variant: "destructive" }); return; }
    if (isBalanceSheet && !asOf) { toast({ title: "Please select an As Of date", variant: "destructive" }); return; }
    if (!isBalanceSheet) {
      if (!periodStart || !periodEnd) { toast({ title: "Please select period dates", variant: "destructive" }); return; }
      if (periodEnd < periodStart) { toast({ title: "End date must be on or after start date", variant: "destructive" }); return; }
    }

    setStep("uploading");
    try {
      const mime = guessMime(pickedFile.name);
      const ext = pickedFile.name.split(".").pop() ?? "";
      const finalName = name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`;

      // Upload via backend (service role key — bypasses RLS, consistent URL format)
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated.");

      const formData = new FormData();
      formData.append("file", pickedFile);
      formData.append("originalName", finalName);
      formData.append("category", category);

      const uploadRes = await fetch("/api/document-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({})) as { message?: string };
        throw new Error(`Storage upload failed: ${errBody.message ?? uploadRes.status}`);
      }
      const { publicUrl: fileUrl, storagePath } = await uploadRes.json() as { publicUrl: string; storagePath: string };

      const baseParsedData: Record<string, string> = { document_category: category };
      if (isBalanceSheet) {
        baseParsedData.as_of = asOf;
      } else {
        baseParsedData.period_start = periodStart;
        baseParsedData.period_end = periodEnd;
      }
      setBaseParsedData(baseParsedData);

      const { data: inserted, error: dbError } = await supabase
        .from("user_documents")
        .insert({
          user_id: numericUserId,
          name: finalName,
          file_url: fileUrl,
          tax_year: taxYear,
          category,
          file_size: pickedFile.size,
          mime_type: mime,
          parsed_data: baseParsedData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (dbError) {
        console.error("[upload] user_documents error:", dbError);
        throw new Error(dbError.message ?? String(dbError));
      }

      const docId = (inserted as { id: number }).id;
      setInsertedDocId(docId);

      // Check if this category supports AI extraction (P&L / BS / CF)
      const docType = categoryToDocType(category);
      if (docType) {
        // P&L / Balance Sheet / Cash Flow → AI extraction then review
        setStep("extracting");
        try {
          const result = await callExtractDocument(pickedFile, mime, docType);
          if (isZeroExtraction(result)) {
            // AI "succeeded" but couldn't actually read the document — fall back
            // to the Manual Review Template, same as a hard extraction failure.
            setExtractError("AI could not confidently read this document.");
          } else {
            setExtracted(result);
          }
          setStep("review");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setExtractError(msg);
          setStep("review"); // show review step with error state
        }
      } else if (mime === "application/pdf" || mime.startsWith("image/")) {
        // Any non-financial-statement category (Transactions + any other) with a
        // PDF or image → extract text and trigger the statement import pipeline.
        // Mirrors Flutter: only P&L / BS / CF get AI extraction; everything else
        // that is a PDF/image goes through the bank-statement/n8n pipeline.
        const orgId = uploadOrgId ?? null;
        if (orgId === null) {
          throw new Error("No organization found for your account. Please contact support.");
        }

        // Extract raw text from the PDF so n8n can send it to GPT
        let extractedText: string | null = null;
        let isScanned = mime.startsWith("image/");
        if (mime === "application/pdf") {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            const base64 = await fileToBase64(pickedFile);
            const textRes = await fetch("/api/extract-text", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ fileData: base64 }),
            });
            if (textRes.ok) {
              const payload = await textRes.json() as { text: string; isScanned: boolean };
              extractedText = payload.text || null;
              isScanned = payload.isScanned;
            }
          } catch (e) {
            console.warn("[upload] pdf text extraction failed, continuing without text:", e);
          }
        }

        const { data: importData, error: importError } = await supabase
          .from("statement_imports")
          .insert({
            user_id: numericUserId,
            org_id: orgId,
            document_id: docId,
            document_path: storagePath,
            mime_type: mime,
            is_scanned: isScanned,
            extracted_text: extractedText,
            status: "processing",
          })
          .select("id")
          .single();

        if (importError) {
          console.error("[upload] statement_imports error:", importError);
          throw new Error(importError.message);
        }

        const newImportId = (importData as { id: number }).id;
        onUploaded();
        reset();
        onClose();
        onImportCreated(newImportId);
        return;
      } else {
        // Any other category — just store the document
        toast({ title: "Document uploaded successfully" });
        onUploaded();
        reset();
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
      setStep("form");
    }
  }

  async function handleConfirmExtraction() {
    if (!insertedDocId || !extracted) return;
    try {
      // Flatten extracted data into parsed_data
      const flat: Record<string, unknown> = {};
      if (extracted.type === "pnl") {
        Object.assign(flat, extracted.data);
      } else if (extracted.type === "bs") {
        const d = extracted.data;
        flat.assets_current = d.assets.current;
        flat.assets_non_current = d.assets.non_current;
        flat.liabilities_current = d.liabilities.current;
        flat.liabilities_long_term = d.liabilities.long_term;
        flat.equity = d.equity;
      } else if (extracted.type === "cf") {
        Object.assign(flat, extracted.data);
      }
      flat.ai_extracted = true;
      flat.ai_extracted_at = new Date().toISOString();

      // Merge with the period metadata (period_start/period_end/as_of/
      // document_category) saved at insert time — do NOT overwrite it, or the
      // document loses the period info needed to place it on a timeline.
      await supabase
        .from("user_documents")
        .update({ parsed_data: { ...baseParsedData, ...flat }, updated_at: new Date().toISOString() })
        .eq("id", insertedDocId);

      toast({ title: "Extracted data saved to document" });
    } catch {
      toast({ title: "Could not save extracted data", variant: "destructive" });
    }
    onUploaded();
    reset();
    onClose();
  }

  function handleSkipExtraction() {
    toast({ title: "Document uploaded successfully" });
    onUploaded();
    reset();
    onClose();
  }

  async function handleManualConfirm(periods: ManualPeriod[]) {
    if (!insertedDocId) return;
    try {
      const periodPayload = periods.map((p) => {
        const flat: Record<string, number> = {};
        for (const k of Object.keys(p.values)) flat[k] = parseMoney(p.values[k]);
        return { year: p.year, period_start: p.start, period_end: p.end, ...flat };
      });
      const flat: Record<string, unknown> = {
        manual_entry: true,
        manual_entry_at: new Date().toISOString(),
        periods: periodPayload,
      };
      if (periodPayload.length === 1) Object.assign(flat, periodPayload[0]);

      await supabase
        .from("user_documents")
        .update({ parsed_data: flat, updated_at: new Date().toISOString() })
        .eq("id", insertedDocId);

      toast({ title: "Manual entry saved" });
    } catch {
      toast({ title: "Could not save manual entry", variant: "destructive" });
    }
    onUploaded();
    reset();
    onClose();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) handleClose(); }}>
      <DialogContent
        className={cn(
          "max-h-[85vh] overflow-y-auto flex flex-col",
          step === "review" && extractError && categoryToDocType(category)
            ? "max-w-3xl"
            : "max-w-md"
        )}
      >

        {/* ── Step: uploading ── */}
        {step === "uploading" && (
          <>
            <DialogHeader>
              <DialogTitle>Uploading Document…</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-10">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Saving to storage…</p>
            </div>
          </>
        )}

        {/* ── Step: extracting ── */}
        {step === "extracting" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Analyzing with AI…
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground text-center max-w-[240px]">
                GPT-4o is reading your document and extracting financial figures…
              </p>
            </div>
          </>
        )}

        {/* ── Step: review ── */}
        {step === "review" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {extractError ? "Manual Review Template" : "AI Extraction Review"}
              </DialogTitle>
            </DialogHeader>

            {extractError && categoryToDocType(category) ? (
              <ManualReviewTemplate
                docType={categoryToDocType(category) as "pnl" | "bs" | "cf"}
                initialYear={Number(taxYear) || CURRENT_YEAR}
                initialStart={periodStart}
                initialEnd={isBalanceSheet ? asOf : periodEnd}
                onClose={handleSkipExtraction}
                onConfirm={handleManualConfirm}
              />
            ) : extractError ? (
              <div className="space-y-3 py-2">
                <p className="text-sm text-destructive">
                  AI extraction failed: {extractError}
                </p>
                <p className="text-xs text-muted-foreground">
                  Your document was saved. You can still use it without extracted data.
                </p>
                <DialogFooter className="gap-2 pt-2">
                  <Button variant="outline" onClick={handleSkipExtraction} className="gap-1.5">
                    <SkipForward className="h-4 w-4" />
                    Close
                  </Button>
                </DialogFooter>
              </div>
            ) : extracted ? (
              <div className="space-y-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Review the figures GPT-4o extracted from your document. Confirm to save them,
                  or skip to keep only the file.
                </p>
                <div className="rounded-md border border-border/50 divide-y divide-border/40">
                  {extracted.type === "pnl" && (
                    <>
                      {[
                        ["Revenue", extracted.data.revenue],
                        ["Cost of Goods Sold", extracted.data.cost_of_goods_sold],
                        ["Gross Profit", extracted.data.gross_profit],
                        ["Operating Expenses", extracted.data.operating_expenses],
                        ["Net Income", extracted.data.net_income],
                      ].map(([label, val]) => (
                        <div key={label as string} className="flex justify-between px-3 py-2">
                          <span className="text-sm text-muted-foreground">{label as string}</span>
                          <span className={`text-sm font-semibold ${(val as number) < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                            {fmtMoney(val as number)}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                  {extracted.type === "bs" && (
                    <>
                      {[
                        ["Current Assets", extracted.data.assets.current],
                        ["Non-Current Assets", extracted.data.assets.non_current],
                        ["Current Liabilities", extracted.data.liabilities.current],
                        ["Long-Term Liabilities", extracted.data.liabilities.long_term],
                        ["Equity", extracted.data.equity],
                      ].map(([label, val]) => (
                        <div key={label as string} className="flex justify-between px-3 py-2">
                          <span className="text-sm text-muted-foreground">{label as string}</span>
                          <span className={`text-sm font-semibold ${(val as number) < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                            {fmtMoney(val as number)}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                  {extracted.type === "cf" && (
                    <>
                      {[
                        ["Operating Activities", extracted.data.operating_activities],
                        ["Investing Activities", extracted.data.investing_activities],
                        ["Financing Activities", extracted.data.financing_activities],
                      ].map(([label, val]) => (
                        <div key={label as string} className="flex justify-between px-3 py-2">
                          <span className="text-sm text-muted-foreground">{label as string}</span>
                          <span className={`text-sm font-semibold ${(val as number) < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                            {fmtMoney(val as number)}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
                <DialogFooter className="gap-2 pt-2">
                  <Button variant="outline" onClick={handleSkipExtraction} className="gap-1.5">
                    <SkipForward className="h-4 w-4" />
                    Skip
                  </Button>
                  <Button onClick={handleConfirmExtraction} className="gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    Save Extracted Data
                  </Button>
                </DialogFooter>
              </div>
            ) : null}
          </>
        )}

        {/* ── Step: form (default) ── */}
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>Upload Financial Document</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* File picker zone */}
              <div
                className="border-2 border-dashed border-border/60 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {pickedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileUp className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium truncate max-w-[220px]">{pickedFile.name}</span>
                    <button
                      type="button"
                      className="ml-1 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPickedFile(null);
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileUp className="h-8 w-8" />
                    <span className="text-sm">Click to select a file</span>
                    <span className="text-xs">PDF, images, spreadsheets, etc.</span>
                  </div>
                )}
                <input ref={fileRef} type="file" className="hidden" onChange={handleFilePick} />
              </div>

              {/* AI extraction badge */}
              {category && categoryToDocType(category) && (
                <div className="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2 text-xs text-primary">
                  <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
                  AI will automatically extract financial figures from this document
                </div>
              )}

              {/* Document name */}
              <div className="space-y-1.5">
                <Label>Document Name *</Label>
                <Input
                  placeholder="e.g. Q4 Profit & Loss 2024"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label>Document Category *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tax Year */}
              <div className="space-y-1.5">
                <Label>Tax Year</Label>
                <Select value={taxYear} onValueChange={handleYearChange}>
                  <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                  <SelectContent className="max-h-48">
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date fields */}
              {isBalanceSheet ? (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />As Of Date *
                  </Label>
                  <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />Period Start *
                    </Label>
                    <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />Period End *
                    </Label>
                    <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleSave} className="min-w-[90px]">Upload</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Tax page ─────────────────────────────────────────────────────────────

export default function Tax() {
  const { user, profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewImportId, setReviewImportId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [docToDelete, setDocToDelete] = useState<UserDocument | null>(null);

  const { data: docs = [], isLoading, error: queryError } = useQuery<UserDocument[]>({
    queryKey: ["user_documents", numericId],
    enabled: numericId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_documents")
        .select("*")
        .eq("user_id", numericId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: UserDocument) => {
      // 1. Find any statement_imports rows for this document
      const { data: imports } = await supabase
        .from("statement_imports")
        .select("id")
        .eq("document_id", doc.id);

      if (imports && imports.length > 0) {
        const importIds = (imports as { id: number }[]).map((r) => r.id);

        // 2. Fetch pending_transactions BEFORE deleting them — needed to match
        //    old approved transactions that pre-date the file_path link.
        //    (bulk-review keeps approved rows; tax inline review deletes them)
        const { data: pendingRows } = await supabase
          .from("pending_transactions")
          .select("title,amount,date_time,transaction_type")
          .in("import_id", importIds);

        // 3. Delete matching approved transactions (old data without file_path)
        if (pendingRows && pendingRows.length > 0) {
          for (const pt of pendingRows as { title: string; amount: number; date_time: string; transaction_type: string }[]) {
            const signedAmount = pt.transaction_type === "credit"
              ? Math.abs(pt.amount)
              : -Math.abs(pt.amount);
            await supabase
              .from("transactions")
              .delete()
              .eq("user_id", numericId!)
              .eq("title", pt.title)
              .eq("amount", signedAmount)
              .eq("date_time", pt.date_time);
          }
        }

        // 4. Delete the pending_transactions
        await supabase
          .from("pending_transactions")
          .delete()
          .in("import_id", importIds);

        // 5. Delete the statement_imports rows
        await supabase
          .from("statement_imports")
          .delete()
          .in("id", importIds);
      }

      // 6. Delete approved transactions linked via file_path (new data going forward)
      await supabase
        .from("transactions")
        .delete()
        .eq("file_path", String(doc.id));

      // 7. Delete the document row
      const { error } = await supabase
        .from("user_documents")
        .delete()
        .eq("id", doc.id);
      if (error) throw error;

      // 6. Best-effort delete from storage
      try {
        const url = new URL(doc.file_url);
        const pathParts = url.pathname.split("/documents/");
        if (pathParts[1]) {
          await supabase.storage.from("documents").remove([pathParts[1]]);
        }
      } catch {}
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_documents", numericId] });
      qc.invalidateQueries({ queryKey: ["doc_count", numericId] });
      qc.invalidateQueries({ queryKey: ["pending_count", numericId] });
      qc.invalidateQueries({ queryKey: ["tx_month"] });
      qc.invalidateQueries({ queryKey: ["tx_recent"] });
      qc.invalidateQueries({ queryKey: ["tx_all_full"] });
      toast({ title: "Document deleted", description: "The file has been removed." });
    },
    onError: (e: Error) => {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    },
  });

  const filtered = docs.filter((d) => {
    const matchSearch =
      !search || d.name.toLowerCase().includes(search.toLowerCase());
    const matchYear = filterYear === "all" || d.tax_year === filterYear;
    const matchCat =
      filterCategory === "all" || d.category === filterCategory;
    return matchSearch && matchYear && matchCat;
  });

  const availableYears = [...new Set(docs.map((d) => d.tax_year).filter(Boolean))] as string[];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Document Repository</h1>
          <p className="text-muted-foreground">
            Manage your tax documents and filings.
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => setUploadOpen(true)}
          disabled={!user}
        >
          <FileUp className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Document list */}
        <Card className="col-span-2 border-border/50">
          <CardHeader>
            <CardTitle>Tax Documents</CardTitle>
            <CardDescription>
              Your uploaded financial documents
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-4">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents…"
                  className="pl-9 h-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="h-9 w-[110px]">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All years</SelectItem>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table / empty state */}
            {isLoading ? (
              <div className="flex justify-center items-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : queryError ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FolderOpen className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-sm text-destructive font-medium mb-1">Could not load documents</p>
                <p className="text-xs text-center max-w-xs">
                  {(queryError as Error).message}
                </p>
              </div>
            ) : numericId === null ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FolderOpen className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-sm">Your account profile is still loading…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FolderOpen className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-sm">
                  {docs.length === 0
                    ? "No documents yet. Click Upload to add one."
                    : "No documents match your filters."}
                </p>
              </div>
            ) : (
              <div className="border rounded-md border-border/50">
                <Table>
                  <TableHeader className="bg-secondary/20">
                    <TableRow>
                      <TableHead>Document Name</TableHead>
                      <TableHead>Tax Year</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Date Added</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileIcon mime={doc.mime_type} />
                            <span className="truncate max-w-[160px]">{doc.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{doc.tax_year ?? "—"}</TableCell>
                        <TableCell>
                          {doc.category ? (
                            <Badge variant="outline" className="text-xs">
                              {doc.category}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {fileSizeLabel(doc.file_size) || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {formatDate(doc.created_at)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={async () => {
                                  const url = await getSignedUrl(doc.file_url);
                                  window.open(url, "_blank");
                                }}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Open
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDocToDelete(doc)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sidebar cards */}
        <div className="space-y-6">
          <Card className="border-border/50 bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg">Next Deadline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary mb-1">Apr 15</div>
              <p className="text-sm font-medium mb-4">
                Federal Income Tax Return
              </p>
              <div className="text-sm text-muted-foreground mb-4">
                Make sure all your financial documents are uploaded before the
                filing deadline.
              </div>
              <Button className="w-full" onClick={() => setUploadOpen(true)}>
                Upload Documents
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Document Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {CATEGORIES.map((cat) => {
                const count = docs.filter((d) => d.category === cat).length;
                return (
                  <div key={cat} className="flex justify-between items-center">
                    <span className="text-sm font-medium truncate pr-2">
                      {cat}
                    </span>
                    <Badge
                      variant={count > 0 ? "default" : "outline"}
                      className={count > 0 ? "bg-primary/20 text-primary border-primary/30" : ""}
                    >
                      {count}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {user && numericId !== null && (
        <UploadDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onUploaded={() =>
            qc.invalidateQueries({ queryKey: ["user_documents", numericId] })
          }
          onImportCreated={(importId) => setReviewImportId(importId)}
          numericUserId={numericId}
          authUuid={user.id}
        />
      )}

      {user && numericId !== null && reviewImportId !== null && (
        <StatementReviewDialog
          importId={reviewImportId}
          open={reviewImportId !== null}
          onClose={() => setReviewImportId(null)}
          numericUserId={numericId}
          onReviewComplete={() =>
            qc.invalidateQueries({ queryKey: ["user_documents", numericId] })
          }
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={docToDelete !== null} onOpenChange={(open) => { if (!open) setDocToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{docToDelete?.name}</span>{" "}
              and its import records. Any transactions already added to your account will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!docToDelete) return;
                deleteMutation.mutate(docToDelete);
                setDocToDelete(null);
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete document
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
