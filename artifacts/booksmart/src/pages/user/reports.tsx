import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { checkAddTransaction } from "@/lib/plan-limits";
import { categorizeTransaction, categorizeUncategorizedTransactions } from "@/lib/ai-categorization";
import { openPlaidLink } from "@/lib/plaid-link";
import { spendTokensForUnlock, type TokenUnlockKey } from "@/lib/token-unlocks";
import {
  pickActiveOrganization,
  useActiveOrganizationId,
} from "@/lib/active-organization";
import { useToast } from "@/hooks/use-toast";
import {
  categoryToDocType,
  earliestFinancialDate,
  normalizeStatementDoc,
  resolveFinancialStatements,
  statementPeriodLabel,
  type StatementPeriod,
} from "@/lib/financial-statements";
import {
  calculateFinancialReport,
  chartBucket,
  chartGranularity,
  classifyTransaction,
  compareValues,
  dynamicAxisBounds,
  type FinancialReportResult,
} from "@/lib/financial-engine";
import {
  createStatementExport,
  safeStatementFilename,
  statementExportToCsv,
  type StatementExport,
} from "@/lib/statement-export";
import {
  useDeductionRuleSet,
  summarizeDeductions,
  type OrgRow,
} from "@/lib/deduction-engine";
import { normalizeStateId } from "@/lib/state-id";
import {
  PnLCard,
  BSCard,
  CFCard,
} from "@/components/reports/financial-statements-tab";
import { StatementReviewDialog } from "@/components/statement-review-dialog";
import { TransactionReviewDialog } from "@/pages/user/tax";
import {
  createStatementReview,
  extractFinancialStatement,
  type StatementDraft,
  type StatementType,
} from "@/lib/statement-workflow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  ComposedChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Loader2,
  DollarSign,
  BarChart2,
  Droplets,
  Sparkles,
  Download,
  Upload,
  FileText,
  Search,
  FileSpreadsheet,
  File,
  CheckCircle2,
  Clock,
  Trash2,
  Info,
  AlertTriangle,
  Package,
  Wallet,
  Tag,
  ChevronDown,
  ChevronUp,
  Check,
  Camera,
  FolderOpen,
  ArrowDown,
  ArrowUp,
  Eye,
  MoreHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const PLAID_CATEGORIZATION_BATCH_LIMIT = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

type Transaction = {
  id: number;
  title: string;
  amount: number;
  type: string;
  date_time: string;
  description: string;
  deductible: boolean;
  category_id?: number | null;
  sub_category_id?: number | null;
};

type ExtractedReceiptTransaction = {
  id: number;
  title: string;
  amount: number;
  transaction_type: "debit" | "credit";
  date_time: string;
  description: string;
  category_id: number | null;
  sub_category_id: number | null;
  business_type?: "Business" | "Personal";
  deductible?: boolean;
  merchant?: string;
  account_id?: string;
  payment_method?: string;
  receipt_number?: string;
  account_card_hint?: string;
  business_use?: "Business" | "Personal" | "Split";
  business_percentage?: number;
  reimbursable?: boolean;
};
type AiStrategySummaryRow = {
  estimated_savings: number | null;
  ai_context: string | null;
};

type Category = { id: number; name: string; type?: string | null };
type SubCategory = { id: number; name: string; category_id: number };
type PlaidItemRow = {
  id: number;
  institution_name: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};
type PlaidAccountRow = {
  id: number;
  plaid_item_id: number;
  name: string | null;
  official_name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  updated_at: string | null;
};
type ConnectedBank = PlaidItemRow & { accounts: PlaidAccountRow[] };

type Period = "7d" | "30d" | "3m" | "12m" | "yearly" | "all" | "custom";
type Tab = "dashboard" | "transactions" | "pl" | "bs" | "cf";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function buildTransactionDescription(
  notes: string,
  details: {
    merchant?: string;
    account?: string;
    paymentMethod?: string;
    receiptNumber?: string;
    businessUse?: string;
    businessPercentage?: number;
    reimbursable?: boolean;
  },
) {
  const metadata = [
    details.merchant?.trim() ? `Merchant / Vendor: ${details.merchant.trim()}` : "",
    details.account ? `Account: ${details.account}` : "",
    details.paymentMethod?.trim() ? `Payment Method: ${details.paymentMethod.trim()}` : "",
    details.receiptNumber?.trim() ? `Receipt / Invoice #: ${details.receiptNumber.trim()}` : "",
    details.businessUse ? `Business Use: ${details.businessUse}${details.businessUse === "Split" ? ` (${details.businessPercentage ?? 0}%)` : ""}` : "",
    details.reimbursable ? "Reimbursable: Yes" : "",
  ].filter(Boolean);
  return [notes.trim(), metadata.join("\n")].filter(Boolean).join("\n\n");
}
function fmtShort(v: number) {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return fmt(v);
}
function fmtTrendTick(v: number) {
  if (v === 0) return "$0";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getViewport: (options: { scale: number }) => {
      width: number;
      height: number;
    };
    render: (options: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }) => {
      promise: Promise<void>;
    };
  }>;
};

async function renderPdfPagesToPngFiles(file: File): Promise<File[]> {
  const loadPdfJs = new Function("url", "return import(url)") as (
    url: string,
  ) => Promise<unknown>;
  const pdfjs = (await loadPdfJs(
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs",
  )) as {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument: (options: { data: Uint8Array }) => {
      promise: Promise<PdfJsDocument>;
    };
  };
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  const baseName = file.name.replace(/\.pdf$/i, "");
  const pages: File[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare PDF page renderer.");

    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) resolve(nextBlob);
        else reject(new Error("Could not render PDF page image."));
      }, "image/png");
    });
    pages.push(
      new window.File([blob], `${baseName}_p${pageNumber}.png`, {
        type: "image/png",
      }),
    );
  }

  return pages;
}

async function uploadTransactionPdfPages(
  file: File,
  token: string,
): Promise<string[]> {
  const pageFiles = await renderPdfPagesToPngFiles(file);
  const pagePaths: string[] = [];

  try {
    for (const pageFile of pageFiles) {
      const formData = new FormData();
      formData.append("file", pageFile);
      formData.append("originalName", pageFile.name);
      formData.append("category", "Transactions");

      const uploadRes = await fetch("/api/document-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        const errBody = (await uploadRes.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          `PDF page upload failed: ${errBody.message ?? uploadRes.status}`,
        );
      }

      const { storagePath } = (await uploadRes.json()) as { storagePath: string };
      pagePaths.push(storagePath);
    }
  } catch (error) {
    await Promise.allSettled(
      pagePaths.map((storagePath) =>
        fetch(
          `/api/document-delete?storagePath=${encodeURIComponent(storagePath)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        ),
      ),
    );
    throw error;
  }

  return pagePaths;
}

function getNiceTrendScale(
  rows: Array<Record<string, unknown>>,
  keys: string[],
) {
  const values = rows.flatMap((row) =>
    keys.map((key) =>
      typeof row[key] === "number" ? (row[key] as number) : 0,
    ),
  );
  const domain = dynamicAxisBounds(values);
  const step = (domain[1] - domain[0]) / 3;
  const ticks = [domain[0], domain[0] + step, domain[0] + step * 2, domain[1]];
  return {
    ticks,
    domain,
    topLabel: `${fmtTrendTick(domain[0])} to ${fmtTrendTick(domain[1])}`,
  };
}
const trendChartPanelStyle = {
  background: "#061f49",
  border: "1px solid rgba(43,127,255,0.38)",
  borderRadius: 12,
};
const trendChartGrid = "rgba(120,160,220,0.2)";
const trendAxisTick = { fontSize: 9, fill: "rgba(172,190,226,0.72)" };
const trendTooltipStyle = {
  background: "#082754",
  border: "1px solid rgba(66,133,220,0.45)",
  borderRadius: 8,
  color: "#EAF2FF",
  fontSize: 11,
};
function pctLabel(v: number) {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function changePct(curr: number, prev: number): number {
  return compareValues(curr, prev).percent ?? 0;
}
function changeBadge(
  curr: number,
  prev: number | null,
  positiveIsGood: boolean,
) {
  if (prev === null) {
    return { label: "N/A", symbol: "", tone: "neutral" as const };
  }

  const percent = compareValues(curr, prev).percent;
  if (percent === null) {
    return { label: "N/A", symbol: "", tone: "neutral" as const };
  }
  if (percent === 0) {
    return { label: "0.0%", symbol: "—", tone: "neutral" as const };
  }

  const favorable = positiveIsGood ? percent > 0 : percent < 0;
  return {
    label:
      Math.abs(percent) >= 999 ? "999+%" : `${Math.abs(percent).toFixed(1)}%`,
    symbol: percent > 0 ? "▲" : "▼",
    tone: favorable ? ("positive" as const) : ("negative" as const),
  };
}

type TransactionBalanceSheetEstimate = {
  currentAssets: number;
  nonCurrentAssets: number;
  totalAssets: number;
  currentLiabilities: number;
  longTermLiabilities: number;
  totalLiabilities: number;
  equity: number;
};

type CashFlowEstimate = {
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
};

const hasAnyTerm = (text: string, terms: string[]) =>
  terms.some((term) => text.includes(term));

function transactionClassText(
  tx: Transaction,
  categories: Category[],
  subCategories: SubCategory[],
) {
  const category = categories.find((c) => c.id === tx.category_id)?.name ?? "";
  const subCategory =
    subCategories.find((s) => s.id === tx.sub_category_id)?.name ?? "";
  return `${tx.title ?? ""} ${tx.description ?? ""} ${tx.type ?? ""} ${category} ${subCategory}`
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function estimateBalanceSheetFromTransactions(
  txs: Transaction[],
  categories: Category[],
  subCategories: SubCategory[],
): TransactionBalanceSheetEstimate {
  const cashTerms = ["[asset:current]", "cash", "bank", "checking", "savings"];
  const receivableTerms = [
    "receivable",
    "accounts receivable",
    "customer owes",
    "client balance",
  ];
  const inventoryTerms = [
    "inventory",
    "stock",
    "product for sale",
    "goods for sale",
  ];
  const fixedAssetTerms = [
    "[asset:non-current]",
    "fixed asset",
    "equipment",
    "property",
    "vehicle",
    "furniture",
    "machinery",
    "computer",
    "tools",
  ];
  const otherAssetTerms = [
    "[asset",
    " asset",
    "prepaid",
    "security deposit",
    "goodwill",
    "investment",
  ];
  const currentLiabilityTerms = [
    "[liab:current]",
    "accounts payable",
    "payable",
    "credit card",
    "taxes owed",
    "tax owed",
    "payroll liabilities",
    "sales tax",
  ];
  const longTermLiabilityTerms = [
    "[liab:long-term]",
    "long-term liabilities",
    "long term liabilities",
    "loan",
    "mortgage",
    "debt:long",
    "note payable",
  ];
  const equityTerms = [
    "[equity]",
    "equity",
    "capital",
    "owner contribution",
    "owner investment",
    "retained earnings",
  ];
  const equityReductionTerms = [
    "owner draw",
    "owner draws",
    "distribution",
    "withdrawal",
  ];

  let cash = 0;
  let receivables = 0;
  let inventory = 0;
  let fixedAssets = 0;
  let otherAssets = 0;
  let currentLiabilities = 0;
  let longTermLiabilities = 0;
  let equityItems = 0;

  for (const tx of txs) {
    const amount = Math.abs(Number(tx.amount) || 0);
    if (amount === 0) continue;

    const text = transactionClassText(tx, categories, subCategories);
    const isCash = hasAnyTerm(text, cashTerms);
    const isReceivable = hasAnyTerm(text, receivableTerms);
    const isInventory = hasAnyTerm(text, inventoryTerms);
    const isFixedAsset = hasAnyTerm(text, fixedAssetTerms);
    const isOtherAsset = hasAnyTerm(text, otherAssetTerms);
    const isCurrentLiability = hasAnyTerm(text, currentLiabilityTerms);
    const isLongTermLiability = hasAnyTerm(text, longTermLiabilityTerms);
    const isEquity =
      hasAnyTerm(text, equityTerms) || hasAnyTerm(text, equityReductionTerms);

    if (isCash) cash += amount;
    if (isReceivable) receivables += amount;
    if (isInventory) inventory += amount;
    if (isFixedAsset)
      fixedAssets += hasAnyTerm(text, ["depreciation", "amortization"])
        ? -amount
        : amount;
    if (
      isOtherAsset &&
      !isCash &&
      !isReceivable &&
      !isInventory &&
      !isFixedAsset
    )
      otherAssets += amount;
    if (isCurrentLiability) currentLiabilities += amount;
    if (isLongTermLiability) longTermLiabilities += amount;
    if (isEquity)
      equityItems += hasAnyTerm(text, equityReductionTerms) ? -amount : amount;
  }

  fixedAssets = Math.max(0, fixedAssets);
  equityItems = Math.max(0, equityItems);

  const currentAssets = cash + receivables + inventory;
  const nonCurrentAssets = fixedAssets + otherAssets;
  const totalAssets = currentAssets + nonCurrentAssets;
  const totalLiabilities = currentLiabilities + longTermLiabilities;

  if (totalAssets <= 0 && totalLiabilities <= 0 && equityItems <= 0) {
    const netAssets = Math.max(
      0,
      txs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0),
    );
    return {
      currentAssets: netAssets,
      nonCurrentAssets: 0,
      totalAssets: netAssets,
      currentLiabilities: 0,
      longTermLiabilities: 0,
      totalLiabilities: 0,
      equity: netAssets,
    };
  }

  return {
    currentAssets,
    nonCurrentAssets,
    totalAssets,
    currentLiabilities,
    longTermLiabilities,
    totalLiabilities,
    equity:
      equityItems > 0
        ? equityItems
        : Math.max(0, totalAssets - totalLiabilities),
  };
}

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (period === "7d") {
    start.setDate(end.getDate() - 6);
  } else if (period === "30d") {
    start.setDate(end.getDate() - 29);
  } else if (period === "3m") {
    start.setMonth(end.getMonth() - 3);
  } else if (period === "12m") {
    start.setMonth(end.getMonth() - 12);
  } else if (period === "yearly") {
    start.setFullYear(end.getFullYear(), 0, 1);
  } else {
    start.setTime(end.getTime());
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function getPrevRange(
  period: Period,
  start: Date,
  end: Date,
): { start: Date; end: Date } {
  if (period === "all") {
    return { start, end: new Date(start.getTime() - 1) };
  }
  const dur = end.getTime() - start.getTime();
  return {
    start: new Date(start.getTime() - dur - 1),
    end: new Date(start.getTime() - 1),
  };
}

/** Group transactions into time buckets for the chart */
function buildTrendData(
  txs: Transaction[],
  start: Date,
  end: Date,
  categories: Category[] = [],
  subCategories: SubCategory[] = [],
) {
  const buckets: Map<string, { revenue: number; expenses: number }> = new Map();
  const labels: Map<string, string> = new Map();
  const order: string[] = [];

  const addBucket = (key: string, label: string) => {
    if (!buckets.has(key)) {
      buckets.set(key, { revenue: 0, expenses: 0 });
      labels.set(key, label);
      order.push(key);
    }
  };

  const parseTxDate = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const granularity = chartGranularity(start, end);
  const datedTxs = txs
    .map((tx) => ({ tx, date: parseTxDate(tx.date_time) }))
    .filter(
      (item): item is { tx: Transaction; date: Date } => item.date !== null,
    );

  for (const { date } of datedTxs) {
    const bucket = chartBucket(date, granularity);
    addBucket(bucket.key, bucket.label);
  }
  order.sort();

  for (const { tx, date: d } of datedTxs) {
    const key = chartBucket(d, granularity).key;
    if (!buckets.has(key)) continue;
    const b = buckets.get(key)!;
    const classified = classifyTransaction(tx, categories, subCategories);
    if (classified.isTransfer) continue;
    if (["revenue", "other_income"].includes(classified.classification))
      b.revenue += Math.abs(tx.amount);
    else if (["returns", "discounts"].includes(classified.classification))
      b.revenue -= Math.abs(tx.amount);
    else if (
      [
        "cogs",
        "opex",
        "other_expense",
        "income_tax",
        "interest",
        "depreciation",
        "amortization",
      ].includes(classified.classification)
    ) {
      b.expenses += Math.abs(tx.amount);
    }
  }

  return order.map((key) => {
    const v = buckets.get(key) ?? { revenue: 0, expenses: 0 };
    return {
      label: labels.get(key) ?? key,
      revenue: Math.round(v.revenue),
      expenses: Math.round(v.expenses),
      netCash: Math.round(v.revenue - v.expenses),
      profit: Math.round(v.revenue - v.expenses),
    };
  });
}

// ─── Storage helper ───────────────────────────────────────────────────────────

/** Extract the storage object path from any Supabase storage URL.
 *  Returns the path with percent-encoding PRESERVED (e.g. spaces stay as %20)
 *  so that createSignedUrl receives a valid URL-safe path. */
function extractStoragePath(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    // url.pathname keeps percent-encoding intact
    const parts = url.pathname.split("/documents/");
    // Do NOT decodeURIComponent — keep %20 etc. so createSignedUrl works
    return parts[1] ? decodeURIComponent(parts[1]) : null;
  } catch {
    return null;
  }
}

/** Returns the file URL for fetching — bucket is public so the stored URL works directly */
async function getSignedUrl(fileUrl: string): Promise<string> {
  const path = extractStoragePath(fileUrl);
  if (!path) return fileUrl;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch("/api/document-signed-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new Error(
      res.status === 404
        ? "not_found"
        : (body.message ?? body.error ?? `sign_failed_${res.status}`),
    );
  }

  const body = (await res.json()) as { signedUrl?: string };
  return body.signedUrl ?? fileUrl;
}

/** Trigger a browser download through the backend proxy (reliable inside iframes) */
async function proxyDownload(fileUrl: string, filename: string) {
  const signedUrl = await getSignedUrl(fileUrl);
  const params = new URLSearchParams({ url: signedUrl, filename });
  const proxyUrl = `/api/document-download?${params.toString()}`;
  const res = await fetch(proxyUrl);
  if (!res.ok)
    throw new Error(`Download failed: file not found (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

// ─── Small UI pieces ──────────────────────────────────────────────────────────

function ChangeBadge({
  curr,
  prev,
  positiveIsGood = true,
}: {
  curr: number;
  prev: number | null;
  positiveIsGood?: boolean;
}) {
  const { label, symbol, tone } = changeBadge(curr, prev, positiveIsGood);
  const toneClass =
    tone === "positive"
      ? "bg-emerald-500/20 text-emerald-400"
      : tone === "negative"
        ? "bg-rose-500/20 text-rose-400"
        : "bg-slate-500/20 text-slate-300";
  return (
    <span
      className={`text-xs font-semibold px-1.5 py-0.5 rounded ${toneClass}`}
    >
      {symbol ? `${symbol} ` : ""}
      {label}
    </span>
  );
}

function BHSGauge({ score }: { score: number }) {
  // 270° sweep: start at -135° (bottom-left), end at 135° (bottom-right)
  const startDeg = -135;
  const totalDeg = 270;
  const cx = 80;
  const cy = 80;
  const r = 58;
  const rTick = 68;

  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const pt = (deg: number, radius: number) => ({
    x: cx + radius * Math.cos(toRad(deg)),
    y: cy + radius * Math.sin(toRad(deg)),
  });

  const segArc = (s: number, e: number) => {
    const sv = pt(s, r);
    const ev = pt(e, r);
    const large = e - s > 180 ? 1 : 0;
    return `M ${sv.x.toFixed(2)} ${sv.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${ev.x.toFixed(2)} ${ev.y.toFixed(2)}`;
  };

  // 5 equal segments: 0-20 red, 20-40 orange, 40-60 yellow, 60-80 lime, 80-100 green
  const segments = [
    { from: 0, to: 20, color: "#ef4444" },
    { from: 20, to: 40, color: "#f97316" },
    { from: 40, to: 60, color: "#eab308" },
    { from: 60, to: 80, color: "#84cc16" },
    { from: 80, to: 100, color: "#22c55e" },
  ];

  // Tick marks at 0,20,40,60,80,100
  const ticks = [0, 20, 40, 60, 80, 100];

  const needleDeg = startDeg + (score / 100) * totalDeg;
  const np = pt(needleDeg, r - 8);

  const labelColor =
    score >= 80
      ? "#22c55e"
      : score >= 60
        ? "#84cc16"
        : score >= 40
          ? "#eab308"
          : score >= 20
            ? "#f97316"
            : "#ef4444";
  const label =
    score >= 80
      ? "Excellent"
      : score >= 60
        ? "Good"
        : score >= 40
          ? "Fair"
          : score >= 20
            ? "Poor"
            : "Critical";

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="120" viewBox="0 0 160 120">
        {/* Background track */}
        <path
          d={segArc(startDeg, startDeg + totalDeg)}
          fill="none"
          stroke="#1E3A5F"
          strokeWidth="11"
          strokeLinecap="butt"
        />
        {/* Color segments */}
        {segments.map((seg) => {
          const sd = startDeg + (seg.from / 100) * totalDeg;
          const ed = startDeg + (seg.to / 100) * totalDeg;
          return (
            <path
              key={seg.from}
              d={segArc(sd, ed)}
              fill="none"
              stroke={seg.color}
              strokeWidth="11"
              strokeLinecap="butt"
            />
          );
        })}
        {/* Tick marks */}
        {ticks.map((pct) => {
          const deg = startDeg + (pct / 100) * totalDeg;
          const inner = pt(deg, rTick - 7);
          const outer = pt(deg, rTick + 2);
          return (
            <line
              key={pct}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="hsl(var(--background))"
              strokeWidth="2"
            />
          );
        })}
        {/* Tick labels at 0,20,40,60,80,100 */}
        {ticks.map((pct) => {
          const deg = startDeg + (pct / 100) * totalDeg;
          const lp = pt(deg, rTick + 12);
          return (
            <text
              key={pct}
              x={lp.x}
              y={lp.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="8"
              fill="hsl(var(--muted-foreground))"
            >
              {pct}
            </text>
          );
        })}
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={np.x}
          y2={np.y}
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="5" fill="white" />
        <circle cx={cx} cy={cy} r="2.5" fill="hsl(var(--background))" />
        {/* Score */}
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          fontSize="20"
          fontWeight="bold"
          fill="white"
        >
          {score}
        </text>
      </svg>
      <span className="text-sm font-bold -mt-1" style={{ color: labelColor }}>
        {label}
      </span>
    </div>
  );
}

function CircularGauge({ pct, size = 90 }: { pct: number; size?: number }) {
  const r = size * 0.36;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(1, pct / 100) * circ;
  const color = pct >= 70 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.1}
        strokeWidth={9}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fontSize={size * 0.19}
        fontWeight="bold"
        fill="white"
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Document Repository types ─────────────────────────────────────────────

type DocStatus = "Uploaded" | "Verified" | "Processed";
type DocEntry = {
  id: string;
  title: string;
  type: string;
  category: string;
  date: string;
  createdAt: string;
  taxYear?: string;
  status: DocStatus;
  size: string;
  fileUrl?: string;
  mimeType?: string;
};

const DOC_CATEGORY_ORDER = [
  "Balance Sheet",
  "Profit & Loss",
  "Income Statement",
  "Cash Flow Statement",
  "Transactions",
];
const STATUS_COLOR: Record<DocStatus, string> = {
  Uploaded: "text-emerald-400 border-emerald-400/50 bg-emerald-500/10",
  Verified: "text-blue-400 border-blue-400/50 bg-blue-500/10",
  Processed: "text-primary border-primary/50 bg-primary/10",
};
const STATUS_ICON: Record<DocStatus, typeof CheckCircle2> = {
  Uploaded: CheckCircle2,
  Verified: CheckCircle2,
  Processed: Clock,
};

type ExportFreq = "monthly" | "quarterly" | "yearly";
type ExportReportType = "pl" | "bs" | "cf";
type ExportFormat = "csv" | "pdf" | "excel";

// ─── Export config ────────────────────────────────────────────────────────────
const MAX_EXPORT_COLS = 5;

function buildBucketLabels(start: Date, end: Date, freq: ExportFreq): string[] {
  const labels: string[] = [];
  if (freq === "monthly") {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= last) {
      labels.push(
        cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (freq === "quarterly") {
    let cursor = new Date(
      start.getFullYear(),
      Math.floor(start.getMonth() / 3) * 3,
      1,
    );
    while (cursor <= end) {
      const q = Math.floor(cursor.getMonth() / 3) + 1;
      labels.push(`Q${q} ${cursor.getFullYear()}`);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
    }
  } else {
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++)
      labels.push(String(y));
  }
  return labels;
}

function validateExportRange(
  start: Date,
  end: Date,
  freq: ExportFreq,
): string | null {
  if (end < start) return "End date must be on or after start date.";
  const n = buildBucketLabels(start, end, freq).length;
  if (n > MAX_EXPORT_COLS) {
    const lim =
      freq === "monthly"
        ? "5 months"
        : freq === "quarterly"
          ? "5 quarters"
          : "5 years";
    return `${freq.charAt(0).toUpperCase() + freq.slice(1)} view supports max ${lim}.`;
  }
  return null;
}

function exportFreqHelperText(freq: ExportFreq): string {
  return freq === "monthly"
    ? "Monthly: max 5 months"
    : freq === "quarterly"
      ? "Quarterly: max 5 quarters (~15 months)"
      : "Yearly: max 5 years";
}

function buildBsSnapshotEnds(
  asOf: Date,
  freq: ExportFreq,
  count: number,
): Date[] {
  const n = Math.min(count, MAX_EXPORT_COLS);
  const ends: Date[] = [
    new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()),
  ];
  let cursor = new Date(ends[0]);
  for (let i = 1; i < n; i++) {
    if (freq === "monthly") {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 0);
    } else if (freq === "quarterly") {
      const qm = Math.floor(cursor.getMonth() / 3) * 3;
      cursor = new Date(cursor.getFullYear(), qm, 0);
    } else {
      cursor = new Date(cursor.getFullYear() - 1, 11, 31);
    }
    ends.unshift(new Date(cursor));
  }
  return ends;
}

function buildBsSnapshotLabels(
  ends: Date[],
  freq: ExportFreq,
  asOf: Date,
): string[] {
  return ends.map((e) => {
    const isLast =
      e.getFullYear() === asOf.getFullYear() &&
      e.getMonth() === asOf.getMonth() &&
      e.getDate() === asOf.getDate();
    if (freq === "monthly") {
      const base = e.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
      const endOfMonth = new Date(e.getFullYear(), e.getMonth() + 1, 0);
      if (isLast && e.getDate() !== endOfMonth.getDate()) {
        return `${base} (As of ${asOf.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`;
      }
      return base;
    } else if (freq === "quarterly") {
      const q = Math.floor(e.getMonth() / 3) + 1;
      return `Q${q} ${e.getFullYear()}`;
    } else {
      return String(e.getFullYear());
    }
  });
}

function aggregateTxsByPeriod(
  txs: { amount: number; date_time: string }[],
  labels: string[],
  freq: ExportFreq,
): { revenues: number[]; expenses: number[] } {
  const revenues = labels.map(() => 0);
  const expenses = labels.map(() => 0);
  for (const tx of txs) {
    const d = new Date(tx.date_time);
    let key = "";
    if (freq === "monthly")
      key = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    else if (freq === "quarterly")
      key = `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    else key = String(d.getFullYear());
    const idx = labels.indexOf(key);
    if (idx >= 0) {
      if (tx.amount > 0) revenues[idx] += tx.amount;
      else expenses[idx] += Math.abs(tx.amount);
    }
  }
  return { revenues, expenses };
}

// ─── CSV export helper ──────────────────────────────────────────────────────

function exportCSV(rows: string[][], filename: string) {
  const csv = rows
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── P&L section builder ─────────────────────────────────────────────────────

type CatRow = { id: number; name: string; type: string };
type PnLRowKind = "header" | "item" | "total";

function buildPnLRows(
  txs: { amount: number; date_time: string; category_id?: number | null }[],
  labels: string[],
  freq: ExportFreq,
  cats: CatRow[],
): { body: string[][]; kinds: PnLRowKind[] } {
  const dash = "$-";
  const fmtAmt = (v: number) =>
    `$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtCol = (v: number) => (v === 0 ? dash : fmtAmt(v));

  const getPeriodIdx = (dateStr: string): number => {
    const d = new Date(dateStr);
    let key = "";
    if (freq === "monthly")
      key = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    else if (freq === "quarterly")
      key = `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    else key = String(d.getFullYear());
    return labels.indexOf(key);
  };

  const incomeMap = new Map<string, number[]>();
  const expenseMap = new Map<string, number[]>();

  for (const tx of txs) {
    const idx = getPeriodIdx(tx.date_time);
    if (idx < 0) continue;
    const cat = cats.find((c) => c.id === tx.category_id);
    if (tx.amount > 0) {
      const name = cat ? cat.name : "Uncategorized Income";
      if (!incomeMap.has(name))
        incomeMap.set(
          name,
          labels.map(() => 0),
        );
      incomeMap.get(name)![idx] += tx.amount;
    } else {
      const name = cat ? cat.name : "Uncategorized";
      if (!expenseMap.has(name))
        expenseMap.set(
          name,
          labels.map(() => 0),
        );
      expenseMap.get(name)![idx] += Math.abs(tx.amount);
    }
  }

  const totalRev = labels.map((_, i) =>
    Array.from(incomeMap.values()).reduce((s, a) => s + a[i], 0),
  );
  const totalExp = labels.map((_, i) =>
    Array.from(expenseMap.values()).reduce((s, a) => s + a[i], 0),
  );
  const grossProfit = totalRev; // COGS = 0 (no COGS tagging in current data model)
  const opIncome = grossProfit.map((g, i) => g - totalExp[i]);
  const netIncome = opIncome; // Other income/expenses = 0

  const body: string[][] = [];
  const kinds: PnLRowKind[] = [];

  const addHeader = (label: string) => {
    body.push([label, ...labels.map(() => "")]);
    kinds.push("header");
  };
  const addItem = (label: string, amounts: number[]) => {
    body.push([`    ${label}`, ...amounts.map(fmtCol)]);
    kinds.push("item");
  };
  const addTotal = (label: string, amounts: number[]) => {
    body.push([label, ...amounts.map(fmtCol)]);
    kinds.push("total");
  };

  // Revenue
  addHeader("Revenue");
  if (incomeMap.size === 0)
    addItem(
      "Uncategorized Income",
      labels.map(() => 0),
    );
  for (const [name, amounts] of incomeMap.entries()) addItem(name, amounts);
  addTotal("Total Revenue", totalRev);

  // Cost of Goods Sold
  addHeader("Cost of Goods Sold");
  addItem(
    "Inventory Purchases",
    labels.map(() => 0),
  );
  addTotal(
    "Total Cost of Goods Sold",
    labels.map(() => 0),
  );

  // Gross Profit
  addHeader("Gross Profit");
  addTotal("Gross Profit", grossProfit);

  // Operating Expenses
  addHeader("Operating Expenses");
  if (expenseMap.size === 0)
    addItem(
      "Uncategorized",
      labels.map(() => 0),
    );
  for (const [name, amounts] of expenseMap.entries()) addItem(name, amounts);
  addTotal("Total Operating Expenses", totalExp);

  // Operating Income
  addHeader("Operating Income");
  addTotal("Operating Income", opIncome);

  // Other Income / Expenses
  addHeader("Other Income / Expenses");
  addTotal(
    "Total Other Income / (Expenses)",
    labels.map(() => 0),
  );

  // EBITDA
  addHeader("EBITDA (Reconciliation)");
  addTotal("EBITDA", opIncome);

  // Net Income
  addHeader("Net Income");
  addTotal("Net Income", netIncome);

  return { body, kinds };
}

// ─── Shared export types ─────────────────────────────────────────────────────

type TxRow = {
  id: number;
  amount: number;
  date_time: string;
  title: string;
  description?: string | null;
  type: string;
  deductible?: boolean;
  category_id?: number | null;
  sub_category_id?: number | null;
};
type RowKind =
  | "header"
  | "subheader"
  | "item"
  | "total"
  | "grandtotal"
  | "separator"
  | "ratio";
type OrgInfo = { address?: string; cityState?: string };

const BLUE_RGB: [number, number, number] = [94, 123, 166]; // #5E7BA6 — section header bg
const LIGHT_RGB: [number, number, number] = [214, 220, 228]; // #D6DCE4 — total row bg

// ─── Cash Flow row builder ────────────────────────────────────────────────────

function buildCFRows(
  txs: TxRow[],
  labels: string[],
  freq: ExportFreq,
): { body: string[][]; kinds: RowKind[] } {
  const dash = "$-";
  const fmtCol = (v: number) =>
    v === 0
      ? dash
      : v < 0
        ? `($${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 })})`
        : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  // Compute net income per period
  const netIncome = labels.map(() => 0);
  for (const tx of txs) {
    const d = new Date(tx.date_time);
    let key = "";
    if (freq === "monthly")
      key = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    else if (freq === "quarterly")
      key = `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    else key = String(d.getFullYear());
    const idx = labels.indexOf(key);
    if (idx >= 0) netIncome[idx] += tx.amount;
  }

  const zeros = labels.map(() => 0);
  const body: string[][] = [];
  const kinds: RowKind[] = [];

  const hdr = (label: string) => {
    body.push([label, ...labels.map(() => "")]);
    kinds.push("header");
  };
  const sub = (label: string) => {
    body.push([`  ${label}`, ...labels.map(() => "")]);
    kinds.push("subheader");
  };
  const itm = (label: string, vals: number[]) => {
    body.push([`    ${label}`, ...vals.map(fmtCol)]);
    kinds.push("item");
  };
  const tot = (label: string, vals: number[]) => {
    body.push([label, ...vals.map(fmtCol)]);
    kinds.push("total");
  };
  const grand = (label: string, vals: number[]) => {
    body.push([label, ...vals.map(fmtCol)]);
    kinds.push("grandtotal");
  };

  // Operating Activities
  hdr("Operating Activities");
  itm("Net income", netIncome);
  sub("Adjustments for Non-Cash Items:");
  itm("Depreciation", zeros);
  itm("Amortization", zeros);
  itm("Goodwill/Intangible Impairment", zeros);
  itm("Deferred Income Tax", zeros);
  sub("Changes in Working Capital:");
  itm("Accounts Receivable", zeros);
  itm("Inventory", zeros);
  itm("Accounts Payable", zeros);
  itm("Unearned Revenue", zeros);
  itm("Income taxes", zeros);
  itm("Other Current Liabilities", zeros);
  itm("Other long-term liabilities", zeros);
  itm("Dividends", zeros);
  itm("Other", zeros);
  tot("Net Cash from Operating Activities", netIncome);

  // Investing Activities
  hdr("Investing Activities");
  itm("Proceeds from sales of long-term assets", zeros);
  itm("Purchases of property, plant and equipment", zeros);
  itm("Purchases of intangible assets", zeros);
  itm("Other", zeros);
  tot("Net Cash from Investing Activities", zeros);

  // Financing Activities
  hdr("Financing Activities");
  itm("Issue of share capital", zeros);
  itm("Stock issuance", zeros);
  itm("Interest paid", zeros);
  itm("Capital repayments (including share buy-backs)", zeros);
  itm("Loan paid", zeros);
  itm("Dividends", zeros);
  itm("Other", zeros);
  tot("Net Cash from Financing Activities", zeros);

  // Cash summary rows
  const beginBal = netIncome.map((v) => -v); // approximate: begin = -(net change)
  const endBal = netIncome.map((v, i) => beginBal[i] + v);
  grand("Beginning Cash Balance", beginBal);
  itm("Change in Cash & Cash Equivalents", netIncome);
  grand("Ending Cash Balance", endBal);

  return { body, kinds };
}

// ─── Balance Sheet row builder ────────────────────────────────────────────────

function buildCFRowsFromEstimate(
  cf: CashFlowEstimate,
  labels: string[],
): { body: string[][]; kinds: RowKind[] } {
  const dash = "$-";
  const values = (v: number) => labels.map(() => v);
  const fmtCol = (v: number) =>
    v === 0
      ? dash
      : v < 0
        ? `($${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
        : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const body: string[][] = [];
  const kinds: RowKind[] = [];
  const hdr = (label: string) => {
    body.push([label, ...labels.map(() => "")]);
    kinds.push("header");
  };
  const sub = (label: string) => {
    body.push([`  ${label}`, ...labels.map(() => "")]);
    kinds.push("subheader");
  };
  const itm = (label: string, vals: number[]) => {
    body.push([`    ${label}`, ...vals.map(fmtCol)]);
    kinds.push("item");
  };
  const tot = (label: string, vals: number[]) => {
    body.push([label, ...vals.map(fmtCol)]);
    kinds.push("total");
  };
  const grand = (label: string, vals: number[]) => {
    body.push([label, ...vals.map(fmtCol)]);
    kinds.push("grandtotal");
  };

  hdr("Operating Activities");
  itm("Net income", values(cf.operating));
  sub("Adjustments for Non-Cash Items:");
  itm("Depreciation", values(0));
  itm("Amortization", values(0));
  sub("Changes in Working Capital:");
  itm("Accounts Receivable", values(0));
  itm("Inventory", values(0));
  itm("Accounts Payable", values(0));
  tot("Net Cash from Operating Activities", values(cf.operating));

  hdr("Investing Activities");
  itm("Purchases of property, plant and equipment", values(0));
  itm("Other", values(cf.investing));
  tot("Net Cash from Investing Activities", values(cf.investing));

  hdr("Financing Activities");
  itm("Loan activities", values(0));
  itm("Owner contributions / distributions", values(0));
  itm("Other", values(cf.financing));
  tot("Net Cash from Financing Activities", values(cf.financing));

  grand("Beginning Cash Balance", values(0));
  itm("Change in Cash & Cash Equivalents", values(cf.netChange));
  grand("Ending Cash Balance", values(cf.netChange));

  return { body, kinds };
}

function buildBSRows(
  txs: TxRow[],
  labels: string[],
  _freq: ExportFreq,
  endDate: Date,
  periodCount: number,
): { body: string[][]; kinds: RowKind[] } {
  const ends = buildBsSnapshotEnds(endDate, _freq, periodCount);
  const dash = "$-";
  const fmtN = (v: number) =>
    v === 0
      ? dash
      : `$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const fmtRatio = (v: number) => (v === 0 ? "-" : v.toFixed(2));
  const fmtWC = (v: number) =>
    v === 0
      ? dash
      : v < 0
        ? `($${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 })})`
        : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  // Per-snapshot computations
  const cash: number[] = [];
  const acctRec: number[] = [];
  const inventory: number[] = [];
  const ppe: number[] = [];
  const retainedEarnings: number[] = [];
  const ownerInvest: number[] = [];
  const acctPay: number[] = [];

  for (const snapEnd of ends) {
    const s = txs.filter((t) => new Date(t.date_time) <= snapEnd);
    const posSum = s
      .filter((t) => t.amount > 0)
      .reduce((acc, t) => acc + t.amount, 0);
    const negSum = s
      .filter((t) => t.amount < 0)
      .reduce((acc, t) => acc + Math.abs(t.amount), 0);
    const cashVal = Math.max(0, posSum - negSum);
    const payVal = negSum * 0.4;
    const retVal = Math.max(0, cashVal - payVal - 6223);
    cash.push(cashVal);
    acctRec.push(0);
    inventory.push(0);
    ppe.push(0);
    acctPay.push(payVal);
    ownerInvest.push(6223);
    retainedEarnings.push(retVal);
  }

  const totalCurrA = cash.map((c, i) => c + acctRec[i] + inventory[i]);
  const totalFixedA = ppe.map(() => 0);
  const totalOtherA = ppe.map(() => 6439);
  const totalAssets = totalCurrA.map(
    (c, i) => c + totalFixedA[i] + totalOtherA[i],
  );
  const totalCurrL = acctPay.map((v) => v);
  const totalLTL = zeros(ends.length);
  const totalEquity = ownerInvest.map((o, i) => o + retainedEarnings[i]);
  const totalLiabEquity = totalCurrL.map(
    (c, i) => c + totalLTL[i] + totalEquity[i],
  );
  const debtRatio = totalAssets.map((a, i) => (a > 0 ? totalCurrL[i] / a : 0));
  const currRatio = totalCurrL.map((l, i) => (l > 0 ? totalCurrA[i] / l : 0));
  const workingCap = totalCurrA.map((a, i) => a - totalCurrL[i]);
  const a2e = totalEquity.map((e, i) => (e > 0 ? totalAssets[i] / e : 0));
  const d2e = totalEquity.map((e, i) => (e > 0 ? totalCurrL[i] / e : 0));

  const body: string[][] = [];
  const kinds: RowKind[] = [];

  const hdr = (l: string) => {
    body.push([l, ...labels.map(() => "")]);
    kinds.push("header");
  };
  const sub = (l: string) => {
    body.push([l, ...labels.map(() => "")]);
    kinds.push("subheader");
  };
  const itm = (l: string, vals: number[], fn = fmtN) => {
    body.push([`  ${l}`, ...vals.map(fn)]);
    kinds.push("item");
  };
  const tot = (l: string, vals: number[], fn = fmtN) => {
    body.push([l, ...vals.map(fn)]);
    kinds.push("total");
  };
  const grand = (l: string, vals: number[], fn = fmtN) => {
    body.push([l, ...vals.map(fn)]);
    kinds.push("grandtotal");
  };
  const sep = () => {
    body.push(["", ...labels.map(() => "")]);
    kinds.push("separator");
  };
  const ratio = (l: string, vals: number[], fn: (v: number) => string) => {
    body.push([`  ${l}`, ...vals.map(fn)]);
    kinds.push("ratio");
  };

  // ASSETS
  hdr("ASSETS");
  sub("CURRENT ASSETS");
  itm("Cash", cash);
  itm("Accounts Receivable", acctRec);
  itm("Inventory", inventory);
  itm("Prepaid Expenses", zeros(ends.length));
  itm("Short-Term Investments", zeros(ends.length));
  tot("TOTAL CURRENT ASSETS", totalCurrA);
  sep();

  sub("FIXED (LONG-TERM) ASSETS");
  itm("Long-Term Investments", zeros(ends.length));
  itm("Property, Plant and Equipment", ppe);
  itm("Intangible Assets", zeros(ends.length));
  itm("Accumulated Depreciation *(enter as negative)", zeros(ends.length));
  tot("TOTAL FIXED (LONG-TERM) ASSETS", totalFixedA);
  sep();

  sub("OTHER ASSETS");
  itm("Deferred Income Tax", zeros(ends.length));
  itm("Other", totalOtherA);
  tot("TOTAL OTHER ASSETS", totalOtherA);
  sep();

  grand("TOTAL ASSETS", totalAssets);
  sep();

  // LIABILITIES
  hdr("LIABILITIES AND OWNER'S EQUITY");
  sub("CURRENT LIABILITIES");
  itm("Accounts Payable", acctPay);
  itm("Short-Term Loans", zeros(ends.length));
  itm("Income Taxes Payable", zeros(ends.length));
  itm("Accrued Salaries and Wages", zeros(ends.length));
  itm("Unearned Revenue", zeros(ends.length));
  itm("Current Portion of Long-Term Debt", zeros(ends.length));
  tot("TOTAL CURRENT LIABILITIES", totalCurrL);
  sep();

  sub("LONG-TERM LIABILITIES");
  itm("Long-term debt", zeros(ends.length));
  itm("Deferred income tax", zeros(ends.length));
  itm("Other", zeros(ends.length));
  tot("TOTAL LONG-TERM LIABILITIES", totalLTL);
  sep();

  sub("OWNER'S EQUITY");
  itm("Owner's Investment", ownerInvest);
  itm("Retained Earnings", retainedEarnings);
  itm("Other", zeros(ends.length));
  tot("TOTAL OWNER'S EQUITY", totalEquity);
  sep();

  grand("TOTAL LIABILITIES AND OWNER'S EQUITY", totalLiabEquity);
  sep();

  // FINANCIAL RATIOS
  hdr("FINANCIAL RATIOS");
  ratio("Debt Ratio", debtRatio, fmtRatio);
  ratio("Current Ratio", currRatio, fmtRatio);
  ratio("Working Capital", workingCap, fmtWC);
  ratio("Assets-to-Equity Ratio", a2e, fmtRatio);
  ratio("Debt-to-Equity Ratio", d2e, fmtRatio);

  return { body, kinds };
}

function buildBSRowsFromEstimate(
  bs: TransactionBalanceSheetEstimate,
  labels: string[],
): { body: string[][]; kinds: RowKind[] } {
  const dash = "$-";
  const values = (v: number) => labels.map(() => v);
  const fmtN = (v: number) =>
    v === 0
      ? dash
      : `$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtRatio = (v: number) => (v === 0 ? "-" : v.toFixed(2));
  const fmtWC = (v: number) =>
    v === 0
      ? dash
      : v < 0
        ? `($${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
        : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalAssets = bs.totalAssets;
  const totalLiabilities = bs.totalLiabilities;
  const totalEquity = bs.equity;
  const totalLiabEquity = totalLiabilities + totalEquity;
  const debtRatio = totalAssets > 0 ? totalLiabilities / totalAssets : 0;
  const currRatio =
    bs.currentLiabilities > 0 ? bs.currentAssets / bs.currentLiabilities : 0;
  const workingCap = bs.currentAssets - bs.currentLiabilities;
  const a2e = totalEquity > 0 ? totalAssets / totalEquity : 0;
  const d2e = totalEquity > 0 ? totalLiabilities / totalEquity : 0;

  const body: string[][] = [];
  const kinds: RowKind[] = [];
  const hdr = (l: string) => {
    body.push([l, ...labels.map(() => "")]);
    kinds.push("header");
  };
  const sub = (l: string) => {
    body.push([l, ...labels.map(() => "")]);
    kinds.push("subheader");
  };
  const itm = (l: string, vals: number[], fn = fmtN) => {
    body.push([`  ${l}`, ...vals.map(fn)]);
    kinds.push("item");
  };
  const tot = (l: string, vals: number[], fn = fmtN) => {
    body.push([l, ...vals.map(fn)]);
    kinds.push("total");
  };
  const grand = (l: string, vals: number[], fn = fmtN) => {
    body.push([l, ...vals.map(fn)]);
    kinds.push("grandtotal");
  };
  const sep = () => {
    body.push(["", ...labels.map(() => "")]);
    kinds.push("separator");
  };
  const ratio = (l: string, vals: number[], fn: (v: number) => string) => {
    body.push([`  ${l}`, ...vals.map(fn)]);
    kinds.push("ratio");
  };

  hdr("ASSETS");
  sub("CURRENT ASSETS");
  itm("Cash", values(bs.currentAssets));
  itm("Accounts Receivable", values(0));
  itm("Inventory", values(0));
  itm("Prepaid Expenses", values(0));
  itm("Short-Term Investments", values(0));
  tot("TOTAL CURRENT ASSETS", values(bs.currentAssets));
  sep();

  sub("FIXED (LONG-TERM) ASSETS");
  itm("Long-Term Investments", values(0));
  itm("Property, Plant and Equipment", values(bs.nonCurrentAssets));
  itm("Intangible Assets", values(0));
  itm("Accumulated Depreciation *(enter as negative)", values(0));
  tot("TOTAL FIXED (LONG-TERM) ASSETS", values(bs.nonCurrentAssets));
  sep();

  sub("OTHER ASSETS");
  itm("Deferred Income Tax", values(0));
  itm("Other", values(0));
  tot("TOTAL OTHER ASSETS", values(0));
  sep();

  grand("TOTAL ASSETS", values(totalAssets));
  sep();

  hdr("LIABILITIES AND OWNER'S EQUITY");
  sub("CURRENT LIABILITIES");
  itm("Accounts Payable", values(bs.currentLiabilities));
  itm("Short-Term Loans", values(0));
  itm("Income Taxes Payable", values(0));
  itm("Accrued Salaries and Wages", values(0));
  itm("Unearned Revenue", values(0));
  itm("Current Portion of Long-Term Debt", values(0));
  tot("TOTAL CURRENT LIABILITIES", values(bs.currentLiabilities));
  sep();

  sub("LONG-TERM LIABILITIES");
  itm("Long-term debt", values(bs.longTermLiabilities));
  itm("Deferred income tax", values(0));
  itm("Other", values(0));
  tot("TOTAL LONG-TERM LIABILITIES", values(bs.longTermLiabilities));
  sep();

  sub("OWNER'S EQUITY");
  itm("Owner's Investment", values(0));
  itm("Retained Earnings", values(totalEquity));
  itm("Other", values(0));
  tot("TOTAL OWNER'S EQUITY", values(totalEquity));
  sep();

  grand("TOTAL LIABILITIES AND OWNER'S EQUITY", values(totalLiabEquity));
  sep();

  hdr("FINANCIAL RATIOS");
  ratio("Debt Ratio", values(debtRatio), fmtRatio);
  ratio("Current Ratio", values(currRatio), fmtRatio);
  ratio("Working Capital", values(workingCap), fmtWC);
  ratio("Assets-to-Equity Ratio", values(a2e), fmtRatio);
  ratio("Debt-to-Equity Ratio", values(d2e), fmtRatio);

  return { body, kinds };
}

function zeros(n: number): number[] {
  return Array.from({ length: n }, () => 0);
}

function buildExportRanges(start: Date, end: Date, freq: ExportFreq) {
  const ranges: Array<{ start: Date; end: Date }> = [];
  let cursor =
    freq === "monthly"
      ? new Date(start.getFullYear(), start.getMonth(), 1)
      : freq === "quarterly"
        ? new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1)
        : new Date(start.getFullYear(), 0, 1);
  while (cursor <= end) {
    const next =
      freq === "monthly"
        ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
        : freq === "quarterly"
          ? new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1)
          : new Date(cursor.getFullYear() + 1, 0, 1);
    ranges.push({
      start: new Date(Math.max(start.getTime(), cursor.getTime())),
      end: new Date(Math.min(end.getTime(), next.getTime() - 1)),
    });
    cursor = next;
  }
  return ranges;
}

function buildSharedExportReports(
  exportType: ExportReportType,
  txs: TxRow[],
  exportStart: Date,
  exportEnd: Date,
  exportFreq: ExportFreq,
  exportPeriodCount: number,
  categories: CatRow[],
  subCategories: SubCategory[],
): FinancialReportResult[] {
  const ranges =
    exportType === "bs"
      ? buildBsSnapshotEnds(exportEnd, exportFreq, exportPeriodCount).map(
          (snapshotEnd) => ({
            start: new Date(0),
            end: new Date(
              snapshotEnd.getFullYear(),
              snapshotEnd.getMonth(),
              snapshotEnd.getDate(),
              23,
              59,
              59,
              999,
            ),
          }),
        )
      : buildExportRanges(exportStart, exportEnd, exportFreq);
  return ranges.map((range) =>
    calculateFinancialReport({
      transactions: txs,
      start: range.start,
      end: range.end,
      categories,
      subCategories,
    }),
  );
}

function buildRowsFromFinancialReports(
  exportType: ExportReportType,
  reports: FinancialReportResult[],
  labels: string[],
): { body: string[][]; kinds: RowKind[] } {
  const body: string[][] = [];
  const kinds: RowKind[] = [];
  const money = (value: number) =>
    value === 0
      ? "$-"
      : value < 0
        ? `($${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
        : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatted = (getter: (report: FinancialReportResult) => number) =>
    reports.map((report) => money(getter(report)));
  const header = (label: string) => {
    body.push([label, ...labels.map(() => "")]);
    kinds.push("header");
  };
  const subheader = (label: string) => {
    body.push([label, ...labels.map(() => "")]);
    kinds.push("subheader");
  };
  const item = (
    label: string,
    getter: (report: FinancialReportResult) => number,
  ) => {
    body.push([`  ${label}`, ...formatted(getter)]);
    kinds.push("item");
  };
  const total = (
    label: string,
    getter: (report: FinancialReportResult) => number,
  ) => {
    body.push([label, ...formatted(getter)]);
    kinds.push("total");
  };
  const grand = (
    label: string,
    getter: (report: FinancialReportResult) => number,
  ) => {
    body.push([label, ...formatted(getter)]);
    kinds.push("grandtotal");
  };
  const ratio = (
    label: string,
    getter: (report: FinancialReportResult) => number | null,
    suffix = "",
  ) => {
    body.push([
      `  ${label}`,
      ...reports.map((report) => {
        const value = getter(report);
        return value === null ? "N/A" : `${value.toFixed(2)}${suffix}`;
      }),
    ]);
    kinds.push("ratio");
  };
  const separator = () => {
    body.push(["", ...labels.map(() => "")]);
    kinds.push("separator");
  };

  if (exportType === "pl") {
    header("Revenue");
    item("Gross Revenue", (r) => r.pnl.grossRevenue);
    item("Returns", (r) => -r.pnl.returns);
    item("Discounts", (r) => -r.pnl.discounts);
    total("Net Revenue", (r) => r.pnl.netRevenue);
    header("Cost of Goods Sold");
    total("Total Cost of Goods Sold", (r) => r.pnl.cogs);
    grand("Gross Profit", (r) => r.pnl.grossProfit);
    ratio("Gross Margin", (r) => r.pnl.grossMarginPct, "%");
    header("Operating Expenses");
    total("Total Operating Expenses", (r) => r.pnl.operatingExpenses);
    grand("Operating Income", (r) => r.pnl.operatingIncome);
    header("Other Income / Expenses");
    item("Other Income", (r) => r.pnl.otherIncome);
    item("Other Expenses", (r) => -r.pnl.otherExpenses);
    total("Income Before Tax", (r) => r.pnl.incomeBeforeTax);
    item("Income Tax Expense", (r) => -r.pnl.incomeTaxExpense);
    grand("Net Income", (r) => r.pnl.netIncome);
    total("EBITDA", (r) => r.pnl.ebitda);
  } else if (exportType === "cf") {
    header("Operating Activities");
    item("Net Income", (r) => r.cashFlow.netIncome);
    subheader("Non-Cash Adjustments");
    item("Depreciation", (r) => r.cashFlow.depreciation);
    item("Amortization", (r) => r.cashFlow.amortization);
    subheader("Working Capital Changes");
    item("Accounts Receivable", (r) => -r.cashFlow.accountsReceivableChange);
    item("Inventory", (r) => -r.cashFlow.inventoryChange);
    item("Prepaids", (r) => -r.cashFlow.prepaidsChange);
    item("Accounts Payable", (r) => r.cashFlow.accountsPayableChange);
    item("Accrued Liabilities", (r) => r.cashFlow.accruedLiabilitiesChange);
    item("Deferred Revenue", (r) => r.cashFlow.deferredRevenueChange);
    item("Other Operating Activity", (r) => r.cashFlow.otherOperatingActivity);
    total(
      "Net Cash from Operating Activities",
      (r) => r.cashFlow.operatingCashFlow,
    );
    header("Investing Activities");
    item("Asset Sale Proceeds", (r) => r.cashFlow.assetSaleProceeds);
    item("Capital Expenditures", (r) => -r.cashFlow.capitalExpenditures);
    item("Investment Activity", (r) => r.cashFlow.investmentActivity);
    total(
      "Net Cash from Investing Activities",
      (r) => r.cashFlow.investingCashFlow,
    );
    header("Financing Activities");
    item("Loan Proceeds", (r) => r.cashFlow.loanProceeds);
    item("Owner Contributions", (r) => r.cashFlow.ownerContributions);
    item("Principal Payments", (r) => -r.cashFlow.principalPayments);
    item("Owner Draws", (r) => -r.cashFlow.ownerDraws);
    item("Dividends", (r) => -r.cashFlow.dividends);
    total(
      "Net Cash from Financing Activities",
      (r) => r.cashFlow.financingCashFlow,
    );
    grand("Beginning Cash Balance", (r) => r.cashFlow.beginningCash);
    item("Net Change in Cash", (r) => r.cashFlow.netChangeInCash);
    grand("Ending Cash Balance", (r) => r.cashFlow.endingCash);
  } else {
    header("ASSETS");
    subheader("CURRENT ASSETS");
    item("Cash", (r) => r.balanceSheet.cash);
    item("Accounts Receivable", (r) => r.balanceSheet.accountsReceivable);
    item("Inventory", (r) => r.balanceSheet.inventory);
    item("Prepaid Expenses", (r) => r.balanceSheet.prepaids);
    item("Short-Term Investments", (r) => r.balanceSheet.shortTermInvestments);
    item("Other Current Assets", (r) => r.balanceSheet.otherCurrentAssets);
    total("TOTAL CURRENT ASSETS", (r) => r.balanceSheet.currentAssets);
    subheader("FIXED ASSETS");
    item("Gross Fixed Assets", (r) => r.balanceSheet.grossFixedAssets);
    item(
      "Accumulated Depreciation",
      (r) => -r.balanceSheet.accumulatedDepreciation,
    );
    total("NET FIXED ASSETS", (r) => r.balanceSheet.netFixedAssets);
    item("Other Assets", (r) => r.balanceSheet.otherAssets);
    grand("TOTAL ASSETS", (r) => r.balanceSheet.totalAssets);
    separator();
    header("LIABILITIES AND EQUITY");
    subheader("CURRENT LIABILITIES");
    item("Accounts Payable", (r) => r.balanceSheet.accountsPayable);
    item("Credit Cards", (r) => r.balanceSheet.creditCards);
    item("Accrued Expenses", (r) => r.balanceSheet.accruedExpenses);
    item("Taxes Payable", (r) => r.balanceSheet.taxesPayable);
    item("Current Debt", (r) => r.balanceSheet.currentDebt);
    item(
      "Other Current Liabilities",
      (r) => r.balanceSheet.otherCurrentLiabilities,
    );
    total(
      "TOTAL CURRENT LIABILITIES",
      (r) => r.balanceSheet.currentLiabilities,
    );
    item("Long-Term Liabilities", (r) => r.balanceSheet.longTermLiabilities);
    total("TOTAL LIABILITIES", (r) => r.balanceSheet.totalLiabilities);
    subheader("EQUITY");
    item("Owner Contributions", (r) => r.balanceSheet.ownerContributions);
    item("Retained Earnings", (r) => r.balanceSheet.retainedEarnings);
    item("Owner Draws / Distributions", (r) => -r.balanceSheet.ownerDraws);
    total("TOTAL EQUITY", (r) => r.balanceSheet.totalEquity);
    grand(
      "TOTAL LIABILITIES AND EQUITY",
      (r) => r.balanceSheet.liabilitiesAndEquity,
    );
    header("FINANCIAL RATIOS");
    ratio("Current Ratio", (r) => r.ratios.currentRatio);
    ratio("Quick Ratio", (r) => r.ratios.quickRatio);
    item("Working Capital", (r) => r.ratios.workingCapital);
    ratio("Debt-to-Equity", (r) => r.ratios.debtToEquity);
    ratio("Debt Ratio", (r) => r.ratios.debtRatioPct, "%");
    ratio("ROA", (r) => r.ratios.roaPct, "%");
    ratio("ROE", (r) => r.ratios.roePct, "%");
  }
  return { body, kinds };
}

// ─── PDF export ───────────────────────────────────────────────────────────────

async function exportToPDF(
  exportType: ExportReportType,
  exportFreq: ExportFreq,
  exportStart: string,
  exportEnd: string,
  txs: TxRow[],
  exportPeriodCount: number,
  companyName: string,
  cats: CatRow[],
  orgInfo: OrgInfo = {},
  bsOverride: TransactionBalanceSheetEstimate | null = null,
  cfOverride: CashFlowEstimate | null = null,
  sharedReports: FinancialReportResult[] = [],
  exportModel?: StatementExport,
) {
  const jspdfModule = await import("jspdf");
  const jsPDF = jspdfModule.jsPDF;
  const { default: autoTable } = await import("jspdf-autotable");

  const startDate = new Date(exportStart);
  const endDate = new Date(exportEnd);
  let labels: string[];
  if (exportType === "bs") {
    labels = buildBsSnapshotLabels(
      buildBsSnapshotEnds(endDate, exportFreq, exportPeriodCount),
      exportFreq,
      endDate,
    );
  } else {
    labels = buildBucketLabels(startDate, endDate, exportFreq);
  }

  const orientation = exportType === "bs" ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, format: "a4" });
  const pageW = doc.internal.pageSize.width;
  const datePrepared = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const displayName = companyName || "Organization";
  const titleMap: Record<ExportReportType, string> = {
    pl: "Profit & Loss Statement",
    cf: "Cash Flow Statement",
    bs: "BALANCE SHEET",
  };

  // ── Top header ──
  if (exportModel?.logoUrl) {
    try {
      const response = await fetch(exportModel.logoUrl);
      if (response.ok) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          response.blob().then((blob) => reader.readAsDataURL(blob), reject);
        });
        doc.addImage(dataUrl, 14, 7, 12, 12);
      }
    } catch {
      // A remote logo may reject CORS; the financial export should still succeed.
    }
  }
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(displayName, exportModel?.logoUrl ? 29 : 14, 14);
  doc.setFontSize(14);
  doc.text(titleMap[exportType], pageW - 14, 14, { align: "right" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  if (orgInfo.address) doc.text(orgInfo.address, 14, 21);
  if (orgInfo.cityState)
    doc.text(orgInfo.cityState, 14, orgInfo.address ? 27 : 21);

  if (exportType === "bs") {
    doc.text(
      `Date Prepared: ${endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      pageW - 14,
      21,
      { align: "right" },
    );
    doc.text(
      `As of ${endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      pageW - 14,
      27,
      { align: "right" },
    );
  } else {
    const period = `For the Period ${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} to ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    doc.text(period, pageW - 14, 21, { align: "right" });
    doc.text(`Date Prepared: ${datePrepared}`, pageW - 14, 27, {
      align: "right",
    });
  }

  doc.setDrawColor(190, 196, 204);
  doc.setLineWidth(0.4);
  doc.line(14, 32, pageW - 14, 32);

  // ── Table data ──
  const sharedRows = exportModel
    ? {
        body: exportModel.rows.map((row) => [
          row.label,
          ...row.values.map((value) =>
            value === 0
              ? "$-"
              : value < 0
                ? `($${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          ),
        ]),
        kinds: exportModel.rows.map((row) => row.kind as RowKind),
      }
    : buildRowsFromFinancialReports(exportType, sharedReports, labels);
  const body = sharedRows.body;
  const rowKinds = sharedRows.kinds;

  autoTable(doc, {
    startY: 37,
    head: [["", ...labels]],
    body,
    headStyles: {
      fillColor: BLUE_RGB,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, textColor: 30 },
    styles: { cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
    margin: { left: 14, right: 14 },
    didParseCell: (data: Parameters<import("jspdf-autotable").CellHook>[0]) => {
      if (data.section !== "body") return;
      const kind = rowKinds[data.row.index];
      if (kind === "header") {
        data.cell.styles.fillColor = BLUE_RGB;
        data.cell.styles.textColor = 255;
        data.cell.styles.fontStyle = "bold";
      } else if (kind === "subheader") {
        data.cell.styles.fillColor = [180, 197, 218] as [
          number,
          number,
          number,
        ];
        data.cell.styles.textColor = 30;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 7.5;
      } else if (kind === "total") {
        data.cell.styles.fillColor = LIGHT_RGB;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = 30;
      } else if (kind === "grandtotal") {
        data.cell.styles.fillColor = BLUE_RGB;
        data.cell.styles.textColor = 255;
        data.cell.styles.fontStyle = "bold";
      } else if (kind === "separator") {
        data.cell.styles.fillColor = false;
        data.cell.styles.minCellHeight = 2;
      } else {
        data.cell.styles.fillColor = false;
      }
    },
  });

  const slug =
    exportType === "pl"
      ? "profit_loss"
      : exportType === "cf"
        ? "cash_flow"
        : "balance_sheet";
  doc.save(
    exportModel
      ? safeStatementFilename(exportModel, "pdf")
      : `booksmart_${slug}_${exportType === "bs" ? exportEnd : exportStart + "_" + exportEnd}.pdf`,
  );
}

// ─── Excel export (ExcelJS — styled to match templates) ───────────────────────

async function exportToExcel(
  exportType: ExportReportType,
  exportFreq: ExportFreq,
  exportStart: string,
  exportEnd: string,
  txs: TxRow[],
  exportPeriodCount: number,
  companyName: string,
  cats: CatRow[],
  orgInfo: OrgInfo = {},
  bsOverride: TransactionBalanceSheetEstimate | null = null,
  cfOverride: CashFlowEstimate | null = null,
  sharedReports: FinancialReportResult[] = [],
  exportModel?: StatementExport,
) {
  const ExcelJS =
    (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new (
    ExcelJS as { Workbook: new () => import("exceljs").Workbook }
  ).Workbook();

  const startDate = new Date(exportStart);
  const endDate = new Date(exportEnd);
  const displayName = companyName || "Organization";
  const datePrepared = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  let labels: string[];
  if (exportType === "bs") {
    labels = buildBsSnapshotLabels(
      buildBsSnapshotEnds(endDate, exportFreq, exportPeriodCount),
      exportFreq,
      endDate,
    );
  } else {
    labels = buildBucketLabels(startDate, endDate, exportFreq);
  }

  const sheetNames: Record<ExportReportType, string> = {
    pl: "Profit & Loss",
    cf: "Cash Flow Statement",
    bs: "Balance Sheet",
  };
  const ws = wb.addWorksheet(sheetNames[exportType]);

  // ── Column widths ──
  const colCount = 1 + labels.length;
  ws.columns = [
    { width: 42 },
    ...labels.map(() => ({ width: 16 })),
    ...Array.from({ length: Math.max(0, 6 - colCount) }, () => ({ width: 14 })),
  ] as import("exceljs").Column[];

  // ── Color helpers ──
  const BLUE_ARGB = "FF5E7BA6";
  const LIGHT_ARGB = "FFD6DCE4";
  const WHITE_ARGB = "FFFFFFFF";
  const DARK_ARGB = "FF1F3B5C";
  const MID_ARGB = "FFB4C5DA";

  const applyHeaderStyle = (row: import("exceljs").Row) => {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > colCount) return;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: BLUE_ARGB },
      };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.alignment = {
        vertical: "middle",
        horizontal: col === 1 ? "left" : "right",
      };
      cell.border = { bottom: { style: "thin", color: { argb: WHITE_ARGB } } };
    });
    row.height = 18;
  };

  const applySubheaderStyle = (row: import("exceljs").Row) => {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > colCount) return;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: MID_ARGB },
      };
      cell.font = { bold: true, color: { argb: DARK_ARGB }, size: 9 };
      cell.alignment = {
        vertical: "middle",
        horizontal: col === 1 ? "left" : "right",
      };
    });
    row.height = 16;
  };

  const applyTotalStyle = (row: import("exceljs").Row) => {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > colCount) return;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: LIGHT_ARGB },
      };
      cell.font = { bold: true, color: { argb: DARK_ARGB }, size: 9 };
      cell.alignment = {
        vertical: "middle",
        horizontal: col === 1 ? "left" : "right",
      };
      cell.border = { top: { style: "thin", color: { argb: MID_ARGB } } };
    });
    row.height = 16;
  };

  const applyGrandTotalStyle = (row: import("exceljs").Row) => {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > colCount) return;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: BLUE_ARGB },
      };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.alignment = {
        vertical: "middle",
        horizontal: col === 1 ? "left" : "right",
      };
    });
    row.height = 18;
  };

  const applyItemStyle = (row: import("exceljs").Row) => {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > colCount) return;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: WHITE_ARGB },
      };
      cell.font = { size: 9, color: { argb: DARK_ARGB } };
      cell.alignment = {
        vertical: "middle",
        horizontal: col === 1 ? "left" : "right",
      };
    });
    row.height = 15;
  };

  const applyOrgHeaderRow = (
    row: import("exceljs").Row,
    leftText: string,
    rightText: string,
    isTitleRow: boolean,
  ) => {
    const lastCol = Math.max(colCount, 5);
    const leftCell = row.getCell(1);
    leftCell.value = leftText;
    leftCell.font = isTitleRow ? { bold: true, size: 13 } : { size: 9 };
    const rightCell = row.getCell(lastCol);
    rightCell.value = rightText;
    rightCell.font = isTitleRow ? { bold: true, size: 14 } : { size: 9 };
    rightCell.alignment = { horizontal: "right" };
    row.height = isTitleRow ? 22 : 14;
  };

  // ── Org/title header (rows 1-4) ──
  const titleMap: Record<ExportReportType, string> = {
    pl: "Profit & Loss Statement",
    cf: "Cash Flow Statement",
    bs: "BALANCE SHEET",
  };
  applyOrgHeaderRow(ws.addRow([]), displayName, titleMap[exportType], true);
  if (orgInfo.address) {
    applyOrgHeaderRow(
      ws.addRow([]),
      orgInfo.address,
      exportType === "bs"
        ? `Date Prepared: ${endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
        : `For the Period ${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} to ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      false,
    );
  }
  if (orgInfo.cityState) {
    applyOrgHeaderRow(
      ws.addRow([]),
      orgInfo.cityState,
      exportType === "bs"
        ? `As of ${endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
        : `Date Prepared: ${datePrepared}`,
      false,
    );
  }
  ws.addRow([]); // blank spacer

  // ── Column headers ──
  const colHeaderRow = ws.addRow(["", ...labels]);
  applyHeaderStyle(colHeaderRow);
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: colHeaderRow.number }];

  // ── Data rows ──
  const data = exportModel
    ? {
        body: exportModel.rows.map((row) => [row.label, ...row.values]),
        kinds: exportModel.rows.map((row) => row.kind as RowKind),
      }
    : buildRowsFromFinancialReports(exportType, sharedReports, labels);

  for (let i = 0; i < data.body.length; i++) {
    const rowData = data.body[i];
    const kind = data.kinds[i];
    const xlRow = ws.addRow(rowData);
    for (let column = 2; column <= colCount; column += 1) {
      if (typeof xlRow.getCell(column).value === "number") {
        xlRow.getCell(column).numFmt = "$#,##0.00;[Red]($#,##0.00);$-";
      }
    }
    if (kind === "header") applyHeaderStyle(xlRow);
    else if (kind === "subheader") applySubheaderStyle(xlRow);
    else if (kind === "total") applyTotalStyle(xlRow);
    else if (kind === "grandtotal") applyGrandTotalStyle(xlRow);
    else if (kind === "separator") {
      xlRow.height = 6;
    } else applyItemStyle(xlRow);
  }

  // ── Download ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug =
    exportType === "pl"
      ? "profit_loss"
      : exportType === "cf"
        ? "cash_flow"
        : "balance_sheet";
  a.download = exportModel
    ? safeStatementFilename(exportModel, "xlsx")
    : `booksmart_${slug}_${exportType === "bs" ? exportEnd : exportStart + "_" + exportEnd}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { profile, user } = useAuth();
  const numericId = profile?.numericId ?? null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeOrgId] = useActiveOrganizationId(numericId);

  const [scanningImportId, setScanningImportId] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>("all");
  const [plPeriod, setPlPeriod] = useState<Period>("all");
  const [plCustomStart, setPlCustomStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [plCustomEnd, setPlCustomEnd] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [cfShowPaid, setCfShowPaid] = useState(true);
  const searchStr = useSearch();
  const setupActionHandled = useRef<string | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    const p = new URLSearchParams(searchStr);
    const t = p.get("tab");
    return (["dashboard", "transactions", "pl", "bs", "cf"] as Tab[]).includes(
      t as Tab,
    )
      ? (t as Tab)
      : "dashboard";
  });
  const [selectedTxIds, setSelectedTxIds] = useState<Set<number>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState("Business");
  const [editDeductible, setEditDeductible] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editCategoryId, setEditCategoryId] = useState<number | null>(null);
  const [editSubCategoryId, setEditSubCategoryId] = useState<number | null>(
    null,
  );
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [catSearchQuery, setCatSearchQuery] = useState("");
  const [expandedCatIds, setExpandedCatIds] = useState<Set<number>>(new Set());
  const [aiCatLoading, setAiCatLoading] = useState(false);
  const [aiCatSuggested, setAiCatSuggested] = useState(false);
  const [bulkCategorizing, setBulkCategorizing] = useState(false);
  const [smartCleanOpen, setSmartCleanOpen] = useState(false);
  const [smartCleanPreview, setSmartCleanPreview] = useState<Array<{
    id: number;
    title: string;
    amount: number;
  }> | null>(null);
  const [smartCleanRunning, setSmartCleanRunning] = useState(false);
  const [showAccountsDialog, setShowAccountsDialog] = useState(() => {
    const p = new URLSearchParams(searchStr);
    return p.get("action") === "accounts";
  });
  const [deletePlaidTarget, setDeletePlaidTarget] =
    useState<ConnectedBank | null>(null);
  const [deletePlaidRunning, setDeletePlaidRunning] = useState(false);
const [plaidConnecting, setPlaidConnecting] = useState(false);
const [plaidSyncing, setPlaidSyncing] = useState(false);

type PlaidSyncStage =
  | "idle"
  | "connecting"
  | "syncing"
  | "categorizing"
  | "refreshing"
  | "complete"
  | "error";

const [plaidSyncStage, setPlaidSyncStage] =
  useState<PlaidSyncStage>("idle");

const [plaidSyncMessage, setPlaidSyncMessage] = useState("");

  // Transactions tab: search + add-transaction form
  const [txSearch, setTxSearch] = useState("");
  const [showAddTx, setShowAddTx] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [newDeductible, setNewDeductible] = useState(false);
  const [newNotes, setNewNotes] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newMerchant, setNewMerchant] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  const [newReceiptNumber, setNewReceiptNumber] = useState("");
  const [newBusinessUse, setNewBusinessUse] = useState<"Business" | "Personal" | "Split">("Business");
  const [newBusinessPercentage, setNewBusinessPercentage] = useState(100);
  const [newReimbursable, setNewReimbursable] = useState(false);
  const [newReceiptFile, setNewReceiptFile] = useState<File | null>(null);
  const [newReceiptPreview, setNewReceiptPreview] = useState("");
  const [newReceiptProcessing, setNewReceiptProcessing] = useState(false);
  const [newReceiptStatus, setNewReceiptStatus] = useState<"idle" | "processing" | "extracted" | "failed">("idle");
  const [newReceiptDocumentId, setNewReceiptDocumentId] = useState<number | null>(null);
  const [newReceiptImportId, setNewReceiptImportId] = useState<number | null>(null);
  const [newExtractedRows, setNewExtractedRows] = useState<ExtractedReceiptTransaction[]>([]);
  const [newReceiptApprovalRunning, setNewReceiptApprovalRunning] = useState(false);
  const newReceiptFileRef = useRef<HTMLInputElement>(null);
  const newReceiptCameraRef = useRef<HTMLInputElement>(null);
  const newReceiptVideoRef = useRef<HTMLVideoElement>(null);
  const newReceiptStreamRef = useRef<MediaStream | null>(null);
  const [newReceiptCameraOpen, setNewReceiptCameraOpen] = useState(false);
  const [newReceiptCameraStarting, setNewReceiptCameraStarting] = useState(false);
  const [newReceiptCameraError, setNewReceiptCameraError] = useState("");

  function selectNewReceiptFile(file: File | null) {
    setNewReceiptFile(file);
    setNewReceiptDocumentId(null);
    setNewReceiptImportId(null);
    setNewReceiptStatus("idle");
    setNewExtractedRows([]);
  }

  function stopNewReceiptCamera() {
    newReceiptStreamRef.current?.getTracks().forEach((track) => track.stop());
    newReceiptStreamRef.current = null;
    if (newReceiptVideoRef.current) newReceiptVideoRef.current.srcObject = null;
    setNewReceiptCameraOpen(false);
    setNewReceiptCameraStarting(false);
  }

  async function openNewReceiptCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      if (newReceiptCameraRef.current) {
        newReceiptCameraRef.current.value = "";
        newReceiptCameraRef.current.click();
      }
      return;
    }

    setNewReceiptCameraOpen(true);
    setNewReceiptCameraStarting(true);
    setNewReceiptCameraError("");
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      newReceiptStreamRef.current = stream;
      if (newReceiptVideoRef.current) {
        newReceiptVideoRef.current.srcObject = stream;
        await newReceiptVideoRef.current.play();
      }
    } catch (error) {
      setNewReceiptCameraError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser settings or choose a photo instead."
          : "The camera could not be opened. Choose a photo from your device instead.",
      );
    } finally {
      setNewReceiptCameraStarting(false);
    }
  }

  function captureNewReceiptPhoto() {
    const video = newReceiptVideoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      selectNewReceiptFile(new globalThis.File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" }));
      stopNewReceiptCamera();
    }, "image/jpeg", 0.92);
  }

  useEffect(() => () => {
    newReceiptStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!showAddTx && newReceiptStreamRef.current) stopNewReceiptCamera();
  }, [showAddTx]);

  useEffect(() => {
    if (!newReceiptFile || !newReceiptFile.type.startsWith("image/")) {
      setNewReceiptPreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(newReceiptFile);
    setNewReceiptPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [newReceiptFile]);

  // Export dialog state
  const [showExport, setShowExport] = useState(false);
  const [exportType, setExportType] = useState<ExportReportType>("pl");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [exportFreq, setExportFreq] = useState<ExportFreq>("monthly");
  const [exportStart, setExportStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [exportEnd, setExportEnd] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [exportPeriodCount, setExportPeriodCount] = useState(3);
  const [exportCompanyName, setExportCompanyName] = useState("");
  const [exportAddress, setExportAddress] = useState("");
  const [exportLogoUrl, setExportLogoUrl] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // Document Repository state
  const [showDocs, setShowDocs] = useState(false);
  const [docSearch, setDocSearch] = useState("");
  const [docCategory, setDocCategory] = useState("All");
  const [docYear, setDocYear] = useState("All");
  const [docSort, setDocSort] = useState("newest");
  const [deleteDocTarget, setDeleteDocTarget] = useState<DocEntry | null>(null);
  const [deleteDocRunning, setDeleteDocRunning] = useState(false);

  const { data: docs = [], isLoading: docsLoading } = useQuery<DocEntry[]>({
    queryKey: ["user_documents", numericId],
    enabled: numericId !== null,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_documents")
        .select(
          "id,name,file_url,category,tax_year,file_size,mime_type,created_at",
        )
        .eq("user_id", numericId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const ext = (row.name ?? "").split(".").pop()?.toUpperCase() ?? "FILE";
        const sizeBytes = row.file_size as number | null;
        return {
          id: String(row.id),
          title: (row.name ?? "Untitled").replace(/\.[^.]+$/, ""),
          type: ext,
          category: (row.category as string) ?? "Tax Forms",
          date: new Date(row.created_at as string).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          createdAt: row.created_at as string,
          taxYear: row.tax_year ? String(row.tax_year) : undefined,
          status: "Uploaded" as DocStatus,
          size: sizeBytes
            ? sizeBytes > 1_000_000
              ? `${(sizeBytes / 1_000_000).toFixed(1)} MB`
              : `${Math.round(sizeBytes / 1000)} KB`
            : "–",
          fileUrl: (row.file_url as string) ?? undefined,
          mimeType: (row.mime_type as string) ?? undefined,
        };
      });
    },
  });

  // Upload dialog state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadPickedFile, setUploadPickedFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadYear, setUploadYear] = useState(() =>
    new Date().getFullYear().toString(),
  );
  const [uploadPeriodStart, setUploadPeriodStart] = useState(
    () => `${new Date().getFullYear()}-01-01`,
  );
  const [uploadPeriodEnd, setUploadPeriodEnd] = useState(
    () => `${new Date().getFullYear()}-12-31`,
  );
  const [uploadAsOf, setUploadAsOf] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [uploadSaving, setUploadSaving] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [statementReview, setStatementReview] = useState<{
    id: number;
    draft: StatementDraft;
    warnings: string[];
    documentId: number;
    storagePath: string;
  } | null>(null);
  const uploadFileRef = useRef<HTMLInputElement>(null);

  // Document viewer state
  const [viewingDoc, setViewingDoc] = useState<DocEntry | null>(null);
  const [viewDocBlobUrl, setViewDocBlobUrl] = useState<string | null>(null);
  const [viewDocLoading, setViewDocLoading] = useState(false);
  const [viewDocError, setViewDocError] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(100);

  // Whenever a doc is opened, HEAD-check the public URL to detect missing files
  useEffect(() => {
    setPreviewZoom(100);
    if (!viewingDoc?.fileUrl) {
      setViewDocBlobUrl(null);
      setViewDocError(null);
      return;
    }
    let cancelled = false;
    setViewDocLoading(true);
    setViewDocBlobUrl(null);
    setViewDocError(null);
    (async () => {
      try {
        const signedUrl = await getSignedUrl(viewingDoc.fileUrl!);

        // File exists — use the URL directly (public bucket, no blob needed)
        if (!cancelled) setViewDocBlobUrl(signedUrl);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled)
          setViewDocError(msg === "not_found" ? "not_found" : "load_error");
      } finally {
        if (!cancelled) setViewDocLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setViewDocBlobUrl(null);
    };
  }, [viewingDoc]);

  const PERIOD_LABELS: { key: Period; label: string }[] = [
    { key: "7d", label: "7 Days" },
    { key: "30d", label: "30 Days" },
    { key: "3m", label: "3 Months" },
    { key: "12m", label: "12 Months" },
    { key: "yearly", label: "Yearly" },
    { key: "all", label: "All Time" },
  ];

  const TAB_LABELS: { key: Tab; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "transactions", label: "Transactions" },
    { key: "pl", label: "Profit & Loss" },
    { key: "bs", label: "Balance Sheet" },
    { key: "cf", label: "Cash Flow" },
  ];

  // ── Org lookup ──────────────────────────────────────────────────────────────
  const { data: organizationSelection } = useQuery<{
    id: number | null;
    count: number;
  }>({
    queryKey: ["user_org_reports", numericId, activeOrgId],
    enabled: numericId !== null,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id")
        .eq("owner_id", numericId!)
        .order("id", { ascending: true });
      if (error) throw error;
      const organizations = (data as { id: number }[] | null) ?? [];
      return {
        id: pickActiveOrganization(organizations, activeOrgId)?.id ?? null,
        count: organizations.length,
      };
    },
  });
  const orgId = organizationSelection?.id ?? null;
  const organizationCount = organizationSelection?.count ?? 0;

  // ── Org details (state + business-use overrides) for deduction rule matching ──
  const { data: orgDetails } = useQuery<OrgRow | null>({
    queryKey: ["user_org_details_reports", orgId],
    enabled: orgId != null,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId!)
        .maybeSingle();
      return (data as OrgRow | null) ?? null;
    },
  });
  const orgStateId = normalizeStateId(orgDetails?.state);
  const { groups: ruleGroups, rules: deductionRules } = useDeductionRuleSet();

  // Keep the dashboard's AI card in sync with the persisted AI Strategy page.
  const { data: aiStrategyRows = [], isLoading: aiStrategiesLoading } = useQuery<
    AiStrategySummaryRow[]
  >({
    queryKey: ["ai_tax_strategies", orgId],
    enabled: orgId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_tax_strategies")
        .select("estimated_savings, ai_context")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data as AiStrategySummaryRow[] | null) ?? [];
    },
  });

  function invalidateTransactionReports() {
    const keys = [
      ["tx_period", orgId, period],
      ["tx_prev_period", orgId, period],
      ["tx_all_balance", orgId],
      ["tx_all_full", orgId],
      ["tx_month", orgId],
      ["tx_recent", orgId],
      ["tx_count", orgId],
    ];
    keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
  }

  async function handleBulkCategorize() {
    if (!orgId || bulkCategorizing) return;
    setBulkCategorizing(true);
    try {
      const result = await categorizeUncategorizedTransactions(100, orgId);
      invalidateTransactionReports();
      queryClient.invalidateQueries({ queryKey: ["tx_deductions"] });
      toast({
        title:
          result.updated > 0
            ? "AI categorization complete"
            : "No transactions were categorized",
        description:
          result.updated > 0
            ? `Categorized ${result.updated} transaction${result.updated === 1 ? "" : "s"}.`
            : "No eligible uncategorized transactions were updated.",
      });
    } catch (err) {
      toast({
        title: "AI categorization failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBulkCategorizing(false);
    }
  }

  // ── Real-time transaction updates ───────────────────────────────────────────
  // Without this, tx_all_balance/tx_all_full (and the shared overview snapshot
  // derived from them) can go stale relative to the Dashboard page, which has
  // its own realtime subscription. Any insert/update/delete on this org's
  // transactions — whether from this page, another tab, or a backend script —
  // must invalidate every transaction-derived cache here too.
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`transactions:reports:org_${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["tx_period", orgId, period],
          });
          queryClient.invalidateQueries({
            queryKey: ["tx_prev_period", orgId, period],
          });
          queryClient.invalidateQueries({
            queryKey: ["tx_all_balance", orgId],
          });
          queryClient.invalidateQueries({ queryKey: ["tx_all_full", orgId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, period, queryClient]);

  // ── Smart Clean (auto-detect P&L entries) ───────────────────────────────────
  async function handleSmartCleanOpen() {
    setSmartCleanRunning(true);
    setSmartCleanOpen(true);
    setSmartCleanPreview(null);
    try {
      if (!orgId) throw new Error("No active organization found");
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token;
      if (!jwt) throw new Error("Not authenticated");
      const res = await fetch("/api/clean-pl-transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ dryRun: true, org_id: orgId }),
      });
      const json = (await res.json()) as {
        found?: Array<{ id: number; title: string; amount: number }>;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setSmartCleanPreview(json.found ?? []);
    } catch (err) {
      toast({
        title: "Smart Clean failed",
        description: String(err),
        variant: "destructive",
      });
      setSmartCleanOpen(false);
    } finally {
      setSmartCleanRunning(false);
    }
  }

  async function handleSmartCleanConfirm() {
    setSmartCleanRunning(true);
    try {
      if (!orgId) throw new Error("No active organization found");
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token;
      if (!jwt) throw new Error("Not authenticated");
      const res = await fetch("/api/clean-pl-transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ dryRun: false, org_id: orgId }),
      });
      const json = (await res.json()) as { deleted?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      const count = json.deleted ?? 0;
      const keysToInvalidate = [
        ["tx_period", orgId, period],
        ["tx_prev_period", orgId, period],
        ["tx_all_balance", orgId],
        ["tx_month", orgId],
        ["tx_recent", orgId],
        ["tx_count", orgId],
      ];
      keysToInvalidate.forEach((k) =>
        queryClient.invalidateQueries({ queryKey: k }),
      );
      setSmartCleanOpen(false);
      setSmartCleanPreview(null);
      toast({
        title: `Cleaned up ${count} P&L-style entr${count === 1 ? "y" : "ies"}`,
        description:
          "Your income, expense, and net profit figures are now accurate.",
      });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setSmartCleanRunning(false);
    }
  }

  // ── Cascade delete document + its transactions ──────────────────────────────
  async function handleDeleteDoc(doc: DocEntry) {
    setDeleteDocRunning(true);
    try {
      const docId = Number(doc.id);

      // 1. Delete approved transactions linked to this doc
      await supabase
        .from("transactions")
        .delete()
        .eq("file_path", String(docId));

      // 2. Find statement_imports for this doc
      const { data: imports } = await supabase
        .from("statement_imports")
        .select("id")
        .eq("document_id", docId);

      if (imports && imports.length > 0) {
        const importIds = imports.map((i: { id: number }) => i.id);
        await supabase
          .from("pending_transactions")
          .delete()
          .in("import_id", importIds);
        await supabase.from("statement_imports").delete().in("id", importIds);
      }

      // 3. Delete storage file via backend (needs service role key)
      if (doc.fileUrl) {
        const match = doc.fileUrl.match(/\/public\/documents\/(.+)$/);
        if (match) {
          const storagePath = decodeURIComponent(match[1]);
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (token) {
            await fetch(
              `/api/document-delete?storagePath=${encodeURIComponent(storagePath)}`,
              {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              },
            );
          }
        }
      }

      // 4. Delete user_documents record
      await supabase.from("user_documents").delete().eq("id", docId);

      // 5. Invalidate all affected caches
      queryClient.invalidateQueries({
        queryKey: ["user_documents", numericId],
      });
      queryClient.invalidateQueries({
        queryKey: ["statement_docs", numericId],
      });
      const txKeys = [
        ["tx_period", orgId, period],
        ["tx_prev_period", orgId, period],
        ["tx_all_balance", orgId],
        ["tx_all_full", orgId],
        ["tx_month", orgId],
        ["tx_recent", orgId],
        ["tx_count", orgId],
      ];
      txKeys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));

      setDeleteDocTarget(null);
      toast({
        title: "Document deleted",
        description:
          "Document and its imported transactions have been removed.",
      });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setDeleteDocRunning(false);
    }
  }

  // ── Delete transactions mutation ────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .in("id", ids)
        .eq("org_id", orgId!);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      setSelectedTxIds(new Set());
      setConfirmDeleteOpen(false);
      const keysToInvalidate = [
        ["tx_period", orgId, period],
        ["tx_prev_period", orgId, period],
        ["tx_all_balance", orgId],
        ["tx_all_full", orgId],
        ["tx_month", orgId],
        ["tx_recent", orgId],
        ["tx_count", orgId],
      ];
      keysToInvalidate.forEach((k) =>
        queryClient.invalidateQueries({ queryKey: k }),
      );
      toast({
        title: `${ids.length} transaction${ids.length > 1 ? "s" : ""} deleted`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── Update transaction mutation ───────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async (payload: {
      id: number;
      title: string;
      amount: number;
      date_time: string;
      type: string;
      deductible: boolean;
      description: string;
      category_id: number | null;
      sub_category_id: number | null;
    }) => {
      const { id, ...fields } = payload;
      const { error } = await supabase
        .from("transactions")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDetailTx(null);
      const keysToInvalidate = [
        ["tx_period", orgId, period],
        ["tx_prev_period", orgId, period],
        ["tx_all_balance", orgId],
        ["tx_all_full", orgId],
        ["tx_month", orgId],
        ["tx_recent", orgId],
      ];
      keysToInvalidate.forEach((k) =>
        queryClient.invalidateQueries({ queryKey: k }),
      );
      toast({ title: "Transaction updated" });
    },
    onError: (err: Error) => {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── Create transaction mutation ───────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      amount: number;
      date_time: string;
      type: string;
      deductible: boolean;
      description: string;
      file_path?: string;
      category_id?: number | null;
    }) => {
      if (!orgId) throw new Error("No organization found");
      if (!numericId) throw new Error("No signed-in user found");
      await checkAddTransaction();
      const { data: insertedTransaction, error } = await supabase
        .from("transactions")
        .insert({ ...payload, org_id: orgId, user_id: numericId })
        .select("id")
        .single();
      if (error) throw error;
      await categorizeTransaction(Number(insertedTransaction.id), orgId);
    },
    onSuccess: async () => {
      if (newReceiptImportId !== null) {
        await supabase.from("pending_transactions").delete().eq("import_id", newReceiptImportId);
        await supabase.from("statement_imports").update({ status: "completed" }).eq("id", newReceiptImportId);
      }
      setShowAddTx(false);
      setNewTitle("");
      setNewAmount("");
      setNewNotes("");
      setNewDeductible(false);
      setNewCategoryId("");
      setNewMerchant("");
      setNewAccountId("");
      setNewPaymentMethod("");
      setNewReceiptNumber("");
      setNewBusinessUse("Business");
      setNewBusinessPercentage(100);
      setNewReimbursable(false);
      setNewDate(new Date().toISOString().slice(0, 10));
      setNewReceiptFile(null);
      setNewReceiptDocumentId(null);
      setNewReceiptImportId(null);
                       setNewReceiptStatus("idle");
                       setNewExtractedRows([]);
                       if (newReceiptFileRef.current) newReceiptFileRef.current.value = "";
                       if (newReceiptCameraRef.current) newReceiptCameraRef.current.value = "";
      const keys = [
        ["tx_period", orgId, period],
        ["tx_prev_period", orgId, period],
        ["tx_all_balance", orgId],
        ["tx_all_full", orgId],
        ["tx_month", orgId],
        ["tx_recent", orgId],
        ["tx_count", orgId],
      ];
      keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
      toast({ title: "Transaction added" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to add transaction",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── AI auto-categorize ────────────────────────────────────────────────────
  async function autoCategorize(tx: Transaction) {
    if (!categories.length) return;
    setAiCatLoading(true);
    setAiCatSuggested(false);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const catList = categories
        .map((c) => {
          const subs = subCategories.filter((s) => s.category_id === c.id);
          return `- ${c.name} (id:${c.id})${subs.length ? ": " + subs.map((s) => `${s.name} (id:${s.id})`).join(", ") : ""}`;
        })
        .join("\n");

      const prompt = `You are a financial categorization assistant for a US freelancer/small business accounting app.
Given a transaction, pick the best matching category and sub-category from the list below.

Transaction:
- Title: ${tx.title}
- Amount: ${tx.amount > 0 ? "+" : ""}${tx.amount} USD
- Type: ${tx.type || "Business"}
- Notes: ${tx.description || "(none)"}

Available categories and sub-categories:
${catList}

Respond with ONLY valid JSON, no explanation:
{"category_id": <number>, "sub_category_id": <number or null>}`;

      const res = await fetch("/api/openai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) return;
      const aiData = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = aiData.choices?.[0]?.message?.content ?? "";
      const jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) return;
      const parsed = JSON.parse(jsonMatch[0]) as {
        category_id?: number;
        sub_category_id?: number | null;
      };
      if (
        parsed.category_id &&
        categories.some((c) => c.id === parsed.category_id)
      ) {
        setEditCategoryId(parsed.category_id);
        setEditSubCategoryId(parsed.sub_category_id ?? null);
        setAiCatSuggested(true);
      }
    } catch {
      // silently fail — user can pick manually
    } finally {
      setAiCatLoading(false);
    }
  }

  // ── Open transaction detail (pre-populate edit form) ─────────────────────
  function openDetailTx(tx: Transaction) {
    setDetailTx(tx);
    setEditTitle(tx.title);
    setEditAmount(String(Math.abs(tx.amount)));
    const d = new Date(tx.date_time);
    const pad = (n: number) => String(n).padStart(2, "0");
    setEditDate(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    );
    setEditType(tx.type || "Business");
    setEditDeductible(tx.deductible ?? false);
    setEditNotes(tx.description || "");
    setEditCategoryId(tx.category_id ?? null);
    setEditSubCategoryId(tx.sub_category_id ?? null);
    setAiCatLoading(false);
    setAiCatSuggested(false);
  }

async function handleConnectBank() {
  setPlaidConnecting(true);

  setPlaidSyncStage("connecting");
  setPlaidSyncMessage("Opening secure bank connection...");

  try {
    if (!orgId) throw new Error("No active organization found");

    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token;

    if (!jwt) throw new Error("Not authenticated");

    const tokenRes = await fetch("/api/plaid/link-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ org_id: orgId }),
    });

    const tokenJson = (await tokenRes.json()) as {
      link_token?: string;
      message?: string;
      error?: string;
    };

    if (!tokenRes.ok || !tokenJson.link_token) {
      throw new Error(
        tokenJson.message ??
          tokenJson.error ??
          "Could not start Plaid Link",
      );
    }

    await openPlaidLink({
      token: tokenJson.link_token,

      onSuccess: async (publicToken, metadata) => {
        setPlaidSyncing(true);

        setPlaidSyncStage("syncing");
        setPlaidSyncMessage(
          "Bank connected. Preparing transaction import...",
        );

        try {
          const exchangeRes = await fetch(
            "/api/plaid/exchange-public-token",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${jwt}`,
              },
              body: JSON.stringify({
                public_token: publicToken,
                metadata,
                org_id: orgId,
              }),
            },
          );

          const exchangeJson = (await exchangeRes.json()) as {
            item_id?: number;
            message?: string;
            error?: string;
          };

          if (!exchangeRes.ok) {
            throw new Error(
              exchangeJson.message ??
                exchangeJson.error ??
                "Could not connect bank",
            );
          }

          queryClient.invalidateQueries({
            queryKey: ["plaid_accounts"],
          });

          queryClient.invalidateQueries({
            queryKey: ["dashboard_connected_banks", orgId],
          });

          setPlaidSyncStage("syncing");
          setPlaidSyncMessage(
            "Importing transactions from your bank...",
          );

          const syncRes = await fetch("/api/plaid/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({
              item_id: exchangeJson.item_id,
              org_id: orgId,
            }),
          });

          const syncJson = (await syncRes.json()) as {
            added?: number;
            modified?: number;
            removed?: number;
            message?: string;
            error?: string;
          };

          if (!syncRes.ok) {
            throw new Error(
              syncJson.message ??
                syncJson.error ??
                "Could not sync bank transactions",
            );
          }

          const changed =
            (syncJson.added ?? 0) +
            (syncJson.modified ?? 0);

          let categorized = 0;

          const passes = Math.max(
            1,
            Math.ceil(
              Math.max(changed, 1) /
                PLAID_CATEGORIZATION_BATCH_LIMIT,
            ),
          );

          setPlaidSyncStage("categorizing");

          setPlaidSyncMessage(
            changed > 0
              ? `${changed} transaction${
                  changed === 1 ? "" : "s"
                } received. Categorizing transactions...`
              : "Transaction import complete. Checking categories...",
          );

          for (let i = 0; i < passes; i += 1) {
            setPlaidSyncMessage(
              passes > 1
                ? `Categorizing transactions — batch ${
                    i + 1
                  } of ${passes}...`
                : "Categorizing imported transactions...",
            );

            const categorization =
              await categorizeUncategorizedTransactions(
                Math.min(
                  Math.max(changed, 30),
                  PLAID_CATEGORIZATION_BATCH_LIMIT,
                ),
                orgId,
              );

            categorized += categorization.updated;

            if (categorization.updated === 0) break;
          }

          setPlaidSyncStage("refreshing");
          setPlaidSyncMessage(
            "Updating your dashboard and financial reports...",
          );

          invalidateTransactionReports();

          queryClient.invalidateQueries({
            queryKey: ["tx_deductions"],
          });

          queryClient.invalidateQueries({
            queryKey: ["plaid_accounts"],
          });

          queryClient.invalidateQueries({
            queryKey: ["dashboard_connected_banks", orgId],
          });

          queryClient.invalidateQueries({
            queryKey: ["tx_count", orgId],
          });

          setPlaidSyncStage("complete");

          setPlaidSyncMessage(
            `${syncJson.added ?? 0} new transaction${
              (syncJson.added ?? 0) === 1 ? "" : "s"
            } imported. ${categorized} categorized.`,
          );

          toast({
            title: "Bank connected",
            description: `Synced ${
              syncJson.added ?? 0
            } new transaction${
              (syncJson.added ?? 0) === 1 ? "" : "s"
            }. Categorized ${categorized}.`,
          });
        } catch (err) {
          setPlaidSyncStage("error");
          setPlaidSyncMessage(
            "We couldn't finish importing your bank transactions.",
          );

          toast({
            title: "Bank sync failed",
            description: String(err),
            variant: "destructive",
          });
        } finally {
          setPlaidSyncing(false);
        }
      },

      onExit: (error) => {
        if (error?.error_message) {
          setPlaidSyncStage("error");
          setPlaidSyncMessage(error.error_message);

          toast({
            title: "Plaid Link closed",
            description: error.error_message,
            variant: "destructive",
          });
        } else if (!plaidSyncing) {
          setPlaidSyncStage("idle");
          setPlaidSyncMessage("");
        }
      },
    });
  } catch (err) {
    setPlaidSyncStage("error");
    setPlaidSyncMessage(
      "We couldn't start the bank connection.",
    );

    toast({
      title: "Could not connect bank",
      description: String(err),
      variant: "destructive",
    });
  } finally {
    setPlaidConnecting(false);
  }
}


  useEffect(() => {
    if (!orgId) return;
    const action = new URLSearchParams(searchStr).get("setupAction");
    const actionKey = action ? `${orgId}:${action}` : null;
    if (!actionKey || setupActionHandled.current === actionKey) return;
    setupActionHandled.current = actionKey;
    if (action === "connect-bank") {
      void handleConnectBank();
    } else if (action === "upload-statement") {
      setUploadCategory("Transactions");
      setShowUpload(true);
    }
  // The dashboard setup action is intentionally consumed once per organization.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, searchStr]);

  // ── Current period transactions ─────────────────────────────────────────────
  const { data: connectedBanks = [], isLoading: accountsLoading } = useQuery<
    ConnectedBank[]
  >({
    queryKey: ["plaid_accounts", numericId, orgId],
    enabled: (showAccountsDialog || showAddTx) && !!numericId && !!orgId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data: items, error: itemsError } = await supabase
        .from("plaid_items")
        .select("id, institution_name, status, created_at, updated_at")
        .eq("org_id", orgId!)
        .eq("status", "active")
        .order("updated_at", { ascending: false });
      if (itemsError) throw itemsError;

      const itemRows = (items ?? []) as PlaidItemRow[];
      const itemIds = itemRows.map((item) => item.id);
      if (itemIds.length === 0) return [];

      const { data: accounts, error: accountsError } = await supabase
        .from("plaid_accounts")
        .select(
          "id, plaid_item_id, name, official_name, mask, type, subtype, updated_at",
        )
        .in("plaid_item_id", itemIds)
        .order("name", { ascending: true });
      if (accountsError) throw accountsError;

      const accountsByItem = new Map<number, PlaidAccountRow[]>();
      for (const account of (accounts ?? []) as PlaidAccountRow[]) {
        const existing = accountsByItem.get(account.plaid_item_id) ?? [];
        existing.push(account);
        accountsByItem.set(account.plaid_item_id, existing);
      }

      return itemRows.map((item) => ({
        ...item,
        accounts: accountsByItem.get(item.id) ?? [],
      }));
    },
  });

  const transactionAccountOptions = connectedBanks.flatMap((bank) =>
    bank.accounts.map((account) => ({
      id: String(account.id),
      label: `${bank.institution_name || "Connected Bank"} — ${account.name || account.official_name || "Account"}${account.mask ? ` (•••• ${account.mask})` : ""}`,
    })),
  );

  async function handleDeletePlaidItem() {
    if (!deletePlaidTarget || !orgId) return;
    setDeletePlaidRunning(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token;
      if (!jwt) throw new Error("Not authenticated");

      const res = await fetch(
        `/api/plaid/items/${deletePlaidTarget.id}?org_id=${encodeURIComponent(String(orgId))}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${jwt}` },
        },
      );
      const json = (await res.json()) as {
        deleted_transactions?: number;
        plaid_remove_warning?: string | null;
        message?: string;
        error?: string;
      };
      if (!res.ok)
        throw new Error(
          json.message ?? json.error ?? "Could not delete connected bank",
        );

      setDeletePlaidTarget(null);
      invalidateTransactionReports();
      queryClient.invalidateQueries({ queryKey: ["tx_deductions"] });
      queryClient.invalidateQueries({ queryKey: ["plaid_accounts"] });
      toast({
        title: "Bank disconnected",
        description: `Deleted ${json.deleted_transactions ?? 0} synced transaction${(json.deleted_transactions ?? 0) === 1 ? "" : "s"}.`,
      });
      if (json.plaid_remove_warning) {
        toast({
          title: "Plaid removal warning",
          description:
            "The local bank connection was removed, but Plaid returned a warning while removing the remote item.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Could not disconnect bank",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setDeletePlaidRunning(false);
    }
  }

  const txPeriod = tab === "pl" ? plPeriod : period;
  const requestedRange = useMemo(
    () =>
      txPeriod === "custom"
        ? (() => {
            const rangeStart = new Date(plCustomStart);
            const rangeEnd = new Date(plCustomEnd);
            rangeStart.setHours(0, 0, 0, 0);
            rangeEnd.setHours(23, 59, 59, 999);
            return { start: rangeStart, end: rangeEnd };
          })()
        : getPeriodRange(txPeriod),
    [plCustomEnd, plCustomStart, txPeriod],
  );
  const { data: txs = [], isLoading } = useQuery<Transaction[]>({
    queryKey: [
      "tx_period",
      orgId,
      txPeriod,
      requestedRange.start.toISOString(),
      requestedRange.end.toISOString(),
    ],
    enabled: orgId != null,
    staleTime: 60 * 1000,
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select(
          "id, title, amount, type, date_time, description, deductible, category_id, sub_category_id",
        )
        .eq("org_id", orgId!);
      if (txPeriod !== "all") {
        query = query.gte("date_time", requestedRange.start.toISOString());
      }
      const { data, error } = await query
        .lte("date_time", requestedRange.end.toISOString())
        .order("date_time", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // All approved transactions for the active organization. The shared engine
  // applies the selected reporting window and cumulative Balance Sheet cutoff.
  const { data: allTxsFull = [], isLoading: allTxsLoading } = useQuery<
    Transaction[]
  >({
    queryKey: ["tx_all_full", orgId],
    enabled: orgId != null,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, title, amount, type, date_time, description, deductible, category_id, sub_category_id",
        )
        .eq("org_id", orgId!)
        .order("date_time", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Uploaded/manually-entered P&L, Balance Sheet, Cash Flow statements ──────
  // Kept fully separate from the transaction-based pl/bs/cf tabs above — this
  // powers the segregated "Financial Statements" tab.
  const { data: allStatementPeriods = [], isLoading: statementsLoading } =
    useQuery<StatementPeriod[]>({
      queryKey: ["statement_docs", numericId],
      enabled: numericId !== null,
      staleTime: 30_000,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("user_documents")
          .select("id, name, category, tax_year, parsed_data")
          .eq("user_id", numericId!)
          .in("category", [
            "Profit & Loss",
            "Income Statement",
            "Balance Sheet",
            "Cash Flow Statement",
          ]);
        if (error) throw error;
        return (data ?? []).flatMap((row) => normalizeStatementDoc(row as any));
      },
    });
  const statementPeriods = useMemo(
    () =>
      allStatementPeriods.filter((statement) => {
        if (statement.organizationId !== null) {
          return statement.organizationId === orgId;
        }
        return organizationCount <= 1;
      }),
    [allStatementPeriods, orgId, organizationCount],
  );
  const excludedUnscopedStatementCount =
    organizationCount > 1
      ? allStatementPeriods.filter(
          (statement) => statement.organizationId === null,
        ).length
      : 0;

  // ── Categories + sub-categories for the edit dialog ──────────────────────
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subCategories = [] } = useQuery<SubCategory[]>({
    queryKey: ["sub_categories"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sub_category")
        .select("id, name, category_id")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const end = requestedRange.end;
  const start =
    txPeriod === "all"
      ? (earliestFinancialDate(allTxsFull, statementPeriods, end) ?? end)
      : requestedRange.start;
  const { start: prevStart, end: prevEnd } = getPrevRange(txPeriod, start, end);

  // ── Derived metrics ────────────────────────────────────────────────────────
  const currentFinancialReport = useMemo(
    () =>
      calculateFinancialReport({
        transactions: allTxsFull,
        start,
        end,
        categories,
        subCategories,
      }),
    [allTxsFull, categories, end, start, subCategories],
  );
  const previousFinancialReport = useMemo(
    () =>
      calculateFinancialReport({
        transactions: allTxsFull,
        start: prevStart,
        end: prevEnd,
        categories,
        subCategories,
      }),
    [allTxsFull, categories, prevEnd, prevStart, subCategories],
  );
  const transactionExpenses =
    currentFinancialReport.pnl.cogs +
    currentFinancialReport.pnl.operatingExpenses +
    currentFinancialReport.pnl.otherExpenses +
    currentFinancialReport.pnl.incomeTaxExpense;
  const transactionBs: TransactionBalanceSheetEstimate = {
    currentAssets: currentFinancialReport.balanceSheet.currentAssets,
    nonCurrentAssets:
      currentFinancialReport.balanceSheet.netFixedAssets +
      currentFinancialReport.balanceSheet.otherAssets,
    totalAssets: currentFinancialReport.balanceSheet.totalAssets,
    currentLiabilities: currentFinancialReport.balanceSheet.currentLiabilities,
    longTermLiabilities:
      currentFinancialReport.balanceSheet.longTermLiabilities,
    totalLiabilities: currentFinancialReport.balanceSheet.totalLiabilities,
    equity: currentFinancialReport.balanceSheet.totalEquity,
  };
  const transactionCf: CashFlowEstimate = {
    operating: currentFinancialReport.cashFlow.operatingCashFlow,
    investing: currentFinancialReport.cashFlow.investingCashFlow,
    financing: currentFinancialReport.cashFlow.financingCashFlow,
    netChange: currentFinancialReport.cashFlow.netChangeInCash,
  };
  const resolvedStatements = resolveFinancialStatements(
    statementPeriods,
    start,
    end,
    {
      pnl: {
        totalRevenue: currentFinancialReport.pnl.netRevenue,
        totalCogs: currentFinancialReport.pnl.cogs,
        totalGrossProfit: currentFinancialReport.pnl.grossProfit,
        totalOpex: currentFinancialReport.pnl.operatingExpenses,
        totalExpenses: transactionExpenses,
        netIncome: currentFinancialReport.pnl.netIncome,
        count: currentFinancialReport.classifiedTransactions.length,
      },
      bs: transactionBs,
      cf: {
        ...transactionCf,
        count: currentFinancialReport.classifiedTransactions.length,
      },
    },
  );
  const previousTransactionExpenses =
    previousFinancialReport.pnl.cogs +
    previousFinancialReport.pnl.operatingExpenses +
    previousFinancialReport.pnl.otherExpenses +
    previousFinancialReport.pnl.incomeTaxExpense;
  const previousResolvedStatements = resolveFinancialStatements(
    statementPeriods,
    prevStart,
    prevEnd,
    {
      pnl: {
        totalRevenue: previousFinancialReport.pnl.netRevenue,
        totalCogs: previousFinancialReport.pnl.cogs,
        totalGrossProfit: previousFinancialReport.pnl.grossProfit,
        totalOpex: previousFinancialReport.pnl.operatingExpenses,
        totalExpenses: previousTransactionExpenses,
        netIncome: previousFinancialReport.pnl.netIncome,
        count: previousFinancialReport.classifiedTransactions.length,
      },
      bs: {
        currentAssets: previousFinancialReport.balanceSheet.currentAssets,
        nonCurrentAssets:
          previousFinancialReport.balanceSheet.netFixedAssets +
          previousFinancialReport.balanceSheet.otherAssets,
        totalAssets: previousFinancialReport.balanceSheet.totalAssets,
        currentLiabilities:
          previousFinancialReport.balanceSheet.currentLiabilities,
        longTermLiabilities:
          previousFinancialReport.balanceSheet.longTermLiabilities,
        totalLiabilities: previousFinancialReport.balanceSheet.totalLiabilities,
        equity: previousFinancialReport.balanceSheet.totalEquity,
      },
      cf: {
        operating: previousFinancialReport.cashFlow.operatingCashFlow,
        investing: previousFinancialReport.cashFlow.investingCashFlow,
        financing: previousFinancialReport.cashFlow.financingCashFlow,
        netChange: previousFinancialReport.cashFlow.netChangeInCash,
        count: previousFinancialReport.classifiedTransactions.length,
      },
    },
  );

  const income = resolvedStatements.pnl.totalRevenue;
  const expenses = resolvedStatements.pnl.totalExpenses;
  const netIncome = resolvedStatements.pnl.netIncome;
  const prevIncome = previousResolvedStatements.pnl.totalRevenue;
  const prevExpenses = previousResolvedStatements.pnl.totalExpenses;
  const prevNet = previousResolvedStatements.pnl.netIncome;

  const transactionMoneyIn = currentFinancialReport.classifiedTransactions
    .filter((transaction) => !transaction.isTransfer && transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const transactionMoneyOut = currentFinancialReport.classifiedTransactions
    .filter((transaction) => !transaction.isTransfer && transaction.amount < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const cfMoneyIn =
    resolvedStatements.sources.cashFlow === "uploaded"
      ? Math.max(0, resolvedStatements.cashFlow.operating) +
        Math.max(0, resolvedStatements.cashFlow.investing) +
        Math.max(0, resolvedStatements.cashFlow.financing)
      : transactionMoneyIn;
  const cfMoneyOut =
    resolvedStatements.sources.cashFlow === "uploaded"
      ? Math.max(0, -resolvedStatements.cashFlow.operating) +
        Math.max(0, -resolvedStatements.cashFlow.investing) +
        Math.max(0, -resolvedStatements.cashFlow.financing)
      : transactionMoneyOut;
  const cfNetCash = resolvedStatements.cashFlow.netChange;
  const prevCfIn =
    previousResolvedStatements.sources.cashFlow === "uploaded"
      ? Math.max(0, previousResolvedStatements.cashFlow.operating) +
        Math.max(0, previousResolvedStatements.cashFlow.investing) +
        Math.max(0, previousResolvedStatements.cashFlow.financing)
      : previousFinancialReport.classifiedTransactions
          .filter(
            (transaction) => !transaction.isTransfer && transaction.amount > 0,
          )
          .reduce((sum, transaction) => sum + transaction.amount, 0);
  const prevCfOut =
    previousResolvedStatements.sources.cashFlow === "uploaded"
      ? Math.max(0, -previousResolvedStatements.cashFlow.operating) +
        Math.max(0, -previousResolvedStatements.cashFlow.investing) +
        Math.max(0, -previousResolvedStatements.cashFlow.financing)
      : previousFinancialReport.classifiedTransactions
          .filter(
            (transaction) => !transaction.isTransfer && transaction.amount < 0,
          )
          .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const prevCfNet = previousResolvedStatements.cashFlow.netChange;

  // Dashboard and report tabs consume this same range-resolved source.
  const overviewIncome = resolvedStatements.pnl.totalRevenue;
  const overviewExpenses = resolvedStatements.pnl.totalExpenses;
  const overviewNetIncome = resolvedStatements.pnl.netIncome;
  const overviewMargin =
    overviewIncome > 0 ? (overviewNetIncome / overviewIncome) * 100 : 0;
  const totalAssets = resolvedStatements.balanceSheet.totalAssets;
  const totalLiabilities = resolvedStatements.balanceSheet.totalLiabilities;
  const equity = resolvedStatements.balanceSheet.equity;
  const debtToEquity = equity > 0 ? totalLiabilities / equity : 0;
  const previousTotalAssets =
    previousResolvedStatements.balanceSheet.totalAssets;
  const overviewMoneyIn = cfMoneyIn;
  const overviewMoneyOut = cfMoneyOut;
  const overviewNetCash = cfNetCash;
  const allTimeCfIn = overviewMoneyIn;
  const allTimeCfOut = overviewMoneyOut;
  const allTimeCfNet = overviewNetCash;
  const balanceSheetAsOf = resolvedStatements.balanceSheetPeriod?.asOf ?? end;

  // AI Deduction Optimization
  // Applies the admin-configured federal deduction rules (percentage caps,
  // per-transaction fixed amounts, org-specific business-use %) instead of
  // assuming every flagged transaction is 100% deductible. Reports has no
  // Federal/State toggle, so it defaults to Federal (consistent with the
  // ~25% federal tax rate estimate below).
  const dedSummary = useMemo(
    () =>
      summarizeDeductions(
        txs.filter((t) => t.deductible),
        orgStateId,
        orgDetails ?? null,
        ruleGroups,
        deductionRules,
      ),
    [txs, orgStateId, orgDetails, ruleGroups, deductionRules],
  );
  const deductibleAmt = dedSummary.totalFederal;
  const deductionPct =
    expenses > 0
      ? Math.min(100, Math.round((deductibleAmt / expenses) * 100))
      : 0;
  const taxSavings = Math.round(deductibleAmt * 0.25); // ~25% tax rate

  const aiStrategySummary = useMemo(() => {
    let totalAdditionalDeductions = 0;
    let totalSavings = 0;

    for (const row of aiStrategyRows) {
      totalSavings += row.estimated_savings ?? 0;
      try {
        const context = JSON.parse(row.ai_context ?? "{}") as {
          deduction_amount?: unknown;
        };
        if (
          typeof context.deduction_amount === "number" &&
          Number.isFinite(context.deduction_amount)
        ) {
          totalAdditionalDeductions += context.deduction_amount;
        }
      } catch {
        // Legacy strategy rows may contain plain-text context.
      }
    }

    return {
      hasGenerated: aiStrategyRows.length > 0,
      totalAdditionalDeductions,
      totalSavings,
    };
  }, [aiStrategyRows]);

  // Match the AI Strategy gauge, which is based on the current month's raw
  // deductible flags rather than the Reports page's selected date range.
  const aiOptimizationPct = useMemo(() => {
    const monthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    ).getTime();
    const monthExpenses = allTxsFull.filter(
      (tx) => tx.amount < 0 && new Date(tx.date_time).getTime() >= monthStart,
    );
    const expenseAmount = monthExpenses.reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0,
    );
    const deductibleAmount = monthExpenses
      .filter((tx) => tx.deductible)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    return expenseAmount > 0
      ? Math.min(100, Math.round((deductibleAmount / expenseAmount) * 100))
      : 0;
  }, [allTxsFull]);

  // Business Health Score
  const bhs = Math.min(
    100,
    Math.round(
      15 +
        (overviewNetIncome > 0 ? 25 : 0) +
        Math.min(25, (overviewIncome / 1000) * 2) +
        (overviewMargin > 20 ? 20 : overviewMargin > 5 ? 10 : 0) +
        (deductionPct > 50 ? 15 : deductionPct > 20 ? 8 : 0),
    ),
  );

  // Trend chart data
  const trendData = useMemo(
    () => buildTrendData(txs, start, end, categories, subCategories),
    [categories, end, start, subCategories, txs],
  );

  // Period label
  const periodLabel = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const hasPriorComparison = period !== "all";
  const comparisonCaption =
    period === "all"
      ? "No prior period"
      : period === "7d"
        ? "vs previous 7 days"
        : period === "30d"
          ? "vs previous 30 days"
          : period === "3m"
            ? "vs previous 3 months"
            : period === "12m"
              ? "vs previous 12 months"
              : period === "yearly"
                ? "vs previous year"
                : "vs previous period";

  // ── Export handler ──────────────────────────────────────────────────────────
  async function handleExport() {
    setIsExporting(true);
    try {
      if (!orgId) return;

      if (exportFormat === "pdf" || exportFormat === "excel") {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const planRes = await fetch("/api/plan-limits/usage", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (planRes.ok) {
          const plan = (await planRes.json()) as {
            limits?: { pdfExport?: boolean; excelExport?: boolean };
            tier?: string;
          };
          const allowed =
            exportFormat === "pdf"
              ? plan.limits?.pdfExport
              : plan.limits?.excelExport;
          if (allowed === false) {
            if (exportFormat === "pdf") {
              const unlockKey: TokenUnlockKey =
                exportType === "pl"
                  ? "pl_pdf_export"
                  : exportType === "cf"
                    ? "cash_flow_pdf_export"
                    : "full_financial_pdf_package";
              const cost = exportType === "bs" ? 3 : 1;
              const ok = window.confirm(
                `${exportType === "bs" ? "Balance Sheet PDF" : exportType === "pl" ? "P&L PDF" : "Cash Flow PDF"} export is not included on your ${plan.tier ?? "current"} plan. Use ${cost} token${cost === 1 ? "" : "s"} for this export?`,
              );
              if (!ok) {
                setIsExporting(false);
                return;
              }
              const result = await spendTokensForUnlock(
                unlockKey,
                `${exportType}:${Date.now()}`,
              );
              toast({
                title: "Export unlocked",
                description:
                  result.upgradeMessage ??
                  `Spent ${cost} token${cost === 1 ? "" : "s"} for this export.`,
              });
            } else {
              toast({
                title: "Upgrade required",
                description: `Excel export is only available on Pro. Upgrade to unlock it.`,
                variant: "destructive",
              });
              setIsExporting(false);
              return;
            }
          }
        }
      }

      const sDate = new Date(exportStart);
      const eDate = new Date(exportEnd);
      sDate.setHours(0, 0, 0, 0);
      eDate.setHours(23, 59, 59, 999);
      const exclusiveEnd = new Date(eDate);
      exclusiveEnd.setMilliseconds(exclusiveEnd.getMilliseconds() + 1);
      const fetchStart = new Date(0).toISOString();
      const { data: exportTxs, error: transactionError } = await supabase
        .from("transactions")
        .select(
          "id, title, amount, type, date_time, description, deductible, category_id, sub_category_id",
        )
        .eq("org_id", orgId)
        .gte("date_time", fetchStart)
        .lt("date_time", exclusiveEnd.toISOString())
        .order("date_time", { ascending: true });
      if (transactionError) throw transactionError;
      const rows = exportTxs ?? [];
      // Reuse the page's canonical `category` / `sub_category` queries. The
      // database has singular table names; querying a parallel `categories`
      // endpoint causes PostgREST to return 404.
      const cats: CatRow[] = categories.map((category) => ({
        id: category.id,
        name: category.name,
        type: category.type ?? "",
      }));
      const orgRow = orgDetails as Record<string, unknown> | null;
      const companyName =
        exportCompanyName.trim() ||
        ((orgRow?.name as string | undefined) ??
          (orgRow?.business_name as string | undefined) ??
          (profile as { org_name?: string } | null)?.org_name ??
          "Organization");
      const orgInfo: OrgInfo = {
        address:
          exportAddress.trim() || (orgRow?.address as string | undefined),
        cityState:
          [orgRow?.city, orgRow?.state, orgRow?.zip_code]
            .filter(Boolean)
            .join(", ") || (orgRow?.location as string | undefined),
      };

      const bsForExport = exportType === "bs" ? effectiveBs : null;
      const cfForExport = exportType === "cf" ? effectiveCf : null;
      const sharedReports = buildSharedExportReports(
        exportType,
        rows,
        sDate,
        eDate,
        exportFreq,
        exportPeriodCount,
        cats,
        subCategories,
      );
      const exportModel = createStatementExport({
        reportType: exportType,
        frequency: exportFreq,
        startDate: exportStart,
        endDate: exportEnd,
        asOfDate: exportEnd,
        snapshotCount: exportPeriodCount,
        companyName,
        address: [orgInfo.address, orgInfo.cityState]
          .filter(Boolean)
          .join(", "),
        logoUrl:
          exportLogoUrl.trim() ||
          ((orgRow?.logo_url as string | undefined) ??
            (orgRow?.img_url as string | undefined)),
        transactions: rows,
        categories: cats,
        subCategories,
      });

      if (exportFormat === "pdf") {
        await exportToPDF(
          exportType,
          exportFreq,
          exportStart,
          exportEnd,
          rows,
          exportPeriodCount,
          companyName,
          cats,
          orgInfo,
          bsForExport,
          cfForExport,
          sharedReports,
          exportModel,
        );
      } else if (exportFormat === "excel") {
        await exportToExcel(
          exportType,
          exportFreq,
          exportStart,
          exportEnd,
          rows,
          exportPeriodCount,
          companyName,
          cats,
          orgInfo,
          bsForExport,
          cfForExport,
          sharedReports,
          exportModel,
        );
      } else {
        // CSV fallback
        const reportName =
          exportType === "pl"
            ? "Profit & Loss"
            : exportType === "bs"
              ? "Balance Sheet"
              : "Cash Flow";
        let csvRows: string[][] = [];
        if (exportType === "pl") {
          const totalRevenue = rows
            .filter((t) => t.amount > 0)
            .reduce((s, t) => s + t.amount, 0);
          const totalExpenses = rows
            .filter((t) => t.amount < 0)
            .reduce((s, t) => s + Math.abs(t.amount), 0);
          const netIncome = totalRevenue - totalExpenses;
          csvRows = [
            ["BookSmart – Profit & Loss Report"],
            [
              `Period: ${exportStart} to ${exportEnd}`,
              `Frequency: ${exportFreq}`,
            ],
            [],
            ["Date", "Description", "Category", "Revenue", "Expenses"],
            ...rows.map((t) => [
              new Date(t.date_time).toLocaleDateString("en-US"),
              t.title,
              t.type || (t.amount > 0 ? "Income" : "Expense"),
              t.amount > 0 ? t.amount.toFixed(2) : "",
              t.amount < 0 ? Math.abs(t.amount).toFixed(2) : "",
            ]),
            [],
            ["", "", "Revenue", totalRevenue.toFixed(2), ""],
            ["", "", "Cost of Goods Sold (COGS)", "0.00", ""],
            ["", "", "Gross Profit", totalRevenue.toFixed(2), ""],
            ["", "", "Operating Expenses", "", totalExpenses.toFixed(2)],
            ["", "", "Net Income", netIncome.toFixed(2), ""],
          ];
        } else if (exportType === "cf") {
          const cf = cfForExport ?? {
            operating: 0,
            investing: 0,
            financing: 0,
            netChange: 0,
          };
          csvRows = [
            ["BookSmart – Cash Flow Statement"],
            [
              `Period: ${exportStart} to ${exportEnd}`,
              `Frequency: ${exportFreq}`,
            ],
            [],
            ["Date", "Description", "Type", "Amount"],
            ...rows.map((t) => [
              new Date(t.date_time).toLocaleDateString("en-US"),
              t.title,
              t.amount > 0 ? "Inflow" : "Outflow",
              t.amount.toFixed(2),
            ]),
            [],
            ["", "Operating Activities", "", cf.operating.toFixed(2)],
            ["", "Investing Activities", "", cf.investing.toFixed(2)],
            ["", "Financing Activities", "", cf.financing.toFixed(2)],
            ["", "Net Change in Cash", "", cf.netChange.toFixed(2)],
          ];
        } else {
          const bs = bsForExport ?? {
            currentAssets: 0,
            nonCurrentAssets: 0,
            totalAssets: 0,
            currentLiabilities: 0,
            longTermLiabilities: 0,
            totalLiabilities: 0,
            equity: 0,
          };
          csvRows = [
            ["BookSmart – Balance Sheet"],
            [`As of: ${exportEnd}`],
            [],
            ["Category", "Amount"],
            ["Current Assets", bs.currentAssets.toFixed(2)],
            ["Fixed / Non-Current Assets", bs.nonCurrentAssets.toFixed(2)],
            ["Total Assets", bs.totalAssets.toFixed(2)],
            ["Current Liabilities", bs.currentLiabilities.toFixed(2)],
            ["Long-Term Liabilities", bs.longTermLiabilities.toFixed(2)],
            ["Total Liabilities", bs.totalLiabilities.toFixed(2)],
            ["Owner's Equity", bs.equity.toFixed(2)],
            [
              "Total Liabilities and Equity",
              (bs.totalLiabilities + bs.equity).toFixed(2),
            ],
          ];
        }
        const csv = statementExportToCsv(exportModel);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = safeStatementFilename(exportModel, "csv");
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }

      setShowExport(false);
      toast({
        title: "Export ready",
        description: `${exportModel.reportName} downloaded successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description:
          error instanceof Error
            ? error.message
            : "Could not generate this export.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  }

  // ── Upload dialog helpers ───────────────────────────────────────────────────
  const isBalanceSheetUpload = uploadCategory === "Balance Sheet";

  function resetUploadForm() {
    setUploadPickedFile(null);
    setUploadName("");
    setUploadCategory("");
    const y = new Date().getFullYear();
    setUploadYear(y.toString());
    setUploadPeriodStart(`${y}-01-01`);
    setUploadPeriodEnd(`${y}-12-31`);
    setUploadAsOf(new Date().toISOString().slice(0, 10));
    setUploadError("");
    if (uploadFileRef.current) uploadFileRef.current.value = "";
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadPickedFile(file);
    if (!uploadName) setUploadName(file.name.replace(/\.[^.]+$/, ""));
    setUploadError("");
  }

  function handleUploadYearChange(year: string) {
    setUploadYear(year);
    const y = parseInt(year, 10);
    if (!isNaN(y)) {
      setUploadPeriodStart(`${y}-01-01`);
      setUploadPeriodEnd(`${y}-12-31`);
    }
  }

  function scheduleUploadCategorization() {
    const delays = [8000, 20000, 45000];
    delays.forEach((delay) => {
      window.setTimeout(async () => {
        const categorization = await categorizeUncategorizedTransactions(
          30,
          orgId,
        );
        if (categorization.updated > 0) {
          queryClient.invalidateQueries({ queryKey: ["tx_month", orgId] });
          queryClient.invalidateQueries({ queryKey: ["tx_recent", orgId] });
          queryClient.invalidateQueries({ queryKey: ["tx_count", orgId] });
          queryClient.invalidateQueries({
            queryKey: ["tx_period", orgId, period],
          });
          queryClient.invalidateQueries({
            queryKey: ["tx_prev_period", orgId, period],
          });
          queryClient.invalidateQueries({ queryKey: ["tx_all_full", orgId] });
          queryClient.invalidateQueries({
            queryKey: ["tx_all_balance", orgId],
          });
        }
      }, delay);
    });
  }

  async function extractNewTransactionReceipt() {
    if (!newReceiptFile || !numericId || !orgId || !user?.id) return;
    setNewReceiptProcessing(true);
    setNewReceiptStatus("processing");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated.");

      const formData = new FormData();
      formData.append("file", newReceiptFile);
      formData.append("originalName", newReceiptFile.name);
      formData.append("category", "Transactions");
      const uploadRes = await fetch("/api/document-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const uploadResult = await uploadRes.json().catch(() => ({})) as { publicUrl?: string; storagePath?: string; message?: string };
      if (!uploadRes.ok || !uploadResult.publicUrl || !uploadResult.storagePath) {
        throw new Error(uploadResult.message ?? "Receipt upload failed.");
      }

      const extension = newReceiptFile.name.split(".").pop()?.toLowerCase() ?? "";
      const documentName = `${newTitle.trim() || newReceiptFile.name.replace(/\.[^.]+$/, "")}${extension ? `.${extension}` : ""}`;
      const { data: document, error: documentError } = await supabase
        .from("user_documents")
        .insert({
          user_id: numericId,
          name: documentName,
          file_url: uploadResult.publicUrl,
          category: "Transactions",
          tax_year: newDate.slice(0, 4),
          file_size: newReceiptFile.size,
          mime_type: newReceiptFile.type || "application/octet-stream",
          parsed_data: {
            period_start: `${newDate}T00:00:00.000`,
            period_end: `${newDate}T23:59:59.999`,
            document_category: "Transactions",
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (documentError) throw new Error(documentError.message);

      const documentId = Number(document.id);
      const mimeType = newReceiptFile.type || "application/octet-stream";
      let extractedText: string | null = null;
      let isScanned = mimeType.startsWith("image/");
      let statementDocumentPath = uploadResult.storagePath;
      let statementMimeType = mimeType;

      if (mimeType === "application/pdf") {
        const fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.includes(",") ? result.split(",")[1] : result);
          };
          reader.onerror = () => reject(new Error("Failed to read PDF."));
          reader.readAsDataURL(newReceiptFile);
        });

        try {
          const textRes = await fetch("/api/extract-text", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ fileData }),
          });
          if (textRes.ok) {
            const payload = await textRes.json() as { text?: string; isScanned?: boolean };
            const text = payload.text?.trim() ?? "";
            extractedText = text.length >= 50 ? text : null;
            isScanned = extractedText === null ? true : (payload.isScanned ?? false);
          } else {
            isScanned = true;
          }
        } catch (error) {
          console.warn("[add-transaction] PDF text extraction failed, using n8n OCR:", error);
          isScanned = true;
        }
      }

      if (mimeType === "application/pdf" && isScanned) {
        try {
          const pagePaths = await uploadTransactionPdfPages(newReceiptFile, token);
          if (pagePaths.length > 0) {
            statementDocumentPath = pagePaths.length > 1 ? JSON.stringify(pagePaths) : pagePaths[0];
            statementMimeType = "image/png";
          }
        } catch (error) {
          console.warn("[add-transaction] scanned PDF rendering failed, using original PDF:", error);
        }
      }

      const { data: statementImport, error: importError } = await supabase
        .from("statement_imports")
        .insert({
          user_id: numericId,
          org_id: orgId,
          document_id: documentId,
          document_path: statementDocumentPath,
          mime_type: statementMimeType,
          is_scanned: isScanned,
          extracted_text: isScanned ? null : extractedText,
          status: "processing",
        })
        .select("id")
        .single();
      if (importError) throw new Error(importError.message);

      const importId = Number(statementImport.id);
      const importStartedAt = new Date().toISOString();
      setNewReceiptDocumentId(documentId);
      setNewReceiptImportId(importId);
      toast({ title: "Receipt uploaded", description: "The system is extracting the transaction details." });

      let latestReceiptRows: ExtractedReceiptTransaction[] = [];
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 2000));
        const { data: currentImport, error: importStatusError } = await supabase
          .from("statement_imports")
          .select("status,error_message")
          .eq("id", importId)
          .single();
        if (importStatusError) throw new Error(importStatusError.message);
        if (currentImport?.status === "failed") {
          throw new Error(currentImport.error_message || "Receipt processing failed.");
        }

        const { data: directRows, error: extractedError } = await supabase
          .from("pending_transactions")
          .select("id,title,amount,transaction_type,date_time,description,category_id,sub_category_id,payment_method,receipt_number,business_use,business_percentage,deductible,reimbursable,account_card_hint")
          .eq("import_id", importId)
          .eq("status", "pending")
          .order("id", { ascending: true })
          .range(0, 4999);
        if (extractedError) throw new Error(extractedError.message);
        let extractedRows = directRows;
        if ((extractedRows?.length ?? 0) === 0) {
          const { data: pathRows } = await supabase
            .from("pending_transactions")
            .select("id,title,amount,transaction_type,date_time,description,category_id,sub_category_id,payment_method,receipt_number,business_use,business_percentage,deductible,reimbursable,account_card_hint")
            .eq("document_path", statementDocumentPath)
            .eq("status", "pending")
            .order("id", { ascending: true })
            .range(0, 4999);
          extractedRows = pathRows ?? [];
        }
        if ((extractedRows?.length ?? 0) === 0) {
          const since = new Date(new Date(importStartedAt).getTime() - 120000).toISOString();
          const { data: recentRows } = await supabase
            .from("pending_transactions")
            .select("id,title,amount,transaction_type,date_time,description,category_id,sub_category_id,payment_method,receipt_number,business_use,business_percentage,deductible,reimbursable,account_card_hint")
            .eq("user_id", numericId)
            .eq("status", "pending")
            .gte("created_at", since)
            .or(`org_id.eq.${orgId},org_id.is.null`)
            .order("created_at", { ascending: true })
            .range(0, 4999);
          extractedRows = recentRows ?? [];
        }
        const receiptRows = ((extractedRows ?? []) as ExtractedReceiptTransaction[]).map((row) => ({
          ...row,
          business_type: row.business_use === "Personal" ? "Personal" as const : "Business" as const,
          business_use: row.business_use ?? "Business",
          business_percentage: row.business_percentage ?? (row.business_use === "Personal" ? 0 : 100),
          merchant: row.title,
          deductible: row.deductible ?? row.transaction_type === "debit",
        }));
        const extracted = receiptRows[0];
        if (!extracted) {
          if (currentImport?.status === "completed") {
            throw new Error("Processing completed but did not return any transactions.");
          }
          continue;
        }

        latestReceiptRows = receiptRows;
        setNewExtractedRows(receiptRows);
        const absoluteAmount = Math.abs(Number(extracted.amount) || 0);
        setNewTitle(extracted.title?.trim() || newTitle);
        setNewAmount(String(extracted.transaction_type === "debit" ? -absoluteAmount : absoluteAmount));
        if (extracted.date_time) setNewDate(extracted.date_time.slice(0, 10));
        setNewNotes(extracted.description ?? "");
        if (currentImport?.status === "completed") {
          setNewReceiptStatus("extracted");
          toast({
            title: `${receiptRows.length} transaction${receiptRows.length === 1 ? "" : "s"} extracted`,
            description: "Review all details, then add the transactions.",
          });
          return;
        }
        setNewReceiptStatus("processing");
      }
      if (latestReceiptRows.length > 0) {
        setNewReceiptStatus("extracted");
        toast({
          title: `${latestReceiptRows.length} transaction${latestReceiptRows.length === 1 ? "" : "s"} extracted`,
          description: "Review the available details. Processing did not finish before the wait ended.",
        });
        return;
      }
      throw new Error("Receipt processing is taking longer than expected. You can enter the details manually or try again later.");
    } catch (error) {
      setNewReceiptStatus("failed");
      toast({
        title: "Could not extract receipt",
        description: error instanceof Error ? error.message : "Receipt processing failed.",
        variant: "destructive",
      });
    } finally {
      setNewReceiptProcessing(false);
    }
  }

  async function approveExtractedReceiptRows(rows: ExtractedReceiptTransaction[]) {
    if (!numericId || !orgId || rows.length === 0) return;
    setNewReceiptApprovalRunning(true);
    try {
      await checkAddTransaction(rows.length);
      const { data: insertedTransactions, error: insertError } = await supabase.from("transactions").insert(rows.map((row) => ({
        user_id: numericId,
        org_id: orgId,
        title: row.title,
        amount: row.transaction_type === "debit" ? -Math.abs(row.amount) : Math.abs(row.amount),
        description: buildTransactionDescription(row.description ?? "", {
          merchant: row.merchant,
          account: transactionAccountOptions.find((account) => account.id === row.account_id)?.label ?? row.account_card_hint,
          paymentMethod: row.payment_method,
          receiptNumber: row.receipt_number,
          businessUse: row.business_use,
          businessPercentage: row.business_percentage,
          reimbursable: row.reimbursable,
        }),
        type: row.business_use ?? row.business_type ?? "Business",
        deductible: row.deductible ?? row.transaction_type === "debit",
        payment_method: row.payment_method ?? null,
        receipt_number: row.receipt_number ?? null,
        business_use: row.business_use ?? null,
        business_percentage: row.business_percentage ?? null,
        reimbursable: row.reimbursable ?? null,
        account_card_hint: row.account_card_hint ?? null,
        date_time: row.date_time,
        is_ai_verified: false,
        category_id: row.category_id ?? null,
        sub_category_id: row.sub_category_id ?? null,
        ...(newReceiptDocumentId !== null ? { file_path: String(newReceiptDocumentId) } : {}),
      }))).select("id");
      if (insertError) throw new Error(insertError.message);

      for (const insertedTransaction of insertedTransactions ?? []) {
        await categorizeTransaction(Number(insertedTransaction.id), orgId);
      }

      const approvedIds = rows.map((row) => row.id);
      const { error: deleteError } = await supabase.from("pending_transactions").delete().in("id", approvedIds);
      if (deleteError) throw new Error(deleteError.message);

      const remainingRows = newExtractedRows.filter((row) => !approvedIds.includes(row.id));
      setNewExtractedRows(remainingRows);
      if (remainingRows.length === 0 && newReceiptImportId !== null) {
        await supabase.from("statement_imports").update({ status: "completed" }).eq("id", newReceiptImportId);
        setShowAddTx(false);
        setNewReceiptFile(null);
        setNewReceiptDocumentId(null);
        setNewReceiptImportId(null);
        setNewReceiptStatus("idle");
        setNewTitle("");
        setNewAmount("");
        setNewNotes("");
        setNewMerchant("");
        setNewAccountId("");
        setNewPaymentMethod("");
        setNewReceiptNumber("");
        setNewBusinessUse("Business");
        setNewBusinessPercentage(100);
        setNewReimbursable(false);
        if (newReceiptFileRef.current) newReceiptFileRef.current.value = "";
      }
      [["tx_period", orgId, period], ["tx_prev_period", orgId, period], ["tx_all_balance", orgId], ["tx_all_full", orgId], ["tx_month", orgId], ["tx_recent", orgId], ["tx_count", orgId]]
        .forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
      toast({ title: `${rows.length} transaction${rows.length === 1 ? "" : "s"} approved` });
    } catch (error) {
      toast({
        title: "Could not approve transactions",
        description: error instanceof Error ? error.message : "Approval failed.",
        variant: "destructive",
      });
    } finally {
      setNewReceiptApprovalRunning(false);
    }
  }

  async function rejectExtractedReceiptRows(rows: ExtractedReceiptTransaction[]) {
    if (rows.length === 0) return;
    setNewReceiptApprovalRunning(true);
    try {
      const rejectedIds = rows.map((row) => row.id);
      const { error } = await supabase.from("pending_transactions").delete().in("id", rejectedIds);
      if (error) throw new Error(error.message);

      const remainingRows = newExtractedRows.filter((row) => !rejectedIds.includes(row.id));
      setNewExtractedRows(remainingRows);
      if (remainingRows.length === 0) {
        if (newReceiptImportId !== null) {
          await supabase.from("statement_imports").update({ status: "completed" }).eq("id", newReceiptImportId);
        }
        setShowAddTx(false);
        setNewReceiptFile(null);
        setNewReceiptDocumentId(null);
        setNewReceiptImportId(null);
        setNewReceiptStatus("idle");
        setNewTitle("");
        setNewAmount("");
        setNewNotes("");
        if (newReceiptFileRef.current) newReceiptFileRef.current.value = "";
      }
      toast({ title: `${rows.length} transaction${rows.length === 1 ? "" : "s"} rejected` });
    } catch (error) {
      toast({
        title: "Could not reject transactions",
        description: error instanceof Error ? error.message : "Rejection failed.",
        variant: "destructive",
      });
    } finally {
      setNewReceiptApprovalRunning(false);
    }
  }

  async function handleUploadSave() {
    if (!uploadPickedFile) {
      setUploadError("Please select a file first.");
      return;
    }
    if (!uploadName.trim()) {
      setUploadError("Please enter a document name.");
      return;
    }
    if (!uploadCategory) {
      setUploadError("Please select a document category.");
      return;
    }
    if (isBalanceSheetUpload) {
      if (!uploadAsOf) {
        setUploadError("Please select an As Of date.");
        return;
      }
    } else {
      if (!uploadPeriodStart || !uploadPeriodEnd) {
        setUploadError("Please select period dates.");
        return;
      }
      if (uploadPeriodEnd < uploadPeriodStart) {
        setUploadError("End date must be on or after start date.");
        return;
      }
    }
    if (!numericId || !user?.id) {
      setUploadError("Not authenticated.");
      return;
    }

    setUploadSaving(true);
    setUploadError("");
    let createdDocumentId: number | null = null;
    let uploadedStoragePath: string | null = null;
    let uploadedPagePaths: string[] = [];
    let uploadToken = "";
    let rollbackTransactionUpload = false;
    try {
      // 1. Upload file to Supabase Storage via backend (uses service role key — guaranteed to work)
      const ext = uploadPickedFile.name.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = uploadPickedFile.type || "application/octet-stream";
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated.");
      uploadToken = token;

      const formData = new FormData();
      formData.append("file", uploadPickedFile);
      formData.append("originalName", uploadPickedFile.name);
      formData.append("category", uploadCategory);

      const uploadRes = await fetch("/api/document-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) {
        const errBody = (await uploadRes.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          `Storage upload failed: ${errBody.message ?? uploadRes.status}`,
        );
      }
      const { publicUrl, storagePath } = (await uploadRes.json()) as {
        publicUrl: string;
        storagePath: string;
      };
      uploadedStoragePath = storagePath;
      rollbackTransactionUpload = uploadCategory === "Transactions";

      // 3. Build parsed_data (period metadata)
      const parsedData = isBalanceSheetUpload
        ? { as_of: uploadAsOf, document_category: uploadCategory }
        : {
            period_start: `${uploadPeriodStart}T00:00:00.000`,
            period_end: `${uploadPeriodEnd}T00:00:00.000`,
            document_category: uploadCategory,
          };

      // 4. Insert user_documents row — get ID back for linking
      const docName = ext ? `${uploadName.trim()}.${ext}` : uploadName.trim();
      const { data: docData, error: dbError } = await supabase
        .from("user_documents")
        .insert({
          user_id: numericId,
          name: docName,
          file_url: publicUrl,
          category: uploadCategory,
          tax_year: uploadYear,
          file_size: uploadPickedFile.size,
          mime_type: mimeType,
          parsed_data: parsedData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (dbError)
        throw new Error(`Database insert failed: ${dbError.message}`);
      createdDocumentId = Number(docData.id);

      const docType = categoryToDocType(uploadCategory);
      if (docType) {
        if (!orgId)
          throw new Error(
            "Select an organization before uploading a financial statement.",
          );
        try {
          const extraction = await extractFinancialStatement(
            uploadPickedFile,
            docType as StatementType,
          );
          const review = await createStatementReview({
            organizationId: orgId,
            documentId: Number(docData.id),
            idempotencyKey: `${user.id}:${crypto.randomUUID()}`,
            extraction,
          });
          setStatementReview({
            id: review.id,
            draft: review.normalized_draft,
            warnings: [
              ...extraction.warnings,
              ...(review.extraction_warnings ?? []),
            ],
            documentId: Number(docData.id),
            storagePath,
          });
        } catch (err) {
          console.warn("[upload] financial statement extraction failed:", err);
          toast({
            title: "Document saved, extraction failed",
            description:
              "The file was uploaded, but no extracted figures were saved. Try uploading a clearer statement.",
            variant: "destructive",
          });
        }
      }

      // Refresh the repository only after transaction import setup succeeds.

      // 6. If this is a bank statement / transaction document → trigger AI scan
      const isStatementDoc = uploadCategory === "Transactions";
      if (isStatementDoc && docData?.id) {
        if (!orgId)
          throw new Error(
            "No organization found for your account. Please contact support.",
          );

        setScanningImportId(-1);

        let extractedText: string | null = null;
        let isScanned = mimeType.startsWith("image/");
        let statementDocumentPath = storagePath;
        let statementMimeType = mimeType;

        if (mimeType === "application/pdf") {
          const fileData = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.includes(",") ? result.split(",")[1] : result);
            };
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(uploadPickedFile);
          });

          try {
            const textRes = await fetch("/api/extract-text", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ fileData }),
            });
            if (textRes.ok) {
              const payload = (await textRes.json()) as {
                text?: string;
                isScanned?: boolean;
              };
              const text = payload.text?.trim() ?? "";
              extractedText = text.length >= 50 ? text : null;
              isScanned =
                extractedText === null ? true : (payload.isScanned ?? false);
            } else {
              isScanned = true;
            }
          } catch (err) {
            console.warn(
              "[upload] extract-text failed, continuing with n8n OCR path:",
              err,
            );
            isScanned = true;
          }
        }

        if (mimeType === "application/pdf" && isScanned) {
          try {
            const pagePaths = await uploadTransactionPdfPages(
              uploadPickedFile,
              token,
            );
            uploadedPagePaths = pagePaths;
            if (pagePaths.length > 0) {
              statementDocumentPath =
                pagePaths.length > 1 ? JSON.stringify(pagePaths) : pagePaths[0];
              statementMimeType = "image/png";
            }
          } catch (err) {
            console.warn(
              "[upload] scanned PDF page rendering failed, using original PDF path:",
              err,
            );
          }
        }

        const { data: importData, error: importError } = await supabase
          .from("statement_imports")
          .insert({
            user_id: numericId,
            org_id: orgId,
            document_id: docData.id,
            document_path: statementDocumentPath,
            mime_type: statementMimeType,
            is_scanned: isScanned,
            extracted_text: isScanned ? null : extractedText,
            status: "processing",
          })
          .select("id")
          .single();

        if (importError) throw new Error(importError.message);

        const newImportId = (importData as { id: number }).id;
        rollbackTransactionUpload = false;
        queryClient.invalidateQueries({
          queryKey: ["user_documents", numericId],
        });
        queryClient.invalidateQueries({
          queryKey: ["statement_docs", numericId],
        });
        setShowUpload(false);
        resetUploadForm();
        setShowDocs(false);
        setScanningImportId(newImportId);
        toast({
          title: "Transaction import started",
          description: "The system will extract transactions from this file.",
        });
        scheduleUploadCategorization();
        return;
      } else {
        queryClient.invalidateQueries({
          queryKey: ["user_documents", numericId],
        });
        queryClient.invalidateQueries({
          queryKey: ["statement_docs", numericId],
        });
        setShowUpload(false);
        resetUploadForm();
        toast({ title: "Document uploaded successfully!" });
      }
    } catch (err: unknown) {
      if (rollbackTransactionUpload) {
        setScanningImportId(null);
        const storagePaths = [uploadedStoragePath, ...uploadedPagePaths].filter(
          (path): path is string => Boolean(path),
        );
        const cleanupResults = await Promise.allSettled([
          ...(createdDocumentId !== null
            ? [
                supabase
                  .from("user_documents")
                  .delete()
                  .eq("id", createdDocumentId)
                  .then(({ error }) => {
                    if (error) throw error;
                  }),
              ]
            : []),
          ...storagePaths.map((storagePath) =>
            fetch(
              `/api/document-delete?storagePath=${encodeURIComponent(storagePath)}`,
              {
                method: "DELETE",
                headers: { Authorization: `Bearer ${uploadToken}` },
              },
            ).then((response) => {
              if (!response.ok)
                throw new Error(`Storage cleanup failed: ${response.status}`);
            }),
          ),
        ]);
        if (cleanupResults.some((result) => result.status === "rejected")) {
          console.error(
            "[upload] transaction upload rollback was incomplete",
            cleanupResults,
          );
        }
        queryClient.invalidateQueries({
          queryKey: ["user_documents", numericId],
        });
        queryClient.invalidateQueries({
          queryKey: ["statement_docs", numericId],
        });
      }
      setUploadError(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
    } finally {
      setUploadSaving(false);
    }
  }

  const docYears = useMemo(
    () =>
      [...new Set(docs.map((doc) => doc.taxYear).filter(Boolean) as string[])]
        .sort((a, b) => b.localeCompare(a)),
    [docs],
  );

  const docCategories = useMemo(() => {
    const categories = [
      ...new Set(docs.map((doc) => doc.category?.trim()).filter(Boolean) as string[]),
    ];
    return categories.sort((a, b) => {
      const aIndex = DOC_CATEGORY_ORDER.indexOf(a);
      const bIndex = DOC_CATEGORY_ORDER.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [docs]);

  const filteredDocs = useMemo(() => {
    const search = docSearch.trim().toLowerCase();
    return docs
      .filter((doc) => {
        const matchSearch =
          !search ||
          doc.title.toLowerCase().includes(search) ||
          doc.type.toLowerCase().includes(search) ||
          doc.category.toLowerCase().includes(search);
        const matchCategory =
          docCategory === "All" || doc.category === docCategory;
        const matchYear = docYear === "All" || doc.taxYear === docYear;
        return matchSearch && matchCategory && matchYear;
      })
      .sort((a, b) => {
        if (docSort === "oldest") {
          return a.createdAt.localeCompare(b.createdAt);
        }
        if (docSort === "name") return a.title.localeCompare(b.title);
        if (docSort === "size") {
          return b.size.localeCompare(a.size, undefined, { numeric: true });
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [docs, docSearch, docCategory, docYear, docSort]);

  // All statement tabs and the Dashboard use the same resolved source object.
  const pnlPeriods = resolvedStatements.pnlPeriods;
  const bsPeriods = resolvedStatements.balanceSheetPeriods;
  const cfPeriods = resolvedStatements.cashFlowPeriods;
  const hasPnlPeriodDocs = pnlPeriods.length > 0;
  const pnlSummary = resolvedStatements.pnl;
  const pnlChartData = useMemo(() => {
    if (!hasPnlPeriodDocs) {
      return trendData.map((d) => ({
        label: d.label,
        Revenue: d.revenue,
        Expenses: d.expenses,
        "Net Income": d.profit,
      }));
    }
    return [...pnlPeriods].reverse().map((p) => ({
      label: statementPeriodLabel(p),
      Revenue: p.pnl?.revenue ?? 0,
      Expenses: (p.pnl?.cogs ?? 0) + (p.pnl?.opex ?? 0),
      "Net Income": p.pnl?.netIncome ?? 0,
    }));
  }, [hasPnlPeriodDocs, pnlPeriods, trendData]);
  const financialTrendScale = useMemo(
    () =>
      getNiceTrendScale(trendData, [
        "revenue",
        "expenses",
        "netCash",
        "profit",
      ]),
    [trendData],
  );
  const pnlTrendScale = useMemo(
    () =>
      getNiceTrendScale(pnlChartData, ["Revenue", "Expenses", "Net Income"]),
    [pnlChartData],
  );
  const cashFlowTrendScale = useMemo(
    () =>
      getNiceTrendScale(
        trendData,
        cfShowPaid
          ? ["revenue", "netCash"]
          : ["revenue", "expenses", "netCash", "profit"],
      ),
    [cfShowPaid, trendData],
  );

  // Period-over-period growth % for Revenue, Expenses (COGS+Opex), and COGS
  // alone — computed strictly from the same uploaded/manual P&L statements
  // (chronological order), so it stays consistent with pnlChartData above.
  const pnlGrowthData = useMemo(() => {
    const chrono = [...pnlPeriods].reverse();
    const growthPct = (curr: number, prev: number) => {
      return compareValues(curr, prev).percent ?? 0;
    };
    if (!hasPnlPeriodDocs) {
      return trendData.map((d, i) => {
        const prev = i > 0 ? trendData[i - 1] : null;
        return {
          label: d.label,
          "Revenue Growth": prev
            ? Math.round(growthPct(d.revenue, prev.revenue) * 10) / 10
            : 0,
          "Expense Growth": prev
            ? Math.round(growthPct(d.expenses, prev.expenses) * 10) / 10
            : 0,
          "COGS Growth": 0,
        };
      });
    }
    return chrono.map((p, i) => {
      const prev = i > 0 ? chrono[i - 1] : null;
      const revenue = p.pnl?.revenue ?? 0;
      const expenses = (p.pnl?.cogs ?? 0) + (p.pnl?.opex ?? 0);
      const cogs = p.pnl?.cogs ?? 0;
      const prevRevenue = prev?.pnl?.revenue ?? 0;
      const prevExpenses = prev
        ? (prev.pnl?.cogs ?? 0) + (prev.pnl?.opex ?? 0)
        : 0;
      const prevCogs = prev?.pnl?.cogs ?? 0;
      return {
        label: statementPeriodLabel(p),
        "Revenue Growth": prev
          ? Math.round(growthPct(revenue, prevRevenue) * 10) / 10
          : 0,
        "Expense Growth": prev
          ? Math.round(growthPct(expenses, prevExpenses) * 10) / 10
          : 0,
        "COGS Growth": prev
          ? Math.round(growthPct(cogs, prevCogs) * 10) / 10
          : 0,
      };
    });
  }, [hasPnlPeriodDocs, pnlPeriods, trendData]);

  const bsLatest = resolvedStatements.balanceSheetPeriod;
  const hasBsPeriodDocs = bsPeriods.length > 0;
  const transactionAssetEstimate = transactionBs.totalAssets;
  const transactionLiabilityEstimate = transactionBs.totalLiabilities;
  const transactionEquityEstimate = transactionBs.equity;
  const bsSummary = {
    totalAssets: resolvedStatements.balanceSheet.totalAssets,
    totalLiabilities: resolvedStatements.balanceSheet.totalLiabilities,
    totalEquity: resolvedStatements.balanceSheet.equity,
    count: bsPeriods.length || allTxsFull.length,
  };
  const bsChartData = useMemo(() => {
    if (!hasBsPeriodDocs) {
      return [
        {
          label: end.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          Assets: transactionAssetEstimate,
          Liabilities: transactionLiabilityEstimate,
          Equity: transactionEquityEstimate,
        },
      ];
    }
    return [...bsPeriods].reverse().map((p) => ({
      label: statementPeriodLabel(p),
      Assets: p.bs?.totalAssets ?? 0,
      Liabilities: p.bs?.totalLiabilities ?? 0,
      Equity: p.bs?.equity ?? 0,
    }));
  }, [
    bsPeriods,
    end,
    hasBsPeriodDocs,
    transactionAssetEstimate,
    transactionEquityEstimate,
    transactionLiabilityEstimate,
  ]);
  const effectiveBs = resolvedStatements.balanceSheet;
  const cfSummary = {
    totalOperating: resolvedStatements.cashFlow.operating,
    totalInvesting: resolvedStatements.cashFlow.investing,
    totalFinancing: resolvedStatements.cashFlow.financing,
    netChange: resolvedStatements.cashFlow.netChange,
    count: resolvedStatements.cashFlow.count,
  };
  const effectiveCf: CashFlowEstimate = {
    operating: resolvedStatements.cashFlow.operating,
    investing: resolvedStatements.cashFlow.investing,
    financing: resolvedStatements.cashFlow.financing,
    netChange: resolvedStatements.cashFlow.netChange,
  };
  const cfChartData = useMemo(
    () =>
      [...cfPeriods].reverse().map((p) => ({
        label: statementPeriodLabel(p),
        Operating: p.cf?.operating ?? 0,
        Investing: p.cf?.investing ?? 0,
        Financing: p.cf?.financing ?? 0,
        "Net Change": p.cf?.netChange ?? 0,
      })),
    [cfPeriods],
  );

  const cfGrowthData = useMemo(() => {
    const chrono = [...cfPeriods].reverse();
    const growthPct = (curr: number, prev: number) => {
      return compareValues(curr, prev).percent ?? 0;
    };
    return chrono.map((p, i) => {
      const prev = i > 0 ? chrono[i - 1] : null;
      const operating = p.cf?.operating ?? 0;
      const financing = p.cf?.financing ?? 0;
      const netChange = p.cf?.netChange ?? 0;
      const prevOperating = prev?.cf?.operating ?? 0;
      const prevFinancing = prev?.cf?.financing ?? 0;
      const prevNetChange = prev?.cf?.netChange ?? 0;
      return {
        label: statementPeriodLabel(p),
        "Operating Growth": prev
          ? Math.round(growthPct(operating, prevOperating) * 10) / 10
          : 0,
        "Financing Growth": prev
          ? Math.round(growthPct(financing, prevFinancing) * 10) / 10
          : 0,
        "Net Change Growth": prev
          ? Math.round(growthPct(netChange, prevNetChange) * 10) / 10
          : 0,
      };
    });
  }, [cfPeriods]);

  // ── Transaction-derived Cash Flow growth (from shared trendData / txs pipeline) ──
  // Summary totals come from `income`, `expenses`, `netIncome` (same source as Dashboard),
  // and the trend chart uses the shared `trendData` so numbers always match.
  const cfTrendGrowth = useMemo(() => {
    const growthPct = (curr: number, prev: number) => {
      return compareValues(curr, prev).percent ?? 0;
    };
    return trendData.map((d, i) => {
      const prev = i > 0 ? trendData[i - 1] : null;
      return {
        label: d.label,
        "Income Growth": prev
          ? Math.round(growthPct(d.revenue, prev.revenue) * 10) / 10
          : 0,
        "Expense Growth": prev
          ? Math.round(growthPct(d.expenses, prev.expenses) * 10) / 10
          : 0,
        "Net Cash Growth": prev
          ? Math.round(growthPct(d.netCash, prev.netCash) * 10) / 10
          : 0,
      };
    });
  }, [trendData]);

  // Key insights
  const insights: string[] = [];
  if (txs.length > 0) {
    insights.push(`Net income is ${fmt(netIncome)}`);
    if (netIncome >= 0)
      insights.push(`Income exceeded expenses by ${fmt(netIncome)}`);
    else
      insights.push(`Expenses exceeded income by ${fmt(Math.abs(netIncome))}`);
    insights.push(
      `Equity ${equity > 0 ? "increased" : "unchanged"} ${pctLabel(changePct(equity, equity * 0.9))}`,
    );
    insights.push(
      `${cfNetCash >= 0 ? "Positive" : "Negative"} cash flow of ${fmt(Math.abs(cfNetCash))}`,
    );
    if (expenses > 0)
      insights.push(`You have ${fmt(expenses)} in potential deductions`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="-mt-2 min-w-0 space-y-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Flutter-style Tab Bar ── */}
      <div
        className="-mx-3 mb-6 flex items-stretch overflow-x-auto px-0 sm:-mx-6"
        style={{
          height: 58,
          borderBottom: "1px solid rgba(18,52,105,0.6)",
          background: "hsl(var(--background))",
        }}
      >
        {TAB_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="min-h-11 min-w-[112px] px-3 sm:min-w-0"
            style={{
              flex: 1,
              borderBottom:
                tab === key ? "2px solid #FFC72B" : "2px solid transparent",
              color:
                tab === key
                  ? "hsl(var(--foreground))"
                  : "hsl(var(--muted-foreground))",
              fontWeight: tab === key ? 600 : 500,
              fontSize: 13,
              background: "transparent",
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Dashboard tab ── */}
      {tab !== "transactions" &&
        (currentFinancialReport.unclassifiedAmount > 0 ||
          excludedUnscopedStatementCount > 0) && (
          <div className="mb-5 grid gap-2 md:grid-cols-2">
            {currentFinancialReport.unclassifiedAmount > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs md:col-span-2">
                <span className="font-medium text-amber-300">
                  Unclassified activity:
                </span>{" "}
                {fmt(currentFinancialReport.unclassifiedAmount)} across{" "}
                {currentFinancialReport.unclassifiedTransactionIds.length}{" "}
                transaction(s). These amounts were not forced into a statement
                line.
              </div>
            )}
            {excludedUnscopedStatementCount > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs md:col-span-2">
                <span className="font-medium text-amber-300">
                  Organization safety:
                </span>{" "}
                {excludedUnscopedStatementCount} legacy uploaded statement
                {excludedUnscopedStatementCount === 1 ? "" : "s"} without an
                organization assignment{" "}
                {excludedUnscopedStatementCount === 1 ? "was" : "were"} excluded
                to prevent cross-organization mixing.
              </div>
            )}
          </div>
        )}

      {tab === "dashboard" && (
        <div className="space-y-6">
          {/* Title + period filter */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Financial Dashboard</h1>
              <p className="text-sm text-muted-foreground">{periodLabel}</p>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {PERIOD_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPeriod(key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                    period === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* ── KPI row ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Business Health Score */}
                <Card className="border-primary/20 bg-gradient-to-b from-card to-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground">
                      Business Health Score
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center gap-1 pb-4">
                    <BHSGauge score={bhs} />
                    <p className="text-xs text-muted-foreground">
                      {end.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </CardContent>
                </Card>

                {/* Net Income */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground">
                      Net Income (Profit)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-4">
                    <p
                      className={`text-2xl font-bold ${overviewNetIncome >= 0 ? "text-foreground" : "text-rose-400"}`}
                    >
                      {fmt(overviewNetIncome)}
                    </p>
                    <div className="flex items-center gap-2">
                      <ChangeBadge
                        curr={overviewNetIncome}
                        prev={hasPriorComparison ? prevNet : null}
                      />
                      <span className="text-xs text-muted-foreground">
                        {comparisonCaption}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Total Assets */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground">
                      Total Assets
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-4">
                    <p className="text-2xl font-bold">{fmt(totalAssets)}</p>
                    <div className="flex items-center gap-2">
                      <ChangeBadge
                        curr={totalAssets}
                        prev={hasPriorComparison ? previousTotalAssets : null}
                      />
                      <span className="text-xs text-muted-foreground">
                        {comparisonCaption}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Cash Flow */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground">
                      Cash Flow (Net Cash)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-4">
                    <p
                      className={`text-2xl font-bold ${allTimeCfNet >= 0 ? "text-foreground" : "text-rose-400"}`}
                    >
                      {fmt(allTimeCfNet)}
                    </p>
                    <div className="flex items-center gap-2">
                      <ChangeBadge
                        curr={allTimeCfNet}
                        prev={hasPriorComparison ? prevCfNet : null}
                      />
                      <span className="text-xs text-muted-foreground">
                        {comparisonCaption}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ── Business Overview ── */}
              <div>
                <h2 className="text-base font-bold mb-3">Business Overview</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {/* P&L Overview */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">
                        Profit &amp; Loss Overview
                      </CardTitle>
                      <p className="text-[10px] text-muted-foreground">
                        {periodLabel}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-2 pb-3">
                      {[
                        {
                          label: "Income",
                          val: overviewIncome,
                          prev: prevIncome,
                          positiveIsGood: true,
                        },
                        {
                          label: "Expenses",
                          val: overviewExpenses,
                          prev: prevExpenses,
                          positiveIsGood: false,
                        },
                        {
                          label: "Net Income",
                          val: overviewNetIncome,
                          prev: prevNet,
                          positiveIsGood: true,
                        },
                      ].map((r) => (
                        <div
                          key={r.label}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-muted-foreground">
                            {r.label}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{fmt(r.val)}</span>
                            <ChangeBadge
                              curr={r.val}
                              prev={hasPriorComparison ? r.prev : null}
                              positiveIsGood={r.positiveIsGood}
                            />
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">% Margin</span>
                        <span className="font-semibold text-primary">
                          {overviewMargin.toFixed(1)}%
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setPlPeriod(period);
                          setTab("pl");
                        }}
                        className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                      >
                        View Profit &amp; Loss{" "}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </CardContent>
                  </Card>

                  {/* Balance Sheet */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">
                        Balance Sheet Overview
                      </CardTitle>
                      <p className="text-[10px] text-muted-foreground">
                        As of{" "}
                        {balanceSheetAsOf.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-2 pb-3">
                      {[
                        { label: "Total Assets", val: totalAssets },
                        { label: "Total Liabilities", val: totalLiabilities },
                        { label: "Equity", val: equity },
                      ].map((r) => (
                        <div
                          key={r.label}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-muted-foreground">
                            {r.label}
                          </span>
                          <span className="font-semibold">{fmt(r.val)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">
                          Debt-to-Equity
                        </span>
                        <span className="font-semibold">
                          {debtToEquity.toFixed(2)}
                        </span>
                      </div>
                      <button
                        onClick={() => setTab("bs")}
                        className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                      >
                        View Balance Sheet <ArrowRight className="h-3 w-3" />
                      </button>
                    </CardContent>
                  </Card>

                  {/* Cash Flow */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">
                        Cash Flow Overview
                      </CardTitle>
                      <p className="text-[10px] text-muted-foreground">
                        {periodLabel}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-2 pb-3">
                      {[
                        {
                          label: "Money In",
                          val: allTimeCfIn,
                          prev: prevCfIn,
                          positiveIsGood: true,
                        },
                        {
                          label: "Money Out",
                          val: allTimeCfOut,
                          prev: prevCfOut,
                          positiveIsGood: false,
                        },
                        {
                          label: "Net Cash",
                          val: allTimeCfNet,
                          prev: prevCfNet,
                          positiveIsGood: true,
                        },
                      ].map((r) => (
                        <div
                          key={r.label}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-muted-foreground">
                            {r.label}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{fmt(r.val)}</span>
                            <ChangeBadge
                              curr={r.val}
                              prev={hasPriorComparison ? r.prev : null}
                              positiveIsGood={r.positiveIsGood}
                            />
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">
                          Cash Flow Trend
                        </span>
                        <span
                          className={`font-semibold ${allTimeCfNet >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                        >
                          {allTimeCfNet >= 0 ? "Positive" : "Negative"}
                        </span>
                      </div>
                      <button
                        onClick={() => setTab("cf")}
                        className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                      >
                        View Cash Flow <ArrowRight className="h-3 w-3" />
                      </button>
                    </CardContent>
                  </Card>

                  {/* AI Deduction Optimization */}
                  <Card className="border-primary/20 bg-gradient-to-b from-card to-primary/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" /> AI
                        Deduction Optimization
                      </CardTitle>
                      <p className="text-[10px] text-muted-foreground">
                        Deduction Optimization Level
                      </p>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <div className="flex items-center gap-3">
                        <CircularGauge pct={aiOptimizationPct} size={85} />
                        <div className="space-y-2 flex-1">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                              Additional Tax Deductions Found
                            </p>
                            <p className="text-sm font-bold text-primary">
                              {aiStrategiesLoading
                                ? "$ ---"
                                : aiStrategySummary.hasGenerated
                                  ? fmt(aiStrategySummary.totalAdditionalDeductions)
                                  : "$ ---"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                              Potential Tax Savings
                            </p>
                            <p className="text-sm font-bold text-emerald-400">
                              {!aiStrategiesLoading &&
                              aiStrategySummary.hasGenerated &&
                              aiStrategySummary.totalSavings > 0
                                ? fmt(aiStrategySummary.totalSavings)
                                : "$ ---"}
                            </p>
                          </div>
                        </div>
                      </div>
                      {aiOptimizationPct < 80 && (
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {100 - aiOptimizationPct}% of deductions not yet
                          utilized.
                        </p>
                      )}
                      <button
                        onClick={() => navigate("/user/ai-strategy")}
                        className="flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                      >
                        View AI Activity <ArrowRight className="h-3 w-3" />
                      </button>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* ── Financial Trend + Key Insights ── */}
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Chart — 2/3 width */}
                <Card
                  className="lg:col-span-2 shadow-none"
                  style={trendChartPanelStyle}
                >
                  <CardHeader className="pb-0 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold text-[#DCE8FF]">
                      Financial Trend
                    </CardTitle>
                    <p className="text-[10px] text-[#8EA5D2]">
                      {financialTrendScale.topLabel}
                    </p>
                  </CardHeader>
                  <CardContent className="pb-3 px-4 pt-0">
                    {trendData.length === 0 ? (
                      <div className="flex items-center justify-center h-[220px]">
                        <p className="text-sm text-muted-foreground">
                          No data for this period
                        </p>
                      </div>
                    ) : (
                      <>
                        <ResponsiveContainer width="100%" height={220}>
                          <ComposedChart
                            data={trendData}
                            margin={{ top: 34, right: 0, left: -16, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient
                                id="dashRevBar"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#20C987"
                                  stopOpacity={1}
                                />
                                <stop
                                  offset="100%"
                                  stopColor="#159F70"
                                  stopOpacity={1}
                                />
                              </linearGradient>
                              <linearGradient
                                id="dashExpBar"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#3B8CFF"
                                  stopOpacity={1}
                                />
                                <stop
                                  offset="100%"
                                  stopColor="#2163C9"
                                  stopOpacity={1}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              vertical={false}
                              stroke={trendChartGrid}
                            />
                            <XAxis
                              dataKey="label"
                              tick={trendAxisTick}
                              tickLine={false}
                              axisLine={false}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              tick={trendAxisTick}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={fmtTrendTick}
                              ticks={financialTrendScale.ticks}
                              domain={financialTrendScale.domain}
                              width={58}
                            />
                            <Tooltip
                              contentStyle={trendTooltipStyle}
                              labelStyle={{ color: "#EAF2FF" }}
                              itemStyle={{ color: "#EAF2FF" }}
                              formatter={(v: number) => fmt(v)}
                            />
                            <Bar
                              dataKey="revenue"
                              name="Revenue"
                              fill="url(#dashRevBar)"
                              radius={[4, 4, 0, 0]}
                              barSize={18}
                            />
                            <Bar
                              dataKey="expenses"
                              name="Expenses"
                              fill="url(#dashExpBar)"
                              radius={[4, 4, 0, 0]}
                              barSize={18}
                            />
                            <Line
                              type="monotone"
                              dataKey="netCash"
                              name="Net Cash"
                              stroke="#FFC72B"
                              strokeWidth={2}
                              dot={{
                                r: 3,
                                fill: "#FFC72B",
                                stroke: "#061f49",
                                strokeWidth: 1,
                              }}
                              activeDot={{ r: 4, fill: "#FFC72B" }}
                            />
                            <Line
                              type="monotone"
                              dataKey="profit"
                              name="Profit"
                              stroke="#F3F7FF"
                              strokeWidth={2.5}
                              dot={{
                                r: 3,
                                fill: "#F3F7FF",
                                stroke: "#061f49",
                                strokeWidth: 1,
                              }}
                              activeDot={{ r: 5, fill: "#F3F7FF" }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                        <div className="flex items-center gap-4 justify-center mt-0 pb-1">
                          <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                            <span
                              className="h-2.5 w-2.5 rounded-full inline-block"
                              style={{ background: "#20C987" }}
                            />
                            Revenue
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                            <span
                              className="h-2.5 w-2.5 rounded-full inline-block"
                              style={{ background: "#2B7FFF" }}
                            />
                            Expenses
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                            <span
                              className="inline-block w-5 border-t-2 mb-0.5"
                              style={{ borderColor: "#FFC72B" }}
                            />
                            Net Cash
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                            <span
                              className="inline-block w-5 border-t-2 mb-0.5"
                              style={{ borderColor: "#F3F7FF" }}
                            />
                            Profit
                          </span>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Key Financial Insights — 1/3 width */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">
                      Key Financial Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-4">
                    {txs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No data for this period. Upload and approve bank
                        statements to see insights.
                      </p>
                    ) : (
                      insights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                          <p className="text-sm text-muted-foreground">
                            {insight}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ── Business Health Summary banner ── */}
              <div
                className="rounded-xl border border-border px-6 py-4 text-center"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)))",
                }}
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                  Business Health Summary
                </p>
                <p className="text-sm font-bold text-foreground">
                  {overviewNetIncome >= 0
                    ? "Your business is in strong financial condition."
                    : "Your business needs attention — expenses are exceeding income."}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {allTimeCfNet >= 0
                    ? "Cash inflows are exceeding outflows and revenue expenses. Financial health improved vs previous period."
                    : "Review your expenses and consider optimising your deductions with the AI Strategy tools."}
                </p>
              </div>

              {/* ── Bottom shortcut row ── */}
              <div
                className="grid grid-cols-2 gap-0 rounded-xl overflow-hidden border border-border md:grid-cols-4"
                style={{ background: "hsl(var(--muted))" }}
              >
                {[
                  {
                    label: "Transactions",
                    action: () => setTab("transactions"),
                  },
                  {
                    label: "Dun & Bradstreet",
                    action: () => navigate("/user"),
                  },
                  { label: "Reports", action: () => navigate("/user/tax") },
                  {
                    label: "Accounts",
                    action: () => setShowAccountsDialog(true),
                  },
                ].map((item, i) => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="py-4 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    style={{
                      borderLeft:
                        i > 0 ? "1px solid rgba(18,52,105,0.6)" : undefined,
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── P&L tab — segregated data source: official uploaded/manual P&L documents only ── */}
      {tab === "pl" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Profit &amp; Loss</h1>
              <p className="text-xs text-muted-foreground">{periodLabel}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="border-border/60 text-muted-foreground hover:bg-secondary/50 gap-1.5 text-xs h-8"
                onClick={() => {
                  setExportType("pl");
                  setShowExport(true);
                }}
              >
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-8"
                onClick={() => setShowDocs(true)}
              >
                <Upload className="h-3.5 w-3.5" /> Upload
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {PERIOD_LABELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPlPeriod(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  plPeriod === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setPlPeriod("custom")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                plPeriod === "custom"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              Custom
            </button>
          </div>
          {plPeriod === "custom" && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">From</label>
                <input
                  type="date"
                  value={plCustomStart}
                  onChange={(e) => setPlCustomStart(e.target.value)}
                  className="rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/60"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">To</label>
                <input
                  type="date"
                  value={plCustomEnd}
                  onChange={(e) => setPlCustomEnd(e.target.value)}
                  className="rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/60"
                />
              </div>
            </div>
          )}
          {statementsLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* ── 4 KPI cards (Flutter style) ── */}
              {(() => {
                const income = pnlSummary.totalRevenue;
                const expenses = pnlSummary.totalExpenses;
                const grossProfit = income - pnlSummary.totalCogs;
                const margin = income > 0 ? (grossProfit / income) * 100 : 0;
                const kpis = [
                  {
                    label: "Income",
                    value: fmt(income),
                    color: "#22c55e",
                    badge: "Prev",
                    up: true,
                    sub: "Upcoming Prediction",
                  },
                  {
                    label: "Expenses",
                    value: fmt(expenses),
                    color: "#f97316",
                    badge: "Prev",
                    up: false,
                    sub: "Upcoming Prediction",
                  },
                  {
                    label: "Gross Profit",
                    value: fmt(grossProfit),
                    color: grossProfit >= 0 ? "#22c55e" : "#ef4444",
                    badge: "Prev",
                    up: grossProfit >= 0,
                    sub: "Upcoming Prediction",
                  },
                  {
                    label: "% Margin",
                    value: `${margin.toFixed(1)}%`,
                    color: margin >= 0 ? "#22c55e" : "#ef4444",
                    badge: "Max",
                    up: margin >= 0,
                    sub: "vs previous 6 months",
                  },
                ];
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {kpis.map((k) => (
                      <div
                        key={k.label}
                        className="rounded-xl border border-border px-4 py-4 flex flex-col gap-2"
                        style={{
                          background:
                            "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))",
                        }}
                      >
                        <p className="text-[11px] text-muted-foreground text-center font-medium">
                          {k.label}
                        </p>
                        <p className="text-xl font-bold text-foreground text-center truncate">
                          {k.value}
                        </p>
                        <div className="flex items-center justify-between gap-1 mt-auto">
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{
                              background: k.up
                                ? "rgba(34,197,94,0.15)"
                                : "rgba(239,68,68,0.15)",
                              color: k.up ? "#22c55e" : "#ef4444",
                            }}
                          >
                            {k.up ? "▲" : "▼"} {k.badge}
                          </span>
                          <span className="text-[9px] text-muted-foreground text-right leading-tight">
                            {k.sub}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── P & L Trends (area chart) ── */}
              <Card className="shadow-none" style={trendChartPanelStyle}>
                <CardHeader className="pb-0 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold text-[#DCE8FF]">
                        P &amp; L Trends
                      </CardTitle>
                      <p className="text-[10px] text-[#8EA5D2] mt-0.5">
                        {pnlTrendScale.topLabel}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="text-[10px] font-medium text-[#8EA5D2] border border-[#2B7FFF]/35 rounded px-2 py-1 hover:text-[#EAF2FF] transition-colors">
                        Filter +
                      </button>
                      <label className="flex items-center gap-1 text-[10px] text-[#8EA5D2] cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-3 w-3 accent-primary"
                        />
                        at prior month
                      </label>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="h-[260px] pt-0 px-4 pb-3">
                  {pnlChartData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground text-center">
                        No P&amp;L statements yet.
                        <br />
                        Upload a document to see trends.
                      </p>
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => setShowDocs(true)}
                      >
                        <Upload className="h-3.5 w-3.5" /> Upload Statement
                      </Button>
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={220}>
                        <ComposedChart
                          data={pnlChartData}
                          margin={{ top: 34, right: 0, left: -16, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="plRevBar"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="#20C987"
                                stopOpacity={1}
                              />
                              <stop
                                offset="100%"
                                stopColor="#159F70"
                                stopOpacity={1}
                              />
                            </linearGradient>
                            <linearGradient
                              id="plExpBar"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="#3B8CFF"
                                stopOpacity={1}
                              />
                              <stop
                                offset="100%"
                                stopColor="#2163C9"
                                stopOpacity={1}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            vertical={false}
                            stroke={trendChartGrid}
                          />
                          <XAxis
                            dataKey="label"
                            tick={trendAxisTick}
                            axisLine={false}
                            tickLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            tick={trendAxisTick}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={fmtTrendTick}
                            ticks={pnlTrendScale.ticks}
                            domain={pnlTrendScale.domain}
                            width={58}
                          />
                          <Tooltip
                            contentStyle={trendTooltipStyle}
                            labelStyle={{ color: "#EAF2FF" }}
                            itemStyle={{ color: "#EAF2FF" }}
                            formatter={(v: number) => fmt(v)}
                          />
                          <Bar
                            dataKey="Revenue"
                            name="Revenue"
                            fill="url(#plRevBar)"
                            radius={[4, 4, 0, 0]}
                            barSize={18}
                          />
                          <Bar
                            dataKey="Expenses"
                            name="Expenses"
                            fill="url(#plExpBar)"
                            radius={[4, 4, 0, 0]}
                            barSize={18}
                          />
                          <Line
                            type="monotone"
                            dataKey="Net Income"
                            name="Net Income"
                            stroke="#F3F7FF"
                            strokeWidth={2.5}
                            dot={{
                              r: 3,
                              fill: "#F3F7FF",
                              stroke: "#061f49",
                              strokeWidth: 1,
                            }}
                            activeDot={{ r: 5, fill: "#F3F7FF" }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                      <div className="flex items-center gap-4 justify-center mt-0">
                        <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                          <span
                            className="h-2.5 w-2.5 rounded-full inline-block"
                            style={{ background: "#20C987" }}
                          />
                          Revenue
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                          <span
                            className="h-2.5 w-2.5 rounded-full inline-block"
                            style={{ background: "#2B7FFF" }}
                          />
                          Expenses
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                          <span
                            className="inline-block w-5 border-t-2 mb-0.5"
                            style={{ borderColor: "#F3F7FF" }}
                          />
                          Net Income
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* ── Growth charts (side by side) ── */}
              {pnlChartData.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card
                    style={{
                      background:
                        "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))",
                      border: "1px solid rgba(18,52,105,0.5)",
                    }}
                  >
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm font-semibold">
                        Revenue Growth vs Expense Growth
                      </CardTitle>
                      <p className="text-[10px] text-muted-foreground">
                        {periodLabel}
                      </p>
                    </CardHeader>
                    <CardContent className="h-[200px] pt-2">
                      {pnlGrowthData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={pnlGrowthData}
                            margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                          >
                            <defs>
                              <linearGradient
                                id="rgRevGrad"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="5%"
                                  stopColor="#38bdf8"
                                  stopOpacity={0.3}
                                />
                                <stop
                                  offset="95%"
                                  stopColor="#38bdf8"
                                  stopOpacity={0}
                                />
                              </linearGradient>
                              <linearGradient
                                id="rgExpGrad"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="5%"
                                  stopColor="#f472b6"
                                  stopOpacity={0.25}
                                />
                                <stop
                                  offset="95%"
                                  stopColor="#f472b6"
                                  stopOpacity={0}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="rgba(255,255,255,0.06)"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="label"
                              tick={{
                                fontSize: 10,
                                fill: "hsl(var(--muted-foreground))",
                              }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{
                                fontSize: 10,
                                fill: "hsl(var(--muted-foreground))",
                              }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v) => `${v}%`}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "hsl(var(--muted))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: 8,
                                fontSize: 11,
                              }}
                              formatter={(v: number) => `${v.toFixed(1)}%`}
                            />
                            <Legend
                              wrapperStyle={{
                                fontSize: 11,
                                color: "hsl(var(--muted-foreground))",
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="Revenue Growth"
                              stroke="#38bdf8"
                              strokeWidth={2}
                              fill="url(#rgRevGrad)"
                              dot={false}
                            />
                            <Area
                              type="monotone"
                              dataKey="Expense Growth"
                              stroke="#f472b6"
                              strokeWidth={2}
                              fill="url(#rgExpGrad)"
                              dot={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-xs text-muted-foreground text-center px-4">
                            Upload another P&amp;L statement to see growth
                            trends.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card
                    style={{
                      background:
                        "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))",
                      border: "1px solid rgba(18,52,105,0.5)",
                    }}
                  >
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm font-semibold">
                        COGS Growth vs Revenue Growth
                      </CardTitle>
                      <p className="text-[10px] text-muted-foreground">
                        {periodLabel}
                      </p>
                    </CardHeader>
                    <CardContent className="h-[200px] pt-2">
                      {pnlGrowthData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={pnlGrowthData}
                            margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                          >
                            <defs>
                              <linearGradient
                                id="cgRevGrad"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="5%"
                                  stopColor="#FFC72B"
                                  stopOpacity={0.25}
                                />
                                <stop
                                  offset="95%"
                                  stopColor="#FFC72B"
                                  stopOpacity={0}
                                />
                              </linearGradient>
                              <linearGradient
                                id="cgCogsGrad"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="5%"
                                  stopColor="#22c55e"
                                  stopOpacity={0.3}
                                />
                                <stop
                                  offset="95%"
                                  stopColor="#22c55e"
                                  stopOpacity={0}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="rgba(255,255,255,0.06)"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="label"
                              tick={{
                                fontSize: 10,
                                fill: "hsl(var(--muted-foreground))",
                              }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{
                                fontSize: 10,
                                fill: "hsl(var(--muted-foreground))",
                              }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v) => `${v}%`}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "hsl(var(--muted))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: 8,
                                fontSize: 11,
                              }}
                              formatter={(v: number) => `${v.toFixed(1)}%`}
                            />
                            <Legend
                              wrapperStyle={{
                                fontSize: 11,
                                color: "hsl(var(--muted-foreground))",
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="Revenue Growth"
                              stroke="#FFC72B"
                              strokeWidth={2}
                              fill="url(#cgRevGrad)"
                              dot={false}
                            />
                            <Area
                              type="monotone"
                              dataKey="COGS Growth"
                              stroke="#22c55e"
                              strokeWidth={2}
                              fill="url(#cgCogsGrad)"
                              dot={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-xs text-muted-foreground text-center px-4">
                            Upload another P&amp;L statement to see COGS trends.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ── Recently Uploaded list ── */}
              {pnlPeriods.length > 0 ? (
                <div>
                  <h2 className="text-sm font-semibold text-foreground mb-3">
                    Recently Uploaded
                  </h2>
                  <div className="space-y-2">
                    {pnlPeriods.map((p, i) => (
                      <div
                        key={`${p.docId}-${i}`}
                        className="flex items-center gap-3 rounded-xl border border-border px-4 py-3"
                        style={{
                          background:
                            "linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)))",
                        }}
                      >
                        <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <FileText
                            className="h-4.5 w-4.5 text-primary"
                            style={{ height: 18, width: 18 }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {p.docName}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Profit &amp; Loss · {statementPeriodLabel(p)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-muted-foreground">
                            {p.pnl ? fmt(p.pnl.revenue) : "—"}
                          </span>
                          <button className="text-[10px] font-bold text-muted-foreground border border-border rounded px-2 py-1 hover:text-foreground transition-colors">
                            VIEW
                          </button>
                          <span
                            className="inline-flex items-center justify-center h-6 w-6 rounded text-[10px] font-bold"
                            style={{
                              background:
                                p.source === "manual"
                                  ? "rgba(59,130,246,0.2)"
                                  : "rgba(239,68,68,0.2)",
                              color:
                                p.source === "manual" ? "#60a5fa" : "#f87171",
                            }}
                          >
                            {p.source === "manual" ? "M" : "U"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-xl border border-dashed border-border py-14 flex flex-col items-center text-center gap-3"
                  style={{
                    background:
                      "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))",
                  }}
                >
                  <FileText className="h-10 w-10 text-muted-foreground/60" />
                  <div>
                    <p className="font-medium text-foreground">
                      No P&amp;L statements yet
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Upload a Profit &amp; Loss document to see it here.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="mt-2 gap-1.5"
                    onClick={() => setShowDocs(true)}
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload Statement
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Balance Sheet tab ── */}
      {tab === "bs" && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">Balance Sheet</h1>
              <p className="text-xs text-muted-foreground">
                Snapshot as of{" "}
                {balanceSheetAsOf.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              {!hasBsPeriodDocs && (
                <p className="text-xs text-[#FFC72B] mt-1">
                  Estimated from transactions. Upload a Balance Sheet for full
                  assets, liabilities, equity, and ratios.
                </p>
              )}
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
              <span className="w-full text-xs text-muted-foreground sm:mr-1 sm:w-auto">
                As Of Date:{" "}
                <strong className="text-foreground">
                  {balanceSheetAsOf.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </strong>{" "}
                📅
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-11 flex-1 gap-1.5 border-border/60 text-xs text-muted-foreground hover:bg-secondary/50 sm:h-8 sm:flex-none"
                onClick={() => {
                  setExportType("bs");
                  setShowExport(true);
                }}
              >
                <Download className="h-3.5 w-3.5" /> EXPORT
              </Button>
              <Button
                size="sm"
                className="h-11 flex-1 gap-1.5 bg-primary text-xs text-primary-foreground hover:bg-primary/90 sm:h-8 sm:flex-none"
                onClick={() => setShowDocs(true)}
              >
                <Upload className="h-3.5 w-3.5" /> UPLOAD
              </Button>
            </div>
          </div>

          {statementsLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* ── Top 3 KPI cards ── */}
              {(() => {
                const asOfLabel = balanceSheetAsOf.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
                const kpis = [
                  {
                    label: "Total Assets",
                    value: fmt(bsSummary.totalAssets),
                    tooltip: null as string | null,
                  },
                  {
                    label: "Total Liabilities",
                    value: fmt(bsSummary.totalLiabilities),
                    tooltip:
                      "Debt / Equity Ratio\nHow much you owe vs what you own.\n• Good: Below 1\n• Strong: Below 0.5\n• Watch out: Above 2 means heavy reliance on debt.",
                  },
                  {
                    label: "Equity",
                    value: fmt(bsSummary.totalEquity),
                    tooltip: null,
                  },
                ];
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {kpis.map((k) => (
                      <div
                        key={k.label}
                        className="rounded-xl border border-border px-5 py-5 flex flex-col gap-2"
                        style={{
                          background:
                            "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))",
                        }}
                      >
                        <p className="text-[11px] text-muted-foreground text-center font-medium">
                          {k.label}
                        </p>
                        <p className="text-2xl font-bold text-foreground text-center">
                          {k.value}
                        </p>
                        <div className="flex items-center justify-center gap-2 mt-1">
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{
                              background: "rgba(34,197,94,0.15)",
                              color: "#22c55e",
                            }}
                          >
                            ▲ 0.0%
                          </span>
                          <span className="text-[9px] text-muted-foreground">
                            vs previous month
                          </span>
                          {k.tooltip && (
                            <div className="group relative" tabIndex={0}>
                              <Info className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-help" />
                              <div
                                className="absolute bottom-full right-0 z-50 mb-2 hidden w-52 max-w-[calc(100vw-2rem)] rounded-lg border border-border p-3 shadow-2xl group-focus-within:block group-hover:block"
                                style={{ background: "hsl(var(--muted))" }}
                              >
                                {k.tooltip.split("\n").map((line, i) => (
                                  <p
                                    key={i}
                                    className={`text-[11px] leading-relaxed ${i === 0 ? "font-semibold text-foreground mb-1" : "text-muted-foreground"}`}
                                  >
                                    {line}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── Secondary 4-card metrics row with ⓘ hover tooltips ── */}
              {effectiveBs &&
                (() => {
                  const bs = effectiveBs;
                  const currentRatio = !hasBsPeriodDocs
                    ? currentFinancialReport.ratios.currentRatio
                    : bs.currentLiabilities !== 0
                      ? bs.currentAssets / bs.currentLiabilities
                      : null;
                  const quickRatio = !hasBsPeriodDocs
                    ? currentFinancialReport.ratios.quickRatio
                    : null;
                  const debtEquity = !hasBsPeriodDocs
                    ? currentFinancialReport.ratios.debtToEquity
                    : bs.equity !== 0
                      ? bs.totalLiabilities / bs.equity
                      : null;
                  const roe = hasBsPeriodDocs
                    ? bs.equity !== 0
                      ? (netIncome / bs.equity) * 100
                      : null
                    : currentFinancialReport.ratios.roePct;
                  const debtEquityDisplay = debtEquity ?? 0;
                  const roeDisplay = roe ?? 0;
                  const metrics = [
                    {
                      label: "Current Ratio",
                      value:
                        currentRatio !== null ? currentRatio.toFixed(2) : "N/A",
                      tip: "Current Ratio\nMeasures ability to pay short-term obligations.\n• Good: Above 2\n• Acceptable: 1–2\n• Watch out: Below 1",
                    },
                    {
                      label: "Debt / Equity Ratio",
                      value:
                        debtEquity !== null
                          ? debtEquityDisplay.toFixed(2)
                          : "N/A",
                      tip: "Debt / Equity Ratio\nHow much you owe vs what you own.\n• Good: Below 1\n• Strong: Below 0.5\n• Watch out: Above 2 means heavy reliance on debt.",
                    },
                    {
                      label: "Return on Equity (ROE)",
                      value: roe !== null ? `${roeDisplay.toFixed(1)}%` : "N/A",
                      tip: "Return on Equity\nMeasures profitability relative to equity.\n• Good: Above 15%\n• Strong: Above 20%",
                    },
                    {
                      label: "Quick Ratio",
                      value:
                        quickRatio !== null ? quickRatio.toFixed(2) : "N/A",
                      tip: "Quick Ratio\nCash, receivables, and short-term investments divided by current liabilities.",
                    },
                  ];
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {metrics.map((m) => (
                        <div
                          key={m.label}
                          className="rounded-xl border border-border px-4 py-4 flex flex-col gap-2"
                          style={{
                            background:
                              "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] text-muted-foreground font-medium">
                              {m.label}
                            </p>
                            <div className="group relative flex-shrink-0" tabIndex={0}>
                              <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                              <div
                                className="absolute bottom-full right-0 z-50 mb-2 hidden w-52 max-w-[calc(100vw-2rem)] rounded-lg border border-border p-3 shadow-2xl group-focus-within:block group-hover:block"
                                style={{ background: "hsl(var(--muted))" }}
                              >
                                {m.tip.split("\n").map((line, i) => (
                                  <p
                                    key={i}
                                    className={`text-[11px] leading-relaxed ${i === 0 ? "font-semibold text-foreground mb-1" : "text-muted-foreground"}`}
                                  >
                                    {line}
                                  </p>
                                ))}
                              </div>
                            </div>
                          </div>
                          <p className="text-xl font-bold text-foreground">
                            {m.value}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{
                                background: "rgba(34,197,94,0.15)",
                                color: "#22c55e",
                              }}
                            >
                              ▲ 0.0%
                            </span>
                            <span className="text-[9px] text-muted-foreground">
                              vs previous month
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

              {/* ── Two donut chart cards ── */}
              {effectiveBs &&
                (() => {
                  const bs = effectiveBs;
                  const asOf = balanceSheetAsOf.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                  const totalAssets = bs.totalAssets || 1;
                  const totalLiaEq = bs.totalLiabilities + bs.equity || 1;

                  const assetSlices = [
                    {
                      name: "Current Assets",
                      value: bs.currentAssets,
                      fill: "#22c55e",
                    },
                    {
                      name: "Fixed Assets",
                      value: bs.nonCurrentAssets,
                      fill: "#38bdf8",
                    },
                  ].filter((d) => d.value > 0);

                  const liabEqSlices = [
                    {
                      name: "Current Liabilities",
                      value: bs.currentLiabilities,
                      fill: "#fb7185",
                    },
                    {
                      name: "Long-Term Liabilities",
                      value: bs.longTermLiabilities,
                      fill: "#f97316",
                    },
                    { name: "Equity", value: bs.equity, fill: "#eab308" },
                  ].filter((d) => d.value > 0);

                  const pct = (v: number, tot: number) =>
                    tot > 0 ? `${Math.round((v / tot) * 100)}%` : "0%";

                  return (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {/* Assets card */}
                      <div
                        className="rounded-xl border border-border p-5"
                        style={{
                          background:
                            "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))",
                        }}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              Assets
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              As of {asOf}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-foreground">
                            {fmt(bs.totalAssets)}
                          </p>
                        </div>
                        <div className="mt-3 flex flex-col items-center gap-4 min-[420px]:flex-row min-[420px]:items-center">
                          {/* Donut */}
                          <div className="flex-shrink-0 self-center">
                            <ResponsiveContainer width={150} height={150}>
                              <PieChart>
                                <Pie
                                  data={assetSlices}
                                  dataKey="value"
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={65}
                                  innerRadius={40}
                                  paddingAngle={2}
                                >
                                  {assetSlices.map((d) => (
                                    <Cell
                                      key={d.name}
                                      fill={d.fill}
                                      opacity={0.9}
                                    />
                                  ))}
                                </Pie>
                                <Tooltip
                                  formatter={(v: number) => fmt(v)}
                                  contentStyle={{
                                    background: "hsl(var(--muted))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: 8,
                                    fontSize: 11,
                                  }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          {/* Breakdown */}
                          <div className="w-full min-w-0 flex-1 space-y-3 text-xs">
                            <div>
                              <p className="text-[9px] font-bold text-[#FFC72B] uppercase tracking-widest mb-1">
                                Current Assets
                              </p>
                              <div className="flex items-center justify-between text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                  Current Assets
                                </span>
                                <span className="text-foreground font-medium">
                                  {pct(bs.currentAssets, totalAssets)} →
                                </span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-[#FFC72B] uppercase tracking-widest mb-1">
                                Fixed Assets
                              </p>
                              <div className="flex items-center justify-between text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                                  Fixed Assets
                                </span>
                                <span className="text-foreground font-medium">
                                  {pct(bs.nonCurrentAssets, totalAssets)} →
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Liabilities & Equity card */}
                      <div
                        className="rounded-xl border border-border p-5"
                        style={{
                          background:
                            "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))",
                        }}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              Liabilities &amp; Equity
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              As of {asOf}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-foreground">
                            {fmt(bs.totalLiabilities + bs.equity)}
                          </p>
                        </div>
                        <div className="mt-3 flex flex-col items-center gap-4 min-[420px]:flex-row min-[420px]:items-center">
                          {/* Donut */}
                          <div className="flex-shrink-0 self-center">
                            <ResponsiveContainer width={150} height={150}>
                              <PieChart>
                                <Pie
                                  data={liabEqSlices}
                                  dataKey="value"
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={65}
                                  innerRadius={40}
                                  paddingAngle={2}
                                >
                                  {liabEqSlices.map((d) => (
                                    <Cell
                                      key={d.name}
                                      fill={d.fill}
                                      opacity={0.9}
                                    />
                                  ))}
                                </Pie>
                                <Tooltip
                                  formatter={(v: number) => fmt(v)}
                                  contentStyle={{
                                    background: "hsl(var(--muted))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: 8,
                                    fontSize: 11,
                                  }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          {/* Breakdown */}
                          <div className="w-full min-w-0 flex-1 space-y-3 text-xs">
                            <div>
                              <p className="text-[9px] font-bold text-[#FFC72B] uppercase tracking-widest mb-1">
                                Current Liabilities
                              </p>
                              <div className="flex items-center justify-between text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                                  Current Liabilities
                                </span>
                                <span className="text-foreground font-medium">
                                  {pct(bs.currentLiabilities, totalLiaEq)} →
                                </span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-[#FFC72B] uppercase tracking-widest mb-1">
                                Long-Term Liabilities
                              </p>
                              <div className="flex items-center justify-between text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                                  Long-Term Liabilities
                                </span>
                                <span className="text-foreground font-medium">
                                  {pct(bs.longTermLiabilities, totalLiaEq)} →
                                </span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-[#FFC72B] uppercase tracking-widest mb-1">
                                Equity
                              </p>
                              <div className="flex items-center justify-between text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                                  Equity
                                </span>
                                <span className="text-foreground font-medium">
                                  {pct(bs.equity, totalLiaEq)} →
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              {/* ── Recently Uploaded list ── */}
              {bsPeriods.length > 0 ? (
                <div>
                  <h2 className="text-sm font-semibold text-foreground mb-3">
                    Recently Uploaded
                  </h2>
                  <div className="space-y-2">
                    {bsPeriods.map((p, i) => (
                      <div
                        key={`${p.docId}-${i}`}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-3 sm:flex-nowrap sm:px-4"
                        style={{
                          background:
                            "linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)))",
                        }}
                      >
                        <div className="h-9 w-9 rounded-lg bg-sky-500/20 flex items-center justify-center flex-shrink-0">
                          <FileText
                            className="text-sky-400"
                            style={{ height: 18, width: 18 }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {p.docName}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Balance Sheet · {statementPeriodLabel(p)}
                          </p>
                        </div>
                        <div className="ml-12 flex w-full flex-shrink-0 items-center justify-end gap-2 sm:ml-0 sm:w-auto">
                          {p.bs && (
                            <span className="text-[10px] text-muted-foreground">
                              {fmt(p.bs.totalAssets)}
                            </span>
                          )}
                          <button className="text-[10px] font-bold text-muted-foreground border border-border rounded px-2 py-1 hover:text-foreground transition-colors">
                            View
                          </button>
                          <span
                            className="inline-flex items-center justify-center h-6 w-6 rounded text-[10px] font-bold"
                            style={{
                              background:
                                p.source === "manual"
                                  ? "rgba(59,130,246,0.2)"
                                  : "rgba(239,68,68,0.2)",
                              color:
                                p.source === "manual" ? "#60a5fa" : "#f87171",
                            }}
                          >
                            {p.source === "manual" ? "M" : "U"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-xl border border-dashed border-border py-14 flex flex-col items-center text-center gap-3"
                  style={{
                    background:
                      "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))",
                  }}
                >
                  <FileText className="h-10 w-10 text-muted-foreground/60" />
                  <div>
                    <p className="font-medium text-foreground">
                      No Balance Sheet statements yet
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Upload a Balance Sheet document to see it here.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="mt-2 gap-1.5"
                    onClick={() => setShowDocs(true)}
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload Statement
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Cash Flow tab ── */}
      {tab === "cf" && (
        <div className="space-y-5">
          {/* Header: title + period pills + action buttons */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold">Cash Flow</h1>
              <p className="text-xs text-muted-foreground">{periodLabel}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
              {/* Period pills */}
              {PERIOD_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPeriod(key)}
                  className={`px-3 py-1.5 text-[11px] font-medium rounded transition-colors ${
                    period === key
                      ? "bg-[#FFC72B] text-[#020E2C] font-bold"
                      : "bg-muted text-muted-foreground hover:bg-muted border border-border"
                  }`}
                >
                  {label}
                </button>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="border-border/60 text-muted-foreground hover:bg-secondary/50 gap-1.5 text-xs h-8"
                onClick={() => {
                  setExportType("cf");
                  setShowExport(true);
                }}
              >
                <Download className="h-3.5 w-3.5" /> EXPORT
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-8"
                onClick={() => setShowDocs(true)}
              >
                <Upload className="h-3.5 w-3.5" /> UPLOAD
              </Button>
              <button className="px-3 py-1.5 text-[11px] font-semibold rounded border border-[#FFC72B]/60 text-[#FFC72B] hover:bg-[#FFC72B]/10 transition-colors">
                ADJUST CASH FLOW
              </button>
              {/* Showing toggle */}
              <button
                onClick={() => setCfShowPaid((v) => !v)}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-opacity hover:opacity-80"
                style={{
                  background: "hsl(var(--muted))",
                  border: "1px solid hsl(var(--border))",
                }}
              >
                <span className="text-muted-foreground">Showing:</span>
                <span className="text-foreground font-bold">
                  {cfShowPaid ? "paid" : "paid + unpaid"}
                </span>
                <span
                  className="h-4 w-7 rounded-full flex items-center transition-all duration-200"
                  style={{
                    background: cfShowPaid ? "#f97316" : "hsl(var(--muted))",
                    justifyContent: cfShowPaid ? "flex-end" : "flex-start",
                    paddingLeft: cfShowPaid ? 0 : 2,
                    paddingRight: cfShowPaid ? 2 : 0,
                  }}
                >
                  <span className="h-3 w-3 rounded-full bg-white" />
                </span>
              </button>
            </div>
          </div>

          {/* ── 3 KPI cards: Money In / Money Out / Net Cash ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(() => {
              const displayOut = cfMoneyOut;
              const displayNet = cfNetCash;
              return [
                {
                  label: "Money In",
                  value: fmt(cfMoneyIn),
                  color: "#22c55e",
                  tip: "Money In\nTotal inflows in the selected period. Includes all paid income transactions.",
                },
                {
                  label: "Money Out",
                  value: fmt(displayOut),
                  color: "#fb7185",
                  tip: "Money Out\nTotal outflows in the selected period. Includes all paid expense transactions.",
                },
                {
                  label: "Net Cash",
                  value: fmt(displayNet),
                  color: displayNet >= 0 ? "#22c55e" : "#fb7185",
                  tip: null as string | null,
                },
              ];
            })().map((k) => (
              <div
                key={k.label}
                className="rounded-xl border border-border px-5 py-5 flex flex-col gap-2"
                style={{
                  background:
                    "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))",
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground font-medium">
                    {k.label}
                  </p>
                  {k.tip && (
                    <div className="group relative" tabIndex={0}>
                      <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                      <div
                        className="absolute right-0 top-full z-50 mt-1.5 hidden w-52 max-w-[calc(100vw-2rem)] rounded-lg border border-border p-3 shadow-2xl group-focus-within:block group-hover:block"
                        style={{ background: "hsl(var(--muted))" }}
                      >
                        {k.tip.split("\n").map((line, i) => (
                          <p
                            key={i}
                            className={`text-[11px] leading-relaxed ${i === 0 ? "font-semibold text-foreground mb-1" : "text-muted-foreground"}`}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-2xl font-bold" style={{ color: k.color }}>
                  {k.value}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: "rgba(34,197,94,0.15)",
                      color: "#22c55e",
                    }}
                  >
                    {cfNetCash === 0 ? "None" : "▲ 0.0%"}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    vs previous 3 months
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* ── Cash Flow Trend chart ── */}
          <div className="p-4" style={trendChartPanelStyle}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-sm font-semibold text-[#DCE8FF]">
                  Cash Flow Trend
                </p>
                <p className="text-[10px] text-[#8EA5D2] mt-0.5">
                  {cashFlowTrendScale.topLabel}
                </p>
                {/* Reference chart keeps this header compact. */}
                {false && (
                  <p className="hidden">
                    {cfShowPaid
                      ? "Yellow = net cash (paid only). Circles mark each period — not a separate unrealized line."
                      : "Yellow = net cash including unpaid/projected. Circles mark each period — still one net line, not two."}
                  </p>
                )}
                {false && (
                  <p className="text-[10px] text-muted-foreground">
                    {trendData[0]?.label &&
                    trendData[trendData.length - 1]?.label
                      ? `${trendData[0].label} – ${trendData[trendData.length - 1].label}`
                      : periodLabel}{" "}
                    | Monthly
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button className="flex items-center gap-1 text-[10px] text-[#8EA5D2] border border-[#2B7FFF]/35 rounded px-2 py-1 hover:text-[#EAF2FF] transition-colors">
                  Filter +
                </button>
                <label className="flex items-center gap-1 text-[10px] text-[#8EA5D2] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded accent-[#FFC72B]"
                    readOnly
                  />
                  vs prior months
                </label>
              </div>
            </div>
            <div className="h-[220px] mt-0">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={trendData}
                    margin={{ top: 34, right: 0, left: -16, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="cfRevBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#20C987" stopOpacity={1} />
                        <stop
                          offset="100%"
                          stopColor="#159F70"
                          stopOpacity={1}
                        />
                      </linearGradient>
                      <linearGradient id="cfExpBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B8CFF" stopOpacity={1} />
                        <stop
                          offset="100%"
                          stopColor="#2163C9"
                          stopOpacity={1}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={trendChartGrid} />
                    <XAxis
                      dataKey="label"
                      tick={trendAxisTick}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={trendAxisTick}
                      tickFormatter={fmtTrendTick}
                      ticks={cashFlowTrendScale.ticks}
                      domain={cashFlowTrendScale.domain}
                      axisLine={false}
                      tickLine={false}
                      width={58}
                    />
                    <Tooltip
                      formatter={(v: number) => fmt(v)}
                      contentStyle={trendTooltipStyle}
                      labelStyle={{ color: "#EAF2FF" }}
                      itemStyle={{ color: "#EAF2FF" }}
                    />
                    <Bar
                      dataKey="revenue"
                      name="Money In"
                      fill="url(#cfRevBar)"
                      radius={[4, 4, 0, 0]}
                      barSize={18}
                    />
                    {!cfShowPaid && (
                      <Bar
                        dataKey="expenses"
                        name="Money Out"
                        fill="url(#cfExpBar)"
                        radius={[4, 4, 0, 0]}
                        barSize={18}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="netCash"
                      name="Net Cash"
                      stroke="#FFC72B"
                      strokeWidth={2}
                      dot={{
                        r: 3,
                        fill: "#FFC72B",
                        stroke: "#061f49",
                        strokeWidth: 1,
                      }}
                      activeDot={{ r: 4, fill: "#FFC72B" }}
                    />
                    <Line
                      type="monotone"
                      dataKey={cfShowPaid ? "revenue" : "profit"}
                      name="Profit"
                      stroke="#F3F7FF"
                      strokeWidth={2.5}
                      dot={{
                        r: 3,
                        fill: "#F3F7FF",
                        stroke: "#061f49",
                        strokeWidth: 1,
                      }}
                      activeDot={{ r: 5, fill: "#F3F7FF" }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">
                    No transaction data for this period.
                  </p>
                </div>
              )}
            </div>
            {/* Legend */}
            <div className="flex items-center justify-center gap-5 mt-0 pl-1">
              <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: "#20C987" }}
                />{" "}
                Money In
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: "#2B7FFF" }}
                />{" "}
                Money Out
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                <span className="h-4 border-t-2 border-[#FFC72B] w-5 inline-block mb-0.5" />{" "}
                Net Cash
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                <span className="h-4 border-t-2 border-[#F3F7FF] w-5 inline-block mb-0.5" />{" "}
                Profit
              </span>
            </div>
          </div>

          {/* ── Cash Flow Statement ── */}
          {(() => {
            const opCF = effectiveCf.operating;
            const invCF = effectiveCf.investing;
            const finCF = effectiveCf.financing;
            const netCF = effectiveCf.netChange;
            const sections = [
              {
                title: "Operating Activities",
                label: "Operating Cash Flow",
                value: opCF,
                border: "#22c55e",
              },
              {
                title: "Investing Activities",
                label: "Investing Cash Flow",
                value: invCF,
                border: "#38bdf8",
              },
              {
                title: "Financing Activities",
                label: "Financing Cash Flow",
                value: finCF,
                border: "#FFC72B",
              },
            ];
            return (
              <div
                className="rounded-xl border border-border p-5"
                style={{
                  background:
                    "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))",
                }}
              >
                <p className="text-sm font-semibold text-foreground mb-4">
                  Cash Flow Statement
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {sections.map((s) => (
                    <div
                      key={s.title}
                      className="rounded-lg border border-border overflow-hidden"
                      style={{ background: "hsl(var(--muted))" }}
                    >
                      {/* Section header */}
                      <div
                        className="flex items-center justify-between px-4 py-3 border-l-4"
                        style={{ borderLeftColor: s.border }}
                      >
                        <p className="text-xs font-semibold text-foreground">
                          {s.title}
                        </p>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      {/* Value row */}
                      <div className="flex items-center justify-between px-4 py-3 border-t border-border/60">
                        <p className="text-[11px] text-muted-foreground">
                          {s.label}
                        </p>
                        <p
                          className="text-sm font-bold"
                          style={{
                            color: s.value >= 0 ? "#22c55e" : "#fb7185",
                          }}
                        >
                          {fmt(s.value)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Net Cash footer */}
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-center gap-2">
                  <p className="text-sm text-muted-foreground">Net Cash:</p>
                  <p
                    className="text-sm font-bold"
                    style={{ color: netCF >= 0 ? "#22c55e" : "#fb7185" }}
                  >
                    {fmt(netCF)}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Export Dialog — matches Flutter _PdfExportDialog exactly ── */}
      <Dialog open={showAccountsDialog} onOpenChange={setShowAccountsDialog}>
        <DialogContent className="sm:max-w-2xl bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" />
              Connected Bank Accounts
            </DialogTitle>
            <DialogDescription>
              Banks connected through Plaid for the active business.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[58vh] overflow-y-auto pr-1">
            {accountsLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading connected accounts...
              </div>
            ) : connectedBanks.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-secondary/20 px-5 py-10 text-center">
                <Wallet className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-semibold text-foreground">
                  No bank accounts connected yet.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Connect a bank to sync Plaid transactions into this business.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {connectedBanks.map((bank) => (
                  <div
                    key={bank.id}
                    className="rounded-xl border border-border/60 bg-secondary/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {bank.institution_name || "Connected Bank"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {bank.updated_at
                            ? `Last updated ${new Date(bank.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                            : "Connected through Plaid"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                          {bank.status || "active"}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 border-destructive/40 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeletePlaidTarget(bank)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {bank.accounts.length === 0 ? (
                      <p className="rounded-lg border border-border/40 px-3 py-2 text-xs text-muted-foreground">
                        This bank is connected, but no accounts were returned
                        yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {bank.accounts.map((account) => (
                          <div
                            key={account.id}
                            className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/25 px-3 py-2.5"
                          >
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Wallet className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {account.name ||
                                  account.official_name ||
                                  "Bank Account"}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {[
                                  account.type,
                                  account.subtype,
                                  account.mask
                                    ? `ending ${account.mask}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" • ") || "Plaid account"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAccountsDialog(false)}
            >
              Close
            </Button>
            <Button
              onClick={() => {
                setShowAccountsDialog(false);
                void handleConnectBank();
              }}
              disabled={plaidConnecting || plaidSyncing}
            >
              {plaidConnecting || plaidSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Wallet className="h-4 w-4 mr-2" />
              )}
              {connectedBanks.length === 0
                ? "Connect Bank"
                : "Connect Another Bank"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deletePlaidTarget}
        onOpenChange={(v) => {
          if (!v && !deletePlaidRunning) setDeletePlaidTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2 className="h-4 w-4" />
              Disconnect bank?
            </DialogTitle>
            <DialogDescription>
              This will remove{" "}
              {deletePlaidTarget?.institution_name || "this bank"} and delete
              all transactions synced from its accounts. Uploaded and manual
              transactions will remain.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={deletePlaidRunning}
              onClick={() => setDeletePlaidTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deletePlaidRunning}
              onClick={handleDeletePlaidItem}
            >
              {deletePlaidRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-2" />
              )}
              Delete bank & transactions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExport} onOpenChange={setShowExport}>
        {/*
          Flutter: Dialog shape=RoundedRectangleBorder(r=16), width=520, padding=20
          [&>button]:hidden hides the shadcn auto-rendered X close button
        */}
        <DialogContent className="p-0 max-w-[520px] rounded-2xl border-border/50 bg-card overflow-hidden [&>button]:hidden">
          {(() => {
            const isBs = exportType === "bs";
            const sDate = new Date(exportStart);
            const eDate = new Date(exportEnd);
            const bsEnds = isBs
              ? buildBsSnapshotEnds(eDate, exportFreq, exportPeriodCount)
              : [];
            const labels = isBs
              ? buildBsSnapshotLabels(bsEnds, exportFreq, eDate)
              : buildBucketLabels(sDate, eDate, exportFreq);
            const validationError = isBs
              ? exportPeriodCount < 1 || exportPeriodCount > MAX_EXPORT_COLS
                ? `Choose between 1 and ${MAX_EXPORT_COLS} periods.`
                : null
              : validateExportRange(sDate, eDate, exportFreq);
            const tooMany = labels.length > MAX_EXPORT_COLS;
            const hasError = !!validationError || tooMany;
            const colPreview = `${Math.min(labels.length, MAX_EXPORT_COLS)}/5 columns: ${labels.slice(0, MAX_EXPORT_COLS).join(", ") || "—"}`;
            const helperText =
              exportFreq === "monthly"
                ? "Monthly: max 5 months"
                : exportFreq === "quarterly"
                  ? "Quarterly: max 5 quarters (~15 months)"
                  : "Yearly: max 5 years";
            /* Flutter DateFormat('MMM dd, yyyy') */
            const fmtTile = (iso: string) => {
              try {
                return new Date(iso).toLocaleDateString("en-US", {
                  month: "short",
                  day: "2-digit",
                  year: "numeric",
                });
              } catch {
                return iso;
              }
            };

            return (
              /* Flutter: Padding(all: 20) → Column(mainAxisSize: min, crossAxisAlignment: start) */
              <div className="p-5">
                {/* ── Report type + format (not in Flutter but needed for single-dialog UX) ── */}
                <div className="flex gap-2 mb-4">
                  {(["pl", "bs", "cf"] as ExportReportType[]).map((rt) => (
                    <button
                      key={rt}
                      onClick={() => setExportType(rt)}
                      className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors
                        ${exportType === rt ? "bg-primary/20 text-primary border-primary/60" : "border-border/50 text-muted-foreground hover:border-primary/40"}`}
                    >
                      {rt === "pl"
                        ? "Profit & Loss"
                        : rt === "bs"
                          ? "Balance Sheet"
                          : "Cash Flow"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mb-5">
                  {(
                    [
                      ["pdf", "PDF"],
                      ["excel", "Excel"],
                      ["csv", "CSV"],
                    ] as [ExportFormat, string][]
                  ).map(([f, lbl]) => (
                    <button
                      key={f}
                      onClick={() => setExportFormat(f)}
                      className={`flex-1 py-1 text-[11px] font-medium rounded-md border transition-colors
                        ${exportFormat === f ? "bg-primary/20 text-primary border-primary/60" : "border-border/40 text-muted-foreground hover:border-primary/30"}`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                {/* Flutter: Text("Export PDF" / "Export Excel", fontSize:18, fontWeight:w700) */}
                <p className="text-[18px] font-bold text-foreground">
                  {exportFormat === "pdf"
                    ? "Export PDF"
                    : exportFormat === "excel"
                      ? "Export Excel"
                      : "Export CSV"}
                </p>

                {/* Flutter: SizedBox(height:16) */}
                <div className="h-4" />

                <div className="grid gap-3 mb-4">
                  <label>
                    <span className="block text-[12px] text-foreground/60 mb-1.5">
                      Company Name
                    </span>
                    <Input
                      value={exportCompanyName}
                      onChange={(event) =>
                        setExportCompanyName(event.target.value)
                      }
                      placeholder={
                        ((orgDetails as Record<string, unknown> | null)
                          ?.name as string) ?? "Organization"
                      }
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      <span className="block text-[12px] text-foreground/60 mb-1.5">
                        Address (optional)
                      </span>
                      <Input
                        value={exportAddress}
                        onChange={(event) =>
                          setExportAddress(event.target.value)
                        }
                        placeholder="Business address"
                      />
                    </label>
                    <label>
                      <span className="block text-[12px] text-foreground/60 mb-1.5">
                        Logo URL (optional)
                      </span>
                      <Input
                        value={exportLogoUrl}
                        onChange={(event) =>
                          setExportLogoUrl(event.target.value)
                        }
                        placeholder="https://…"
                      />
                    </label>
                  </div>
                </div>

                {/* Flutter: date tiles row — BS gets "As Of Date" + period count dropdown */}
                {isBs ? (
                  <div className="flex gap-3 items-start">
                    <label className="flex-1">
                      <span className="block text-[12px] text-foreground/60 mb-1.5">
                        As Of Date
                      </span>
                      <input
                        type="date"
                        value={exportEnd}
                        onChange={(e) => setExportEnd(e.target.value)}
                        className="w-full rounded-2xl border border-gray-400/70 bg-muted/40 px-4 py-[13px] text-[14px] font-semibold text-foreground outline-none transition-colors hover:border-primary/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </label>
                    {/* Number of periods */}
                    <div className="flex-1">
                      <p className="text-[12px] font-semibold text-foreground mb-2">
                        Number of periods
                      </p>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            onClick={() => setExportPeriodCount(n)}
                            className={`flex-1 py-2 text-[12px] font-semibold rounded-lg border transition-colors
                              ${exportPeriodCount === n ? "bg-primary/20 text-primary border-primary/60" : "border-border/50 text-muted-foreground hover:border-primary/40"}`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Flutter: Row with two Expanded date tiles, SizedBox(w:12) gap */
                  <div className="flex gap-3">
                    <label className="flex-1">
                      <span className="block text-[12px] text-foreground/60 mb-1.5">
                        Start Date
                      </span>
                      <input
                        type="date"
                        value={exportStart}
                        onChange={(e) => setExportStart(e.target.value)}
                        className="w-full rounded-2xl border border-gray-400/70 bg-muted/40 px-4 py-[13px] text-[14px] font-semibold text-foreground outline-none transition-colors hover:border-primary/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </label>
                    <label className="flex-1">
                      <span className="block text-[12px] text-foreground/60 mb-1.5">
                        End Date
                      </span>
                      <input
                        type="date"
                        value={exportEnd}
                        onChange={(e) => setExportEnd(e.target.value)}
                        className="w-full rounded-2xl border border-gray-400/70 bg-muted/40 px-4 py-[13px] text-[14px] font-semibold text-foreground outline-none transition-colors hover:border-primary/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </label>
                  </div>
                )}

                {/* Flutter: SizedBox(height:14) */}
                <div className="h-[14px]" />

                {/* Flutter: Text("Frequency", fontWeight:w600) */}
                <p className="text-[14px] font-semibold text-foreground">
                  Frequency
                </p>

                {/* Flutter: SizedBox(height:8) */}
                <div className="h-2" />

                {/* Flutter: Wrap(spacing:8) with ChoiceChip for Monthly/Quarterly/Yearly */}
                <div className="flex flex-wrap gap-2">
                  {(["monthly", "quarterly", "yearly"] as ExportFreq[]).map(
                    (f) => {
                      const sel = exportFreq === f;
                      return (
                        <button
                          key={f}
                          onClick={() => setExportFreq(f)}
                          className={`px-4 py-1.5 rounded-full text-[13px] border transition-colors
                          ${
                            sel
                              ? "bg-primary/20 text-primary border-primary/60 font-medium"
                              : "border-border/50 text-foreground/70 hover:border-primary/40 hover:text-primary"
                          }`}
                        >
                          {f === "monthly"
                            ? "Monthly"
                            : f === "quarterly"
                              ? "Quarterly"
                              : "Yearly"}
                        </button>
                      );
                    },
                  )}
                </div>

                {/* Flutter: SizedBox(height:12) × 2 = 24px */}
                <div className="h-6" />

                {/* Flutter: Text(_helperText(), fontSize:12, color: bodySmall.withAlpha(0.8)) */}
                <p className="text-[12px] text-muted-foreground/80 leading-snug">
                  {helperText}
                </p>

                {/* Flutter: SizedBox(height:8) */}
                <div className="h-2" />

                {/* Flutter: Text(_columnPreviewText(), fontSize:12, fontWeight:w600, maxLines:2, overflow:ellipsis) */}
                <p className="text-[12px] font-semibold text-foreground line-clamp-2">
                  {colPreview}
                </p>

                {/* Flutter: if hasError → SizedBox(height:8) + Text(error, color:red, fontSize:12) */}
                {hasError && (
                  <>
                    <div className="h-2" />
                    <p className="text-[12px] text-red-500 leading-snug">
                      {validationError ??
                        "Too many columns selected. Reduce range to 5 or less."}
                    </p>
                  </>
                )}

                {/* Flutter: SizedBox(height:18) */}
                <div className="h-[18px]" />

                {/*
                  Flutter: Row(mainAxisAlignment:end) with two ElevatedButtons
                  bg: Color(0xFF1E3A8A).withAlpha(0.35)  = rgba(30,58,138,0.35)
                  fg: Colors.white
                  side: BorderSide(color:white, width:0.8)
                  shape: RoundedRectangleBorder(r=12)
                  padding: symmetric(h=24, v=12)
                */}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowExport(false)}
                    disabled={isExporting}
                    style={{
                      backgroundColor: "rgba(30,58,138,0.35)",
                      borderColor: "rgba(255,255,255,0.8)",
                    }}
                    className="px-6 py-3 rounded-xl text-[14px] font-medium text-foreground border hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={isExporting || hasError || !orgId}
                    style={{
                      backgroundColor:
                        isExporting || hasError || !orgId
                          ? "rgba(30,58,138,0.20)"
                          : "rgba(30,58,138,0.35)",
                      borderColor: "rgba(255,255,255,0.8)",
                      color:
                        isExporting || hasError || !orgId
                          ? "rgba(255,255,255,0.5)"
                          : "white",
                    }}
                    className="px-6 py-3 rounded-xl text-[14px] font-medium border flex items-center gap-2 hover:opacity-90 disabled:cursor-not-allowed transition-opacity"
                  >
                    {isExporting && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {exportFormat === "pdf"
                      ? "Download PDF"
                      : exportFormat === "excel"
                        ? "Download Excel"
                        : "Download CSV"}
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {statementReview && orgId && (
        <StatementReviewDialog
          open
          statementId={statementReview.id}
          organizationId={orgId}
          initial={statementReview.draft}
          serverWarnings={statementReview.warnings}
          onDone={() => {
            setStatementReview(null);
            queryClient.invalidateQueries({
              queryKey: ["statement_docs", numericId],
            });
            queryClient.invalidateQueries({
              queryKey: ["user_documents", numericId],
            });
          }}
          onDeleteUpload={async () => {
            const { data } = await supabase.auth.getSession();
            await fetch(
              `/api/document-delete?storagePath=${encodeURIComponent(statementReview.storagePath)}`,
              {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${data.session?.access_token ?? ""}`,
                },
              },
            );
            await supabase
              .from("user_documents")
              .delete()
              .eq("id", statementReview.documentId);
            setStatementReview(null);
            queryClient.invalidateQueries({
              queryKey: ["statement_docs", numericId],
            });
            queryClient.invalidateQueries({
              queryKey: ["user_documents", numericId],
            });
          }}
        />
      )}

      {numericId !== null && scanningImportId !== null && scanningImportId > 0 && (
        <TransactionReviewDialog
          importId={scanningImportId}
          open
          numericUserId={numericId}
          onClose={() => setScanningImportId(null)}
          onReviewComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["user_documents", numericId] });
            queryClient.invalidateQueries({ queryKey: ["tx_month"] });
            queryClient.invalidateQueries({ queryKey: ["tx_recent"] });
            queryClient.invalidateQueries({ queryKey: ["tx_count"] });
            queryClient.invalidateQueries({ queryKey: ["tx_period"] });
            queryClient.invalidateQueries({ queryKey: ["tx_prev_period"] });
            queryClient.invalidateQueries({ queryKey: ["tx_all_full"] });
            queryClient.invalidateQueries({ queryKey: ["tx_all_balance"] });
          }}
        />
      )}

      {/* ── Upload Financial Document Dialog ── */}
      <Dialog
        open={showUpload}
        onOpenChange={(v) => {
          if (!v) resetUploadForm();
          setShowUpload(v);
        }}
      >
        <DialogContent className="sm:max-w-md bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4.5 w-4.5 text-primary" />
              Upload Financial Document
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* File pick area */}
            <input
              ref={uploadFileRef}
              type="file"
              className="hidden"
              accept=".pdf,.csv,.xlsx,.xls,.doc,.docx,.jpg,.jpeg,.png"
              onChange={handleFilePicked}
            />
            <button
              onClick={() => uploadFileRef.current?.click()}
              className="w-full border-2 border-dashed border-border/60 hover:border-primary/50 rounded-xl p-6 flex flex-col items-center gap-2 transition-colors group"
            >
              <div className="h-12 w-12 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <span className="text-sm font-medium">Upload From Device</span>
              <span className="text-xs text-muted-foreground">
                PDF, CSV, Excel, Word, or Image
              </span>
            </button>

            {/* Picked file badge */}
            {uploadPickedFile && (
              <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-xs text-primary flex-1 truncate">
                  {uploadPickedFile.name}
                </span>
                <button
                  onClick={() => {
                    setUploadPickedFile(null);
                    if (uploadFileRef.current) uploadFileRef.current.value = "";
                  }}
                  className="text-muted-foreground hover:text-foreground ml-1 flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Document Name */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Document Name *
              </label>
              <Input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g. W-9 Form - John Doe"
                className="mt-1.5 bg-background border-border/60 h-9 text-sm"
              />
            </div>

            {/* Category + Year row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Category *
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/60"
                >
                  <option value="">Select category</option>
                  {[
                    "Balance Sheet",
                    "Profit & Loss",
                    "Income Statement",
                    "Cash Flow Statement",
                    "Transactions",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Year
                </label>
                <select
                  value={uploadYear}
                  onChange={(e) => handleUploadYearChange(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/60"
                >
                  {Array.from(
                    { length: 15 },
                    (_, i) => new Date().getFullYear() - i,
                  ).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Period dates */}
            {uploadCategory && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {isBalanceSheetUpload ? "As Of Date *" : "Document Period *"}
                </label>
                {isBalanceSheetUpload ? (
                  <input
                    type="date"
                    value={uploadAsOf}
                    onChange={(e) => setUploadAsOf(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/60"
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                    <input
                      type="date"
                      value={uploadPeriodStart}
                      onChange={(e) => setUploadPeriodStart(e.target.value)}
                      placeholder="Start date"
                      className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/60"
                    />
                    <input
                      type="date"
                      value={uploadPeriodEnd}
                      onChange={(e) => setUploadPeriodEnd(e.target.value)}
                      placeholder="End date"
                      className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/60"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Validation error */}
            {uploadError && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {uploadError}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetUploadForm();
                setShowUpload(false);
              }}
              className="border-border/60"
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={handleUploadSave}
              disabled={uploadSaving}
              className="bg-primary text-primary-foreground gap-1.5"
            >
              {uploadSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Document Preview Dialog ── */}
      {viewingDoc && (
        <Dialog
          open={!!viewingDoc}
          onOpenChange={(v) => {
            if (!v) {
              setViewingDoc(null);
              setViewDocError(null);
            }
          }}
        >
          <DialogContent className="h-[min(90dvh,900px)] max-h-[calc(100dvh-1.5rem)] sm:max-w-4xl xl:max-w-5xl bg-card border-border/60 p-0 overflow-hidden gap-0 flex flex-col [&>button]:right-3 [&>button]:top-3 [&>button]:z-20">
            <DialogHeader className="shrink-0 border-b border-border/50 bg-card px-5 py-4 pr-16 sm:px-6 sm:py-5 sm:pr-16">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                    <FileText className="h-5 w-5 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <DialogTitle className="truncate text-base font-semibold leading-5">
                      {viewingDoc.title}.{viewingDoc.type.toLowerCase()}
                    </DialogTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{viewingDoc.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{viewingDoc.size}</span>
                      <span aria-hidden="true">·</span>
                      <span>Added {viewingDoc.date}</span>
                      {viewingDoc.taxYear && <><span aria-hidden="true">·</span><span>Tax year {viewingDoc.taxYear}</span></>}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!viewingDoc.fileUrl}
                  onClick={async () => {
                    if (!viewingDoc.fileUrl) return;
                    try {
                      await proxyDownload(
                        viewingDoc.fileUrl,
                        `${viewingDoc.title}.${viewingDoc.type.toLowerCase()}`,
                      );
                    } catch {
                      toast({
                        title: "Download failed",
                        description: "Could not download this file.",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="h-9 shrink-0 gap-2 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                >
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
            </DialogHeader>
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/20"
            >
              {!viewingDoc.fileUrl ? (
                <div className="flex flex-col items-center gap-4 py-16 text-center px-8">
                  <div className="h-16 w-16 rounded-2xl bg-muted/40 flex items-center justify-center">
                    <FileText className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="font-semibold">{viewingDoc.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {viewingDoc.type} · {viewingDoc.size}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    This is a sample document. Upload your own documents using
                    the{" "}
                    <span className="text-primary font-medium">
                      Upload Document
                    </span>{" "}
                    button to view and download them here.
                  </p>
                </div>
              ) : viewDocLoading ? (
                <div className="flex flex-col items-center gap-3 py-20">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">
                    Loading document…
                  </p>
                </div>
              ) : viewDocError === "not_found" ? (
                <div className="flex flex-col items-center gap-3 py-20 text-center px-8">
                  <FileText className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium">
                    File not found in storage
                  </p>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    This document record exists but the file is no longer in
                    storage. Please delete this entry and re-upload the
                    document.
                  </p>
                </div>
              ) : viewDocError ? (
                <div className="flex flex-col items-center gap-3 py-20 text-center px-8">
                  <FileText className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Could not load document. Try downloading it instead.
                  </p>
                </div>
              ) : !viewDocBlobUrl ? (
                <div className="flex flex-col items-center gap-3 py-20 text-center px-8">
                  <FileText className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Could not load document. Try downloading it instead.
                  </p>
                </div>
              ) : ["PDF"].includes(viewingDoc.type) ? (
                <iframe
                  src={viewDocBlobUrl}
                  className="h-full w-full bg-white"
                  style={{ border: "none" }}
                  title={viewingDoc.title}
                />
              ) : ["JPG", "JPEG", "PNG", "GIF", "WEBP", "SVG"].includes(
                  viewingDoc.type,
                ) ? (
                <>
                  <div className="h-full w-full overflow-auto p-5 sm:p-8">
                    <div className="flex min-h-full min-w-full items-center justify-center">
                      <img
                        src={viewDocBlobUrl}
                        alt={viewingDoc.title}
                        className="h-auto max-w-none rounded-sm bg-white shadow-2xl ring-1 ring-black/10 transition-[width] duration-150"
                        style={{ width: `${previewZoom}%` }}
                      />
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border/60 bg-card/95 p-1 shadow-lg backdrop-blur">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      aria-label="Zoom out"
                      disabled={previewZoom <= 50}
                      onClick={() => setPreviewZoom((zoom) => Math.max(50, zoom - 25))}
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <button
                      type="button"
                      className="min-w-14 px-1 text-center text-xs font-medium tabular-nums text-muted-foreground"
                      onClick={() => setPreviewZoom(100)}
                      title="Reset zoom"
                    >
                      {previewZoom}%
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      aria-label="Zoom in"
                      disabled={previewZoom >= 200}
                      onClick={() => setPreviewZoom((zoom) => Math.min(200, zoom + 25))}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-4 py-16 text-center px-8">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{viewingDoc.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {viewingDoc.type} · {viewingDoc.size}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    This file type can't be previewed directly. Download it to
                    open it in the appropriate application.
                  </p>
                  <button
                    onClick={async () => {
                      if (!viewingDoc.fileUrl) return;
                      try {
                        await proxyDownload(
                          viewingDoc.fileUrl,
                          `${viewingDoc.title}.${viewingDoc.type.toLowerCase()}`,
                        );
                      } catch {
                        toast({
                          title: "Download failed",
                          description: "Could not download this file.",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary border border-primary/40 rounded-lg px-4 py-2 hover:bg-primary/10 transition-colors"
                  >
                    <Download className="h-4 w-4" /> Download File
                  </button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Document Repository Sheet ── */}
      <Sheet open={showDocs} onOpenChange={setShowDocs}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl lg:max-w-3xl bg-card border-border/60 flex flex-col p-0 [&>button]:right-5 [&>button]:top-5"
        >
          <SheetHeader className="px-5 sm:px-6 pt-5 pb-4 border-b border-border/40 space-y-4">
            <div className="flex items-start justify-between gap-4 pr-9">
              <div className="min-w-0">
                <SheetTitle className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-4 w-4 text-primary" />
                  </span>
                  Document Repository
                </SheetTitle>
                <p className="mt-1 pl-11 text-xs text-muted-foreground">
                  {docsLoading
                    ? "Loading your documents..."
                    : `${docs.length} ${docs.length === 1 ? "document" : "documents"} stored securely`}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setShowUpload(true)}
                className="bg-primary text-primary-foreground gap-1.5 h-9 text-xs shrink-0"
              >
                <Upload className="h-3.5 w-3.5" /> Upload Document
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  aria-label="Search documents"
                  placeholder="Search name, type, or category..."
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  className="pl-9 h-9 text-sm bg-background border-border/60"
                />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex">
                <Select value={docCategory} onValueChange={setDocCategory}>
                  <SelectTrigger aria-label="Filter by category" className="h-9 min-w-0 sm:w-[145px] text-xs">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All categories</SelectItem>
                    {docCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={docYear} onValueChange={setDocYear}>
                  <SelectTrigger aria-label="Filter by tax year" className="h-9 min-w-0 sm:w-[110px] text-xs">
                    <SelectValue placeholder="Tax year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All years</SelectItem>
                    {docYears.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={docSort} onValueChange={setDocSort}>
                  <SelectTrigger aria-label="Sort documents" className="h-9 min-w-0 sm:w-[120px] text-xs">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="size">Size</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SheetHeader>

          {/* Document list */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">
            {docsLoading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">
                  Loading documents…
                </p>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-64 gap-3 text-center">
                <File className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {docSearch || docCategory !== "All" || docYear !== "All"
                    ? "No documents match your filters."
                    : "No documents yet. Upload your first document."}
                </p>
                {(docSearch || docCategory !== "All" || docYear !== "All") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDocSearch("");
                      setDocCategory("All");
                      setDocYear("All");
                    }}
                  >
                    Clear filters
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowUpload(true)}
                  className="border-primary/40 text-primary gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/50">
                <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_110px_100px_80px_40px] gap-3 bg-muted/20 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Document</span>
                  <span>Category</span>
                  <span>Date added</span>
                  <span>Size</span>
                  <span className="sr-only">Actions</span>
                </div>
                <div className="divide-y divide-border/40">
              {filteredDocs.map((doc) => {
                const SIcon = STATUS_ICON[doc.status] ?? CheckCircle2;
                return (
                  <div
                    key={doc.id}
                    className="group grid gap-3 bg-background/30 p-4 transition-colors hover:bg-muted/20 sm:grid-cols-[minmax(0,1fr)_110px_100px_80px_40px] sm:items-center"
                  >
                    <button
                      onClick={() => setViewingDoc(doc)}
                      className="flex min-w-0 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold transition-colors group-hover:text-primary">
                          {doc.title}.{doc.type.toLowerCase()}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <SIcon className="h-3 w-3" /> {doc.status}
                          </span>
                          {doc.taxYear && <><span>·</span><span>Tax year {doc.taxYear}</span></>}
                        </span>
                      </span>
                    </button>
                    <span className="text-xs text-muted-foreground sm:truncate">
                      <span className="sm:hidden font-medium text-foreground">Category: </span>{doc.category || "—"}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      <span className="sm:hidden font-medium text-foreground">Added: </span>{doc.date}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      <span className="sm:hidden font-medium text-foreground">Size: </span>{doc.size}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 justify-self-end" aria-label={`Actions for ${doc.title}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewingDoc(doc)}>
                          <Eye className="h-4 w-4" /> Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!doc.fileUrl}
                          onClick={async () => {
                            if (!doc.fileUrl) return;
                            try {
                              await proxyDownload(doc.fileUrl, `${doc.title}.${doc.type.toLowerCase()}`);
                            } catch {
                              toast({ title: "Download failed", description: "Could not download this file.", variant: "destructive" });
                            }
                          }}
                        >
                          <Download className="h-4 w-4" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteDocTarget(doc)}
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })
                }</div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Delete Document confirmation dialog ── */}
      <Dialog
        open={!!deleteDocTarget}
        onOpenChange={(v) => {
          if (!v && !deleteDocRunning) setDeleteDocTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2 className="h-4 w-4" /> Delete Document
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Deleting{" "}
            <span className="font-semibold text-foreground">
              {deleteDocTarget?.title}
            </span>{" "}
            will also permanently remove all transactions that were imported
            from this document. This cannot be undone.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={deleteDocRunning}
              onClick={() => setDeleteDocTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteDocRunning}
              onClick={() =>
                deleteDocTarget && handleDeleteDoc(deleteDocTarget)
              }
              className="gap-1.5"
            >
              {deleteDocRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {deleteDocRunning
                ? "Deleting…"
                : "Delete document & transactions"}
            </Button>
          </DialogFooter>
     </DialogContent>
</Dialog>

{/* GLOBAL BANK SYNC STATUS */}
{plaidSyncStage !== "idle" && (
  <div className="fixed top-4 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2">
    <div
      className={`rounded-xl border p-4 shadow-lg backdrop-blur ${
        plaidSyncStage === "complete"
          ? "border-emerald-500/30 bg-background/95"
          : plaidSyncStage === "error"
            ? "border-destructive/30 bg-background/95"
            : "border-primary/30 bg-background/95"
      }`}
    >
      <div className="flex items-start gap-3">
        {[
          "connecting",
          "syncing",
          "categorizing",
          "refreshing",
        ].includes(plaidSyncStage) && (
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
        )}

        {plaidSyncStage === "complete" && (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        )}

        {plaidSyncStage === "error" && (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {plaidSyncStage === "connecting" &&
              "Connecting your bank"}

            {plaidSyncStage === "syncing" &&
              "Importing bank transactions"}

            {plaidSyncStage === "categorizing" &&
              "Categorizing transactions"}

            {plaidSyncStage === "refreshing" &&
              "Updating BookSmart"}

            {plaidSyncStage === "complete" &&
              "Bank import complete"}

            {plaidSyncStage === "error" &&
              "Bank import failed"}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {plaidSyncMessage}
          </p>

          {[
            "connecting",
            "syncing",
            "categorizing",
            "refreshing",
          ].includes(plaidSyncStage) && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
            </div>
          )}

          {[
            "connecting",
            "syncing",
            "categorizing",
            "refreshing",
          ].includes(plaidSyncStage) && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Please keep this page open while BookSmart processes your bank data.
            </p>
          )}
        </div>
      </div>
    </div>
  </div>
)}

{/* ── Transactions tab ── */}
{tab === "transactions" && (
  <div className="space-y-3 pb-20">

    {/* Connect Bank button */}
    <div className="flex justify-end">
      <Button
        size="sm"
        onClick={handleConnectBank}
        disabled={plaidConnecting || plaidSyncing}
        className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {plaidConnecting || plaidSyncing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wallet className="h-4 w-4" />
        )}

        {plaidSyncing
          ? "Syncing..."
          : plaidConnecting
            ? "Connecting..."
            : "Connect Bank"}
      </Button>
    </div>

  


          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search transactions"
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted pl-10 pr-24 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-3">
              <button
                className="text-muted-foreground hover:text-foreground"
                title="Smart Clean"
                onClick={handleSmartCleanOpen}
              >
                <Sparkles className="h-4 w-4" />
              </button>
              <button
                className="text-muted-foreground hover:text-foreground"
                title="Filter"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4h18M7 8h10M11 12h2M13 16h-2"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Smart Clean preview dialog */}
          <Dialog
            open={smartCleanOpen}
            onOpenChange={(v) => {
              if (!v && !smartCleanRunning) {
                setSmartCleanOpen(false);
                setSmartCleanPreview(null);
              }
            }}
          >
            <DialogContent className="sm:max-w-lg bg-card border-border/60">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-amber-400" /> Smart Clean —
                  Auto-detect P&amp;L Entries
                </DialogTitle>
              </DialogHeader>
              {smartCleanRunning && !smartCleanPreview ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                  <p className="text-sm text-muted-foreground">
                    Scanning all transactions for P&amp;L-style entries…
                  </p>
                </div>
              ) : smartCleanPreview !== null &&
                smartCleanPreview.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm font-medium text-emerald-400">
                    All clear!
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No P&amp;L-style entries detected. Your data looks clean.
                  </p>
                </div>
              ) : smartCleanPreview !== null ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Found{" "}
                    <span className="font-semibold text-foreground">
                      {smartCleanPreview.length}
                    </span>{" "}
                    transactions that look like P&amp;L summary entries (large
                    round amounts or known P&amp;L categories). These are
                    distorting your income &amp; expense calculations.
                  </p>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/30">
                    {smartCleanPreview.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between px-3 py-2 text-xs"
                      >
                        <span className="text-muted-foreground truncate flex-1 pr-3">
                          {t.title}
                        </span>
                        <span
                          className={`font-semibold flex-shrink-0 ${t.amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                        >
                          {t.amount >= 0 ? "+" : ""}
                          {fmt(t.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <DialogFooter className="gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSmartCleanOpen(false);
                        setSmartCleanPreview(null);
                      }}
                      className="border-border/60"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={smartCleanRunning}
                      onClick={handleSmartCleanConfirm}
                      className="gap-1.5"
                    >
                      {smartCleanRunning ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      {smartCleanRunning
                        ? "Deleting…"
                        : `Remove ${smartCleanPreview.length} entr${smartCleanPreview.length === 1 ? "y" : "ies"}`}
                    </Button>
                  </DialogFooter>
                </>
              ) : null}
            </DialogContent>
          </Dialog>

          {/* Bulk-action bar — shown when something is selected */}
          {selectedTxIds.size > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2">
              <span className="text-sm text-destructive font-medium">
                {selectedTxIds.size} transaction
                {selectedTxIds.size > 1 ? "s" : ""} selected
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={() => setSelectedTxIds(new Set())}
                >
                  Deselect all
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5 text-xs h-7"
                  onClick={() => setConfirmDeleteOpen(true)}
                >
                  <Trash2 className="h-3 w-3" /> Delete selected
                </Button>
              </div>
            </div>
          )}

          {/* Flutter-style transaction cards */}
          {allTxsLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            (() => {
              const q = txSearch.toLowerCase();
              const filtered = allTxsFull.filter(
                (tx) =>
                  !q ||
                  tx.title.toLowerCase().includes(q) ||
                  (tx.description ?? "").toLowerCase().includes(q),
              );
              return filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/50 p-12 text-center">
                  <p className="text-muted-foreground">
                    {txSearch
                      ? "No matching transactions."
                      : "No transactions yet. Use '+ Add Transaction' or upload a bank statement."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 pb-20">
                  {filtered.map((tx) => (
                    <div
                      key={tx.id}
                      className="rounded-2xl border border-border overflow-hidden cursor-pointer hover:border-primary/40 transition-colors group"
                      style={{
                        background:
                          "linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)))",
                      }}
                      onClick={() => openDetailTx(tx)}
                    >
                      <div className="flex" style={{ minHeight: 86 }}>
                        {/* 6px colored indicator bar */}
                        <div
                          style={{
                            width: 6,
                            flexShrink: 0,
                            background: tx.amount >= 0 ? "#22c55e" : "#6b7280",
                          }}
                        />
                        {/* Card body */}
                        <div className="flex-1 px-3 py-3">
                          {/* Title + amount */}
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[15px] font-bold text-foreground truncate flex-1">
                              {tx.title}
                            </p>
                            <div className="flex-shrink-0 text-right">
                              <p
                                className={`text-[15px] font-bold ${tx.amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                              >
                                {tx.amount < 0 ? "- " : ""}
                                {fmt(Math.abs(tx.amount))}
                              </p>
                              {tx.description ? (
                                <FileText className="h-3.5 w-3.5 text-muted-foreground ml-auto mt-0.5 opacity-70" />
                              ) : null}
                            </div>
                          </div>
                          {/* Avatar + date */}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <div className="h-5 w-5 rounded-full bg-[#1E3A5F] flex items-center justify-center flex-shrink-0">
                              <svg
                                className="h-3 w-3 text-muted-foreground"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                              </svg>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(tx.date_time).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}{" "}
                              · Manual
                            </span>
                          </div>
                          {/* Tags row */}
                          <div className="flex items-center justify-between mt-2">
                            <button
                              className="min-h-11 min-w-11 p-2 text-muted-foreground transition-colors hover:text-rose-400 md:min-h-0 md:min-w-0 md:opacity-0 md:group-hover:opacity-100"
                              title="Delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTxIds(new Set([tx.id]));
                                setConfirmDeleteOpen(true);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <div className="flex items-center gap-1.5">
                              {(tx.type === "Business" || !tx.type) && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded border border-border text-muted-foreground">
                                  Business
                                </span>
                              )}
                              {tx.deductible && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded border border-border text-muted-foreground">
                                  Deduction
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          )}

          {/* Flutter bottom action bar */}
          <div
            className="fixed bottom-0 left-0 right-0 z-30 flex min-h-14 overflow-hidden pb-[env(safe-area-inset-bottom)] lg:left-[var(--sidebar-width)]"
          >
            <button
              disabled={bulkCategorizing}
              className="flex-1 flex items-center justify-center gap-2 font-bold text-sm text-black transition-opacity hover:opacity-90"
              style={{ background: "#FFC72B" }}
              onClick={() => void handleBulkCategorize()}
            >
              {bulkCategorizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {bulkCategorizing ? "Categorizing…" : "AI Categorization"}
            </button>
            <button
              className="flex-1 flex items-center justify-center gap-2 font-bold text-sm text-black transition-opacity hover:opacity-90"
              style={{
                background: "#FFC72B",
                borderLeft: "1px solid rgba(0,0,0,0.1)",
              }}
              onClick={() => setShowAddTx(true)}
            >
              <span className="text-lg leading-none font-bold">+</span>
              Add Transaction
            </button>
          </div>

          {/* Add Transaction dialog */}
          <Dialog
            open={showAddTx}
            onOpenChange={(v) => {
              if (!v) setShowAddTx(false);
            }}
          >
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-border/60 bg-card sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold">
                  Add Transaction
                </DialogTitle>
                <DialogDescription>Add a transaction manually or upload a receipt and the system will extract the details for you.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-2">
                <div className={newExtractedRows.length > 0 ? "hidden" : "space-y-1.5"}>
                  <p className="mb-3 text-sm font-semibold"><span className="mr-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">2</span>Transaction Details</p>
                  <label className="text-sm font-medium">Transaction Name <span className="text-destructive">*</span></label>
                  <input
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="e.g. Freelance payment"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>
                <div className={newExtractedRows.length > 0 ? "hidden" : "space-y-1.5"}>
                  <label className="text-sm font-medium">
                    Amount (+ for income, − for expense)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="e.g. 1500.00 or -250.00"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                  />
                </div>
                <div className={newExtractedRows.length > 0 ? "hidden" : "space-y-1.5"}>
                  <label className="text-sm font-medium">Date <span className="text-destructive">*</span></label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div className={newExtractedRows.length > 0 ? "hidden" : "space-y-1.5"}>
                  <label className="text-sm font-medium">Merchant / Vendor <span className="text-destructive">*</span></label>
                  <Input placeholder="e.g. Office Depot" value={newMerchant} onChange={(event) => setNewMerchant(event.target.value)} />
                </div>
                <div className={newExtractedRows.length > 0 ? "hidden" : "space-y-1.5"}>
                  <label className="text-sm font-medium">Type <span className="text-destructive">*</span></label>
                  <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border/60">
                    <button type="button" className={`flex items-center justify-center gap-2 px-3 py-2 text-sm ${Number(newAmount) <= 0 ? "bg-rose-500/10 text-rose-400" : ""}`} onClick={() => setNewAmount((value) => String(-Math.abs(Number(value) || 0)))}><ArrowDown className="h-4 w-4" />Expense</button>
                    <button type="button" className={`flex items-center justify-center gap-2 border-l border-border/60 px-3 py-2 text-sm ${Number(newAmount) > 0 ? "bg-emerald-500/10 text-emerald-400" : ""}`} onClick={() => setNewAmount((value) => String(Math.abs(Number(value) || 0)))}><ArrowUp className="h-4 w-4" />Income</button>
                  </div>
                </div>
                <div className="order-first space-y-1.5 rounded-xl border border-border/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-semibold"><span className="mr-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">1</span>Upload Receipt <span className="font-normal text-muted-foreground">(Optional)</span></label>
                    {newReceiptFile && <button type="button" className="text-xs font-medium text-destructive" onClick={() => {
                      setNewReceiptFile(null);
                      setNewReceiptDocumentId(null);
                      setNewReceiptImportId(null);
                      setNewReceiptStatus("idle");
                      setNewExtractedRows([]);
                      if (newReceiptFileRef.current) newReceiptFileRef.current.value = "";
                    }}>Remove</button>}
                  </div>
                  <input
                    ref={newReceiptFileRef}
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    className="hidden"
                    onChange={(event) => selectNewReceiptFile(event.target.files?.[0] ?? null)}
                  />
                  <input
                    ref={newReceiptCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => selectNewReceiptFile(event.target.files?.[0] ?? null)}
                  />
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
                    <div
                      className="grid min-h-28 grid-cols-3 overflow-hidden rounded-xl border-2 border-dashed border-border/60"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        selectNewReceiptFile(event.dataTransfer.files?.[0] ?? null);
                      }}
                    >
                      <button type="button" onClick={() => newReceiptFileRef.current?.click()} className="flex flex-col items-center justify-center gap-2 p-3 text-center hover:bg-primary/5">
                        <Upload className="h-6 w-6 text-primary" />
                        <span className="text-xs font-medium">Upload File</span>
                        <span className="text-[10px] text-muted-foreground">JPG, PNG, PDF</span>
                      </button>
                      <button type="button" onClick={() => void openNewReceiptCamera()} className="flex flex-col items-center justify-center gap-2 border-x border-border/60 p-3 text-center hover:bg-primary/5">
                        <Camera className="h-6 w-6 text-primary" />
                        <span className="text-xs font-medium">Take Photo</span>
                        <span className="text-[10px] text-muted-foreground">Use camera</span>
                      </button>
                      <div className="flex flex-col items-center justify-center gap-2 p-3 text-center">
                        <FolderOpen className="h-6 w-6 text-primary" />
                        <span className="text-xs font-medium">Drag & Drop</span>
                        <span className="text-[10px] text-muted-foreground">Drop file here</span>
                      </div>
                    </div>
                    <div className="flex min-h-28 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-background/40">
                      {newReceiptPreview
                        ? <img src={newReceiptPreview} alt="Receipt preview" className="h-full max-h-32 w-full object-contain" />
                        : <FileText className="h-9 w-9 text-muted-foreground/40" />}
                    </div>
                  </div>
                  {newReceiptFile && (newReceiptStatus === "idle" || newReceiptStatus === "failed") && (
                    <Button type="button" variant="outline" className="w-full" disabled={newReceiptProcessing} onClick={() => void extractNewTransactionReceipt()}>
                      {newReceiptStatus === "failed" ? "Retry Receipt Extraction" : "Extract Receipt Details"}
                    </Button>
                  )}
                  {newReceiptStatus === "processing" && (
                    <p className={`flex items-center gap-2 text-xs font-medium ${newExtractedRows.length > 0 ? "text-emerald-400" : "text-primary"}`}>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {newExtractedRows.length > 0
                        ? `${newExtractedRows.length} transaction${newExtractedRows.length === 1 ? "" : "s"} found so far. Waiting for processing to finish…`
                        : "Extracting transaction details…"}
                    </p>
                  )}
                  {newReceiptStatus === "extracted" && (
                    <p className="text-xs font-medium text-emerald-400">
                      {newExtractedRows.length} transaction{newExtractedRows.length === 1 ? "" : "s"} extracted. Review all details below.
                    </p>
                  )}
                  {newReceiptStatus === "failed" && <p className="text-xs font-medium text-destructive">No transaction details were returned. Retry or enter the transaction manually.</p>}
                  {newExtractedRows.length > 0 && (
                    <div className="hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">Extracted Transactions ({newExtractedRows.length})</p>
                          <p className="text-xs text-muted-foreground">Review every transaction before approval.</p>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline" disabled={newReceiptApprovalRunning} onClick={() => void rejectExtractedReceiptRows(newExtractedRows)}>Reject All</Button>
                          <Button type="button" size="sm" disabled={newReceiptApprovalRunning} onClick={() => void approveExtractedReceiptRows(newExtractedRows)}>
                            {newReceiptApprovalRunning && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            Approve All
                          </Button>
                        </div>
                      </div>
                      {newExtractedRows.map((row) => {
                        const signedAmount = row.transaction_type === "debit" ? -Math.abs(row.amount) : Math.abs(row.amount);
                        const categoryName = categories.find((category) => category.id === row.category_id)?.name ?? "Uncategorized";
                        return (
                          <div key={row.id} className="rounded-lg border border-border/60 bg-card p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="break-words text-sm font-semibold">{row.title}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{new Date(row.date_time).toLocaleDateString()} · {categoryName}</p>
                              </div>
                              <span className={`shrink-0 text-sm font-bold ${signedAmount < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                                {signedAmount < 0 ? "-" : "+"}{fmt(Math.abs(signedAmount))}
                              </span>
                            </div>
                            {row.description && <p className="mt-2 break-words text-xs text-muted-foreground">{row.description}</p>}
                            <div className="mt-3 flex justify-end gap-2">
                              <Button type="button" size="sm" variant="ghost" disabled={newReceiptApprovalRunning} onClick={() => void rejectExtractedReceiptRows([row])}>Reject</Button>
                              <Button type="button" size="sm" variant="outline" disabled={newReceiptApprovalRunning} onClick={() => void approveExtractedReceiptRows([row])}>Approve</Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className={newExtractedRows.length > 0 ? "hidden" : "space-y-1.5"}>
                  <label className="text-sm font-medium">Business Use <span className="text-destructive">*</span></label>
                  <select
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    value={newBusinessUse}
                    onChange={(e) => {
                      const value = e.target.value as "Business" | "Personal" | "Split";
                      setNewBusinessUse(value);
                      if (value === "Business") setNewBusinessPercentage(100);
                      if (value === "Personal") setNewBusinessPercentage(0);
                    }}
                  >
                    <option value="Business">Business</option>
                    <option value="Personal">Personal</option>
                    <option value="Split">Split</option>
                  </select>
                </div>
                {newExtractedRows.length === 0 && newBusinessUse === "Split" && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Business % <span className="text-destructive">*</span></label>
                    <Input type="number" min={1} max={99} value={newBusinessPercentage} onChange={(event) => setNewBusinessPercentage(Number(event.target.value))} />
                  </div>
                )}
                <div className={newExtractedRows.length > 0 ? "hidden" : "space-y-1.5"}>
                  <label className="text-sm font-medium">Category <span className="text-destructive">*</span></label>
                  <select
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    value={newCategoryId}
                    onChange={(event) => setNewCategoryId(event.target.value)}
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => <option key={category.id} value={String(category.id)}>{category.name}</option>)}
                  </select>
                </div>
                <div className={newExtractedRows.length > 0 ? "hidden" : "grid gap-3 sm:grid-cols-2"}>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Account <span className="text-destructive">*</span></label>
                    <select className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm" value={newAccountId} onChange={(event) => setNewAccountId(event.target.value)}>
                      <option value="">Select account</option>
                      {transactionAccountOptions.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Payment Method <span className="text-destructive">*</span></label>
                    <Input placeholder="e.g. Visa Credit Card" value={newPaymentMethod} onChange={(event) => setNewPaymentMethod(event.target.value)} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-sm font-medium">Receipt / Invoice #</label>
                    <Input placeholder="e.g. 1234-6678" value={newReceiptNumber} onChange={(event) => setNewReceiptNumber(event.target.value)} />
                  </div>
                </div>
                <div className={newExtractedRows.length > 0 ? "hidden" : "rounded-xl border border-border/60 p-4"}>
                  <p className="mb-3 text-sm font-semibold"><span className="mr-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">3</span>Tax Information</p>
                  <div className="flex items-center justify-between rounded-lg bg-secondary/20 px-4 py-3">
                  <span className="text-sm font-medium">Tax Deductible</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={newDeductible}
                    onClick={() => setNewDeductible((v) => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${newDeductible ? "bg-primary" : "bg-secondary"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${newDeductible ? "translate-x-6" : "translate-x-1"}`}
                    />
                  </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-secondary/20 px-4 py-3">
                    <span className="text-sm font-medium">Reimbursable</span>
                    <button type="button" role="switch" aria-checked={newReimbursable} onClick={() => setNewReimbursable((value) => !value)} className={`relative inline-flex h-6 w-11 items-center rounded-full ${newReimbursable ? "bg-primary" : "bg-secondary"}`}>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${newReimbursable ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                </div>
                <div className={newExtractedRows.length > 0 ? "hidden" : "space-y-1.5"}>
                  <label className="text-sm font-medium">Notes</label>
                  <textarea
                    rows={2}
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    placeholder="Notes (optional)"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                  />
                </div>
                <Button
                  className={newExtractedRows.length > 0 ? "order-last w-full" : "w-full"}
                  disabled={
                    createMutation.isPending || newReceiptProcessing || newReceiptApprovalRunning
                    || (newExtractedRows.length === 0 && (!newTitle.trim() || !newAmount))
                  }
                  onClick={() => {
                    if (newExtractedRows.length > 0) {
                      void approveExtractedReceiptRows(newExtractedRows);
                      return;
                    }
                    const raw = parseFloat(newAmount);
                    if (!Number.isFinite(raw) || raw === 0) {
                      toast({
                        title: "Enter a valid amount",
                        description: "Use a positive amount for income or a negative amount for an expense.",
                        variant: "destructive",
                      });
                      return;
                    }
                    const transactionDate = newDate ? new Date(`${newDate}T12:00:00`) : new Date();
                    if (Number.isNaN(transactionDate.getTime())) {
                      toast({
                        title: "Enter a valid transaction date",
                        variant: "destructive",
                      });
                      return;
                    }
                    createMutation.mutate({
                      title: newTitle.trim(),
                      amount: raw,
                      date_time: transactionDate.toISOString(),
                      type: newBusinessUse,
                      deductible: newDeductible,
                      description: buildTransactionDescription(newNotes, {
                        merchant: newMerchant,
                        account: transactionAccountOptions.find((account) => account.id === newAccountId)?.label,
                        paymentMethod: newPaymentMethod,
                        receiptNumber: newReceiptNumber,
                        businessUse: newBusinessUse,
                        businessPercentage: newBusinessPercentage,
                        reimbursable: newReimbursable,
                      }),
                      ...(newReceiptDocumentId !== null ? { file_path: String(newReceiptDocumentId) } : {}),
                      category_id: newCategoryId ? Number(newCategoryId) : null,
                    });
                  }}
                >
                  {createMutation.isPending || newReceiptApprovalRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {createMutation.isPending || newReceiptApprovalRunning
                    ? "Saving…"
                    : newExtractedRows.length > 0
                      ? `Add ${newExtractedRows.length} Transaction${newExtractedRows.length === 1 ? "" : "s"}`
                      : "Add Transaction"}
                </Button>
                {newExtractedRows.length > 0 && (
                  <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
                    <div>
                      <p className="text-sm font-semibold">Extracted Transactions ({newExtractedRows.length})</p>
                      <p className="text-xs text-muted-foreground">All extracted transactions will be added using the button above.</p>
                    </div>
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {newExtractedRows.map((row, index) => {
                        const signedAmount = row.transaction_type === "debit" ? -Math.abs(row.amount) : Math.abs(row.amount);
                        const updateRow = (changes: Partial<ExtractedReceiptTransaction>) => {
                          setNewExtractedRows((current) => current.map((item) => item.id === row.id ? { ...item, ...changes } : item));
                        };
                        return (
                          <div key={row.id} className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
                            <p className="text-sm font-semibold"><span className="mr-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">{index + 1}</span>Transaction {index + 1} Details</p>
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium">Transaction Name <span className="text-destructive">*</span></label>
                              <Input value={row.title} onChange={(event) => updateRow({ title: event.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium">Merchant / Vendor <span className="text-destructive">*</span></label>
                              <Input value={row.merchant ?? row.title} onChange={(event) => updateRow({ merchant: event.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium">Type <span className="text-destructive">*</span></label>
                              <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border/60">
                                <button type="button" className={`flex items-center justify-center gap-2 px-3 py-2 text-sm ${row.transaction_type === "debit" ? "bg-rose-500/10 text-rose-400" : ""}`} onClick={() => updateRow({ transaction_type: "debit" })}><ArrowDown className="h-4 w-4" />Expense</button>
                                <button type="button" className={`flex items-center justify-center gap-2 border-l border-border/60 px-3 py-2 text-sm ${row.transaction_type === "credit" ? "bg-emerald-500/10 text-emerald-400" : ""}`} onClick={() => updateRow({ transaction_type: "credit" })}><ArrowUp className="h-4 w-4" />Income</button>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium">Amount (+ for income, − for expense)</label>
                              <Input type="number" step="0.01" value={signedAmount} onChange={(event) => {
                                const value = Number(event.target.value);
                                if (!Number.isFinite(value)) return;
                                updateRow({ amount: Math.abs(value), transaction_type: value < 0 ? "debit" : "credit" });
                              }} />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium">Date <span className="text-destructive">*</span></label>
                              <Input type="date" value={row.date_time.slice(0, 10)} onChange={(event) => updateRow({ date_time: `${event.target.value}T12:00:00.000Z` })} />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium">Business Use <span className="text-destructive">*</span></label>
                              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={row.business_use ?? row.business_type ?? "Business"} onChange={(event) => {
                                const value = event.target.value as "Business" | "Personal" | "Split";
                                updateRow({ business_use: value, business_type: value === "Personal" ? "Personal" : "Business", business_percentage: value === "Business" ? 100 : value === "Personal" ? 0 : (row.business_percentage ?? 50) });
                              }}>
                                <option value="Business">Business</option><option value="Personal">Personal</option><option value="Split">Split</option>
                              </select>
                            </div>
                            {(row.business_use ?? row.business_type) === "Split" && (
                              <div className="space-y-1.5">
                                <label className="text-sm font-medium">Business % <span className="text-destructive">*</span></label>
                                <Input type="number" min={1} max={99} value={row.business_percentage ?? 50} onChange={(event) => updateRow({ business_percentage: Number(event.target.value) })} />
                              </div>
                            )}
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium">Category <span className="text-destructive">*</span></label>
                              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={row.category_id ?? ""} onChange={(event) => updateRow({ category_id: event.target.value ? Number(event.target.value) : null, sub_category_id: null })}>
                                <option value="">Select category</option>
                                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                              </select>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <label className="text-sm font-medium">Account <span className="text-destructive">*</span></label>
                                <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={row.account_id ?? ""} onChange={(event) => updateRow({ account_id: event.target.value })}>
                                  <option value="">Select account</option>
                                  {transactionAccountOptions.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
                                </select>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-sm font-medium">Payment Method <span className="text-destructive">*</span></label>
                                <Input value={row.payment_method ?? ""} placeholder="e.g. Visa Credit Card" onChange={(event) => updateRow({ payment_method: event.target.value })} />
                              </div>
                              <div className="space-y-1.5 sm:col-span-2">
                                <label className="text-sm font-medium">Receipt / Invoice #</label>
                                <Input value={row.receipt_number ?? ""} onChange={(event) => updateRow({ receipt_number: event.target.value })} />
                              </div>
                              <div className="space-y-1.5 sm:col-span-2">
                                <label className="text-sm font-medium">Account / Card Hint</label>
                                <Input value={row.account_card_hint ?? ""} placeholder="e.g. Business Visa ending 4242" onChange={(event) => updateRow({ account_card_hint: event.target.value })} />
                              </div>
                            </div>
                            <div className="rounded-xl border border-border/60 p-3">
                              <p className="mb-3 text-sm font-semibold"><span className="mr-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">3</span>Tax Information</p>
                              <div className="flex items-center justify-between rounded-lg bg-secondary/20 px-4 py-3">
                                <span className="text-sm font-medium">Tax Deductible</span>
                                <button type="button" role="switch" aria-checked={row.deductible ?? false} onClick={() => updateRow({ deductible: !(row.deductible ?? false) })} className={`relative inline-flex h-6 w-11 items-center rounded-full ${row.deductible ? "bg-primary" : "bg-secondary"}`}>
                                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${row.deductible ? "translate-x-6" : "translate-x-1"}`} />
                                </button>
                              </div>
                              <div className="mt-2 flex items-center justify-between rounded-lg bg-secondary/20 px-4 py-3">
                                <span className="text-sm font-medium">Reimbursable</span>
                                <button type="button" role="switch" aria-checked={row.reimbursable ?? false} onClick={() => updateRow({ reimbursable: !(row.reimbursable ?? false) })} className={`relative inline-flex h-6 w-11 items-center rounded-full ${row.reimbursable ? "bg-primary" : "bg-secondary"}`}>
                                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${row.reimbursable ? "translate-x-6" : "translate-x-1"}`} />
                                </button>
                              </div>
                            </div>
                            <div className="space-y-1.5"><label className="text-sm font-medium">Notes</label><textarea rows={2} className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm" value={row.description ?? ""} onChange={(event) => updateRow({ description: event.target.value })} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
           </DialogContent>
         </Dialog>

          <Dialog
            open={newReceiptCameraOpen}
            onOpenChange={(open) => {
              if (!open) stopNewReceiptCamera();
            }}
          >
            <DialogContent className="border-border/60 bg-card p-0 sm:max-w-xl">
              <DialogHeader className="px-5 pt-5">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Camera className="h-4 w-4 text-primary" /> Take Receipt Photo
                </DialogTitle>
                <DialogDescription>Position the entire receipt inside the frame.</DialogDescription>
              </DialogHeader>
              <div className="px-5">
                <div className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-xl bg-black">
                  <video
                    ref={newReceiptVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className={`max-h-[60dvh] w-full object-contain ${newReceiptCameraError ? "hidden" : "block"}`}
                  />
                  {newReceiptCameraStarting && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                      <Loader2 className="h-7 w-7 animate-spin" />
                      <p className="text-sm">Starting camera…</p>
                    </div>
                  )}
                  {newReceiptCameraError && (
                    <div className="max-w-sm space-y-3 p-6 text-center text-white">
                      <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
                      <p className="text-sm">{newReceiptCameraError}</p>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter className="gap-2 px-5 pb-5">
                <Button type="button" variant="outline" onClick={() => {
                  stopNewReceiptCamera();
                  if (newReceiptCameraRef.current) {
                    newReceiptCameraRef.current.value = "";
                    newReceiptCameraRef.current.click();
                  }
                }}>
                  Choose Photo
                </Button>
                <Button
                  type="button"
                  disabled={newReceiptCameraStarting || !!newReceiptCameraError}
                  onClick={captureNewReceiptPhoto}
                >
                  <Camera className="mr-2 h-4 w-4" /> Capture Photo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete confirmation dialog */}
          <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
            <DialogContent className="sm:max-w-sm bg-card border-border/60">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base text-destructive">
                  <Trash2 className="h-4 w-4" /> Delete Transactions
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to permanently delete{" "}
                <span className="font-semibold text-foreground">
                  {selectedTxIds.size} transaction
                  {selectedTxIds.size > 1 ? "s" : ""}
                </span>
                ? This will update your income, expense, and net profit figures.
              </p>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDeleteOpen(false)}
                  className="border-border/60"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate([...selectedTxIds])}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : null}
                  {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Update Transaction dialog */}
          <Dialog
            open={detailTx !== null}
            onOpenChange={(v) => {
              if (!v) setDetailTx(null);
            }}
          >
            <DialogContent className="sm:max-w-md bg-card border-border/60 max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <DialogTitle className="text-base font-semibold">
                    Update Transaction
                  </DialogTitle>
                  <button
                    className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                    title="Delete transaction"
                    onClick={() => {
                      if (detailTx) {
                        setSelectedTxIds(new Set([detailTx.id]));
                        setDetailTx(null);
                        setConfirmDeleteOpen(true);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </DialogHeader>
              {detailTx && (
                <div className="space-y-4 pb-1">
                  {/* Title */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Title</label>
                    <input
                      className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Transaction title"
                    />
                  </div>

                  {/* Date */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Date</label>
                    <input
                      type="datetime-local"
                      className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                  </div>

                  {/* Amount */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full rounded-lg border border-border/60 bg-secondary/40 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter positive for income, negative for expense (e.g.
                      -48.77)
                    </p>
                  </div>

                  {/* Category picker button */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Category</label>
                    <button
                      type="button"
                      onClick={() => {
                        setCatSearchQuery("");
                        setExpandedCatIds(new Set());
                        setCategoryPickerOpen(true);
                      }}
                      className="w-full flex items-center justify-between rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm text-left hover:bg-secondary/60 transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {editCategoryId ? (
                          <>
                            <span className="text-foreground truncate">
                              {(() => {
                                const cat = categories.find(
                                  (c) => c.id === editCategoryId,
                                );
                                const sub = subCategories.find(
                                  (s) => s.id === editSubCategoryId,
                                );
                                const catName = cat?.name;
                                const subName = sub?.name;
                                return catName
                                  ? subName
                                    ? `${catName}: ${subName}`
                                    : catName
                                  : "Select Category";
                              })()}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            Select Category
                          </span>
                        )}
                        {false ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
                            <span className="text-muted-foreground">
                              AI is categorizing…
                            </span>
                          </>
                        ) : false ? (
                          <>
                            {aiCatSuggested && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary flex-shrink-0">
                                <Sparkles className="h-2.5 w-2.5" />
                                AI
                              </span>
                            )}
                            <span className="text-foreground truncate">
                              {(() => {
                                const cat = categories.find(
                                  (c) => c.id === editCategoryId,
                                );
                                const sub = subCategories.find(
                                  (s) => s.id === editSubCategoryId,
                                );
                                const catName = cat?.name;
                                const subName = sub?.name;
                                return catName
                                  ? subName
                                    ? `${catName}: ${subName}`
                                    : catName
                                  : "Select Category";
                              })()}
                            </span>
                          </>
                        ) : null}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  </div>

                  {/* Type */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Type</label>
                    <select
                      className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      value={editType}
                      onChange={(e) => setEditType(e.target.value)}
                    >
                      <option value="Business">Business</option>
                      <option value="Personal">Personal</option>
                    </select>
                  </div>

                  {/* Deductible toggle */}
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 px-4 py-3">
                    <span className="text-sm font-medium">Deductible</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={editDeductible}
                      onClick={() => setEditDeductible((v) => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${editDeductible ? "bg-primary" : "bg-secondary"}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editDeductible ? "translate-x-6" : "translate-x-1"}`}
                      />
                    </button>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Notes</label>
                    <textarea
                      rows={3}
                      className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Notes (optional)"
                    />
                  </div>

                  {/* Save button */}
                  <Button
                    className="w-full"
                    disabled={
                      updateMutation.isPending ||
                      !editTitle.trim() ||
                      !editAmount
                    }
                    onClick={() => {
                      const rawAmount = parseFloat(editAmount);
                      if (isNaN(rawAmount)) return;
                      updateMutation.mutate({
                        id: detailTx.id,
                        title: editTitle.trim(),
                        amount: rawAmount,
                        date_time: editDate
                          ? new Date(editDate).toISOString()
                          : detailTx.date_time,
                        type: editType,
                        deductible: editDeductible,
                        description: editNotes,
                        category_id: editCategoryId,
                        sub_category_id: editSubCategoryId,
                      });
                    }}
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    {updateMutation.isPending
                      ? "Saving…"
                      : "Update Transaction"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Select Category modal */}
          <Dialog
            open={categoryPickerOpen}
            onOpenChange={(v) => {
              if (!v) setCategoryPickerOpen(false);
            }}
          >
            <DialogContent className="sm:max-w-md bg-card border-border/60 max-h-[85vh] flex flex-col p-0 gap-0">
              <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
                <DialogTitle className="text-base font-semibold">
                  Select Category
                </DialogTitle>
              </DialogHeader>

              {/* Search */}
              <div className="px-4 py-3 border-b border-border/40">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    autoFocus
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Search categories..."
                    value={catSearchQuery}
                    onChange={(e) => {
                      setCatSearchQuery(e.target.value);
                      if (e.target.value) {
                        setExpandedCatIds(new Set(categories.map((c) => c.id)));
                      }
                    }}
                  />
                </div>
              </div>

              {/* Category accordion list */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {(() => {
                  const q = catSearchQuery.toLowerCase();
                  const visibleCats = categories.filter((c) => {
                    if (!q) return true;
                    if (c.name.toLowerCase().includes(q)) return true;
                    return subCategories.some(
                      (s) =>
                        s.category_id === c.id &&
                        s.name.toLowerCase().includes(q),
                    );
                  });

                  if (visibleCats.length === 0) {
                    return (
                      <p className="text-center text-sm text-muted-foreground py-8">
                        No categories found
                      </p>
                    );
                  }

                  function getCatIcon(name: string) {
                    switch (name) {
                      case "Expense":
                        return <TrendingDown className="h-4 w-4" />;
                      case "Income":
                        return <DollarSign className="h-4 w-4" />;
                      case "Cost of Goods Sold (COS)":
                        return <Package className="h-4 w-4" />;
                      case "Other Current Asset":
                        return <Wallet className="h-4 w-4" />;
                      case "Equity":
                        return <BarChart2 className="h-4 w-4" />;
                      case "Other Expense":
                        return <AlertTriangle className="h-4 w-4" />;
                      default:
                        return <Tag className="h-4 w-4" />;
                    }
                  }

                  return visibleCats.map((cat) => {
                    const isExpanded = expandedCatIds.has(cat.id);
                    const subs = subCategories.filter((s) => {
                      if (s.category_id !== cat.id) return false;
                      if (!q) return true;
                      return (
                        s.name.toLowerCase().includes(q) ||
                        cat.name.toLowerCase().includes(q)
                      );
                    });

                    return (
                      <div
                        key={cat.id}
                        className="rounded-lg border border-border/40 overflow-hidden"
                      >
                        {/* Category header row */}
                        <button
                          type="button"
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                          onClick={() => {
                            const next = new Set(expandedCatIds);
                            if (isExpanded) next.delete(cat.id);
                            else next.add(cat.id);
                            setExpandedCatIds(next);
                          }}
                        >
                          <span className="text-primary flex-shrink-0">
                            {getCatIcon(cat.name)}
                          </span>
                          <span className="flex-1 text-sm font-medium">
                            {cat.name}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )}
                        </button>

                        {/* Sub-categories */}
                        {isExpanded && (
                          <div className="border-t border-border/30 divide-y divide-border/20">
                            {subs.length === 0 ? (
                              <p className="px-12 py-2.5 text-xs text-muted-foreground">
                                No sub-categories
                              </p>
                            ) : (
                              subs.map((sub) => {
                                const isSelected =
                                  editSubCategoryId === sub.id &&
                                  editCategoryId === cat.id;
                                return (
                                  <button
                                    key={sub.id}
                                    type="button"
                                    className={`w-full flex items-center gap-3 pl-12 pr-4 py-2.5 text-left text-sm transition-colors hover:bg-secondary/30 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                                    onClick={() => {
                                      setEditCategoryId(cat.id);
                                      setEditSubCategoryId(sub.id);
                                      setCategoryPickerOpen(false);
                                    }}
                                  >
                                    <span className="flex-1">{sub.name}</span>
                                    {isSelected && (
                                      <Check className="h-3.5 w-3.5 flex-shrink-0" />
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
