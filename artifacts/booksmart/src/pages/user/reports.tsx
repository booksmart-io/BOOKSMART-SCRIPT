import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { checkAddTransaction } from "@/lib/plan-limits";
import { categorizeUncategorizedTransactions } from "@/lib/ai-categorization";
import { openPlaidLink } from "@/lib/plaid-link";
import { spendTokensForUnlock, type TokenUnlockKey } from "@/lib/token-unlocks";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import { useToast } from "@/hooks/use-toast";
import { categoryToDocType, normalizeStatementDoc, statementPeriodLabel, computeFinancialSnapshot, periodOverlaps, type StatementPeriod } from "@/lib/financial-statements";
import { useDeductionRuleSet, summarizeDeductions, type OrgRow } from "@/lib/deduction-engine";
import { PnLCard, BSCard, CFCard, sortByPeriodDesc } from "@/components/reports/financial-statements-tab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, ComposedChart, Bar,
  PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, ArrowRight, Loader2,
  DollarSign, BarChart2, Droplets, Sparkles,
  Download, Upload, FileText, Search, FileSpreadsheet,
  File, CheckCircle2, Clock, Trash2, Info,
  AlertTriangle, Package, Wallet, Tag, ChevronDown, ChevronUp, Check,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Transaction = {
  id: number; title: string; amount: number; type: string;
  date_time: string; description: string; deductible: boolean;
  category_id?: number | null; sub_category_id?: number | null;
};

type Category = { id: number; name: string };
type SubCategory = { id: number; name: string; category_id: number };

type Period = "7d" | "30d" | "3m" | "12m" | "yearly" | "all" | "custom";
type Tab = "dashboard" | "transactions" | "pl" | "bs" | "cf";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
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
function getNiceTrendScale(rows: Array<Record<string, unknown>>, keys: string[]) {
  const maxValue = rows.reduce((max, row) => {
    const rowMax = keys.reduce((innerMax, key) => {
      const value = typeof row[key] === "number" ? Math.abs(row[key] as number) : 0;
      return Math.max(innerMax, value);
    }, 0);
    return Math.max(max, rowMax);
  }, 0);

  if (maxValue <= 0) {
    return { ticks: [0, 25, 50, 75], domain: [0, 75] as [number, number], topLabel: "$75" };
  }

  const rawStep = maxValue / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = niceStep * magnitude;
  const top = step * 3;
  return {
    ticks: [0, step, step * 2, top],
    domain: [0, top] as [number, number],
    topLabel: fmtTrendTick(top),
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
  if (prev === 0) return curr > 0 ? 999 : 0;
  return ((curr - prev) / Math.abs(prev)) * 100;
}
function changeBadge(curr: number, prev: number) {
  const p = changePct(curr, prev);
  const label = Math.abs(p) >= 999 ? (p > 0 ? "+999+%" : "-999+%") : pctLabel(p);
  const pos = p >= 0;
  return { label, pos };
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

const hasAnyTerm = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

function transactionClassText(tx: Transaction, categories: Category[], subCategories: SubCategory[]) {
  const category = categories.find((c) => c.id === tx.category_id)?.name ?? "";
  const subCategory = subCategories.find((s) => s.id === tx.sub_category_id)?.name ?? "";
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
  const receivableTerms = ["receivable", "accounts receivable", "customer owes", "client balance"];
  const inventoryTerms = ["inventory", "stock", "product for sale", "goods for sale"];
  const fixedAssetTerms = ["[asset:non-current]", "fixed asset", "equipment", "property", "vehicle", "furniture", "machinery", "computer", "tools"];
  const otherAssetTerms = ["[asset", " asset", "prepaid", "security deposit", "goodwill", "investment"];
  const currentLiabilityTerms = ["[liab:current]", "accounts payable", "payable", "credit card", "taxes owed", "tax owed", "payroll liabilities", "sales tax"];
  const longTermLiabilityTerms = ["[liab:long-term]", "long-term liabilities", "long term liabilities", "loan", "mortgage", "debt:long", "note payable"];
  const equityTerms = ["[equity]", "equity", "capital", "owner contribution", "owner investment", "retained earnings"];
  const equityReductionTerms = ["owner draw", "owner draws", "distribution", "withdrawal"];

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
    const isEquity = hasAnyTerm(text, equityTerms) || hasAnyTerm(text, equityReductionTerms);

    if (isCash) cash += amount;
    if (isReceivable) receivables += amount;
    if (isInventory) inventory += amount;
    if (isFixedAsset) fixedAssets += hasAnyTerm(text, ["depreciation", "amortization"]) ? -amount : amount;
    if (isOtherAsset && !isCash && !isReceivable && !isInventory && !isFixedAsset) otherAssets += amount;
    if (isCurrentLiability) currentLiabilities += amount;
    if (isLongTermLiability) longTermLiabilities += amount;
    if (isEquity) equityItems += hasAnyTerm(text, equityReductionTerms) ? -amount : amount;
  }

  fixedAssets = Math.max(0, fixedAssets);
  equityItems = Math.max(0, equityItems);

  const currentAssets = cash + receivables + inventory;
  const nonCurrentAssets = fixedAssets + otherAssets;
  const totalAssets = currentAssets + nonCurrentAssets;
  const totalLiabilities = currentLiabilities + longTermLiabilities;

  if (totalAssets <= 0 && totalLiabilities <= 0 && equityItems <= 0) {
    const netAssets = Math.max(0, txs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0));
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
    equity: equityItems > 0 ? equityItems : Math.max(0, totalAssets - totalLiabilities),
  };
}

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (period === "7d")     { start.setDate(end.getDate() - 7); }
  else if (period === "30d") { start.setDate(end.getDate() - 30); }
  else if (period === "3m")  { start.setMonth(end.getMonth() - 3); }
  else if (period === "12m") { start.setMonth(end.getMonth() - 12); }
  else if (period === "yearly") { start.setFullYear(end.getFullYear(), 0, 1); }
  else { start.setFullYear(1970, 0, 1); } // "all" — covers any transaction date, including older uploaded/imported statements
  return { start, end };
}

function getPrevRange(period: Period): { start: Date; end: Date } {
  const { start, end } = getPeriodRange(period);
  if (period === "all") {
    // No meaningful "previous all-time" window — collapse to an empty range
    // so comparison figures read as "no prior data" instead of a huge/invalid span.
    return { start, end: start };
  }
  const dur = end.getTime() - start.getTime();
  return { start: new Date(start.getTime() - dur), end: start };
}

/** Group transactions into time buckets for the chart */
function buildTrendData(txs: Transaction[], period: Period) {
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
  const monthId = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const dayId = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  const dayLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const { start, end } = getPeriodRange(period);
  const datedTxs = txs
    .map((tx) => ({ tx, date: parseTxDate(tx.date_time) }))
    .filter((item): item is { tx: Transaction; date: Date } => item.date !== null);

  if (period === "7d" || period === "30d") {
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);
    while (cursor <= last) {
      addBucket(dayId(cursor), dayLabel(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (period === "all" && datedTxs.length > 0) {
    for (const { date } of datedTxs) {
      addBucket(monthId(date), monthLabel(date));
    }
    order.sort();
  } else {
    const monthCount = period === "3m" ? 4 : 13;
    const cursor = new Date(end.getFullYear(), end.getMonth() - (monthCount - 1), 1);
    for (let i = 0; i < monthCount; i += 1) {
      addBucket(monthId(cursor), monthLabel(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  for (const { tx, date: d } of datedTxs) {
    let key: string;
    if (period === "7d" || period === "30d") {
      key = dayId(d);
    } else {
      key = monthId(d);
    }
    if (!buckets.has(key)) continue;
    const b = buckets.get(key)!;
    if (tx.amount > 0) b.revenue += tx.amount;
    else b.expenses += Math.abs(tx.amount);
  }

  return order
    .map((key) => {
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
    const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(res.status === 404 ? "not_found" : body.message ?? body.error ?? `sign_failed_${res.status}`);
  }

  const body = await res.json() as { signedUrl?: string };
  return body.signedUrl ?? fileUrl;
}

/** Trigger a browser download through the backend proxy (reliable inside iframes) */
async function proxyDownload(fileUrl: string, filename: string) {
  const signedUrl = await getSignedUrl(fileUrl);
  const params = new URLSearchParams({ url: signedUrl, filename });
  const proxyUrl = `/api/document-download?${params.toString()}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`Download failed: file not found (${res.status})`);
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

function ChangeBadge({ curr, prev }: { curr: number; prev: number }) {
  const { label, pos } = changeBadge(curr, prev);
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${pos ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
      {pos ? "▲" : "▼"} {label}
    </span>
  );
}

function BHSGauge({ score }: { score: number }) {
  // 270° sweep: start at -135° (bottom-left), end at 135° (bottom-right)
  const startDeg = -135; const totalDeg = 270;
  const cx = 80; const cy = 80; const r = 58;
  const rTick = 68;

  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const pt = (deg: number, radius: number) => ({
    x: cx + radius * Math.cos(toRad(deg)),
    y: cy + radius * Math.sin(toRad(deg)),
  });

  const segArc = (s: number, e: number) => {
    const sv = pt(s, r); const ev = pt(e, r);
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

  const labelColor = score >= 80 ? "#22c55e" : score >= 60 ? "#84cc16" : score >= 40 ? "#eab308" : score >= 20 ? "#f97316" : "#ef4444";
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : score >= 20 ? "Poor" : "Critical";

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="120" viewBox="0 0 160 120">
        {/* Background track */}
        <path d={segArc(startDeg, startDeg + totalDeg)} fill="none" stroke="#1E3A5F" strokeWidth="11" strokeLinecap="butt" />
        {/* Color segments */}
        {segments.map(seg => {
          const sd = startDeg + (seg.from / 100) * totalDeg;
          const ed = startDeg + (seg.to / 100) * totalDeg;
          return <path key={seg.from} d={segArc(sd, ed)} fill="none" stroke={seg.color} strokeWidth="11" strokeLinecap="butt" />;
        })}
        {/* Tick marks */}
        {ticks.map(pct => {
          const deg = startDeg + (pct / 100) * totalDeg;
          const inner = pt(deg, rTick - 7);
          const outer = pt(deg, rTick + 2);
          return <line key={pct} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="hsl(var(--background))" strokeWidth="2" />;
        })}
        {/* Tick labels at 0,20,40,60,80,100 */}
        {ticks.map(pct => {
          const deg = startDeg + (pct / 100) * totalDeg;
          const lp = pt(deg, rTick + 12);
          return <text key={pct} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="hsl(var(--muted-foreground))">{pct}</text>;
        })}
        {/* Needle */}
        <line x1={cx} y1={cy} x2={np.x} y2={np.y} stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="white" />
        <circle cx={cx} cy={cy} r="2.5" fill="hsl(var(--background))" />
        {/* Score */}
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="20" fontWeight="bold" fill="white">{score}</text>
      </svg>
      <span className="text-sm font-bold -mt-1" style={{ color: labelColor }}>{label}</span>
    </div>
  );
}

function CircularGauge({ pct, size = 90 }: { pct: number; size?: number }) {
  const r = size * 0.36; const cx = size / 2; const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(1, pct / 100) * circ;
  const color = pct >= 70 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={9} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={9}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize={size * 0.19} fontWeight="bold" fill="white">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Document Repository types ─────────────────────────────────────────────

type DocStatus = "Uploaded" | "Verified" | "Processed";
type DocEntry = {
  id: string; title: string; type: string; category: string;
  date: string; status: DocStatus; size: string; fileUrl?: string;
  mimeType?: string;
};

const DOC_CATEGORIES = ["All", "Tax Forms", "Income", "Expenses", "Employment", "Receipts"];
const STATUS_COLOR: Record<DocStatus, string> = {
  Uploaded: "text-emerald-400 border-emerald-400/50 bg-emerald-500/10",
  Verified: "text-blue-400 border-blue-400/50 bg-blue-500/10",
  Processed: "text-primary border-primary/50 bg-primary/10",
};
const STATUS_ICON: Record<DocStatus, typeof CheckCircle2> = {
  Uploaded: CheckCircle2, Verified: CheckCircle2, Processed: Clock,
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
      labels.push(cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" }));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (freq === "quarterly") {
    let cursor = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
    while (cursor <= end) {
      const q = Math.floor(cursor.getMonth() / 3) + 1;
      labels.push(`Q${q} ${cursor.getFullYear()}`);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
    }
  } else {
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) labels.push(String(y));
  }
  return labels;
}

function validateExportRange(start: Date, end: Date, freq: ExportFreq): string | null {
  if (end < start) return "End date must be on or after start date.";
  const n = buildBucketLabels(start, end, freq).length;
  if (n > MAX_EXPORT_COLS) {
    const lim = freq === "monthly" ? "5 months" : freq === "quarterly" ? "5 quarters" : "5 years";
    return `${freq.charAt(0).toUpperCase() + freq.slice(1)} view supports max ${lim}.`;
  }
  return null;
}

function exportFreqHelperText(freq: ExportFreq): string {
  return freq === "monthly" ? "Monthly: max 5 months"
    : freq === "quarterly" ? "Quarterly: max 5 quarters (~15 months)"
    : "Yearly: max 5 years";
}

function buildBsSnapshotEnds(asOf: Date, freq: ExportFreq, count: number): Date[] {
  const n = Math.min(count, MAX_EXPORT_COLS);
  const ends: Date[] = [new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate())];
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

function buildBsSnapshotLabels(ends: Date[], freq: ExportFreq, asOf: Date): string[] {
  return ends.map(e => {
    const isLast = e.getFullYear() === asOf.getFullYear() && e.getMonth() === asOf.getMonth() && e.getDate() === asOf.getDate();
    if (freq === "monthly") {
      const base = e.toLocaleDateString("en-US", { month: "short", year: "numeric" });
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
    if (freq === "monthly") key = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    else if (freq === "quarterly") key = `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
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
  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
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
    if (freq === "monthly") key = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    else if (freq === "quarterly") key = `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    else key = String(d.getFullYear());
    return labels.indexOf(key);
  };

  const incomeMap = new Map<string, number[]>();
  const expenseMap = new Map<string, number[]>();

  for (const tx of txs) {
    const idx = getPeriodIdx(tx.date_time);
    if (idx < 0) continue;
    const cat = cats.find(c => c.id === tx.category_id);
    if (tx.amount > 0) {
      const name = cat ? cat.name : "Uncategorized Income";
      if (!incomeMap.has(name)) incomeMap.set(name, labels.map(() => 0));
      incomeMap.get(name)![idx] += tx.amount;
    } else {
      const name = cat ? cat.name : "Uncategorized";
      if (!expenseMap.has(name)) expenseMap.set(name, labels.map(() => 0));
      expenseMap.get(name)![idx] += Math.abs(tx.amount);
    }
  }

  const totalRev = labels.map((_, i) => Array.from(incomeMap.values()).reduce((s, a) => s + a[i], 0));
  const totalExp = labels.map((_, i) => Array.from(expenseMap.values()).reduce((s, a) => s + a[i], 0));
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
  if (incomeMap.size === 0) addItem("Uncategorized Income", labels.map(() => 0));
  for (const [name, amounts] of incomeMap.entries()) addItem(name, amounts);
  addTotal("Total Revenue", totalRev);

  // Cost of Goods Sold
  addHeader("Cost of Goods Sold");
  addItem("Inventory Purchases", labels.map(() => 0));
  addTotal("Total Cost of Goods Sold", labels.map(() => 0));

  // Gross Profit
  addHeader("Gross Profit");
  addTotal("Gross Profit", grossProfit);

  // Operating Expenses
  addHeader("Operating Expenses");
  if (expenseMap.size === 0) addItem("Uncategorized", labels.map(() => 0));
  for (const [name, amounts] of expenseMap.entries()) addItem(name, amounts);
  addTotal("Total Operating Expenses", totalExp);

  // Operating Income
  addHeader("Operating Income");
  addTotal("Operating Income", opIncome);

  // Other Income / Expenses
  addHeader("Other Income / Expenses");
  addTotal("Total Other Income / (Expenses)", labels.map(() => 0));

  // EBITDA
  addHeader("EBITDA (Reconciliation)");
  addTotal("EBITDA", opIncome);

  // Net Income
  addHeader("Net Income");
  addTotal("Net Income", netIncome);

  return { body, kinds };
}

// ─── Shared export types ─────────────────────────────────────────────────────

type TxRow = { amount: number; date_time: string; title: string; type: string; category_id?: number | null };
type RowKind = "header" | "subheader" | "item" | "total" | "grandtotal" | "separator" | "ratio";
type OrgInfo = { address?: string; cityState?: string };

const BLUE_RGB: [number, number, number]  = [94, 123, 166];   // #5E7BA6 — section header bg
const LIGHT_RGB: [number, number, number] = [214, 220, 228];  // #D6DCE4 — total row bg

// ─── Cash Flow row builder ────────────────────────────────────────────────────

function buildCFRows(
  txs: TxRow[],
  labels: string[],
  freq: ExportFreq,
): { body: string[][]; kinds: RowKind[] } {
  const dash = "$-";
  const fmtCol = (v: number) => v === 0 ? dash
    : v < 0 ? `($${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 })})`
    : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  // Compute net income per period
  const netIncome = labels.map(() => 0);
  for (const tx of txs) {
    const d = new Date(tx.date_time);
    let key = "";
    if (freq === "monthly") key = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    else if (freq === "quarterly") key = `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    else key = String(d.getFullYear());
    const idx = labels.indexOf(key);
    if (idx >= 0) netIncome[idx] += tx.amount;
  }

  const zeros = labels.map(() => 0);
  const body: string[][] = [];
  const kinds: RowKind[] = [];

  const hdr = (label: string) => { body.push([label, ...labels.map(() => "")]); kinds.push("header"); };
  const sub = (label: string) => { body.push([`  ${label}`, ...labels.map(() => "")]); kinds.push("subheader"); };
  const itm = (label: string, vals: number[]) => { body.push([`    ${label}`, ...vals.map(fmtCol)]); kinds.push("item"); };
  const tot = (label: string, vals: number[]) => { body.push([label, ...vals.map(fmtCol)]); kinds.push("total"); };
  const grand = (label: string, vals: number[]) => { body.push([label, ...vals.map(fmtCol)]); kinds.push("grandtotal"); };

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
  const beginBal = netIncome.map(v => -v);  // approximate: begin = -(net change)
  const endBal   = netIncome.map((v, i) => beginBal[i] + v);
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
  const fmtCol = (v: number) => v === 0 ? dash
    : v < 0 ? `($${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const body: string[][] = [];
  const kinds: RowKind[] = [];
  const hdr = (label: string) => { body.push([label, ...labels.map(() => "")]); kinds.push("header"); };
  const sub = (label: string) => { body.push([`  ${label}`, ...labels.map(() => "")]); kinds.push("subheader"); };
  const itm = (label: string, vals: number[]) => { body.push([`    ${label}`, ...vals.map(fmtCol)]); kinds.push("item"); };
  const tot = (label: string, vals: number[]) => { body.push([label, ...vals.map(fmtCol)]); kinds.push("total"); };
  const grand = (label: string, vals: number[]) => { body.push([label, ...vals.map(fmtCol)]); kinds.push("grandtotal"); };

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
  const fmtN = (v: number) => v === 0 ? dash : `$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const fmtRatio = (v: number) => v === 0 ? "-" : v.toFixed(2);
  const fmtWC = (v: number) => v === 0 ? dash : (v < 0 ? `($${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 })})` : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);

  // Per-snapshot computations
  const cash:    number[] = [];
  const acctRec: number[] = [];
  const inventory: number[] = [];
  const ppe:     number[] = [];
  const retainedEarnings: number[] = [];
  const ownerInvest: number[] = [];
  const acctPay: number[] = [];

  for (const snapEnd of ends) {
    const s = txs.filter(t => new Date(t.date_time) <= snapEnd);
    const posSum = s.filter(t => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
    const negSum = s.filter(t => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
    const cashVal = Math.max(0, posSum - negSum);
    const payVal  = negSum * 0.4;
    const retVal  = Math.max(0, cashVal - payVal - 6223);
    cash.push(cashVal);
    acctRec.push(0); inventory.push(0); ppe.push(0);
    acctPay.push(payVal);
    ownerInvest.push(6223);
    retainedEarnings.push(retVal);
  }

  const totalCurrA = cash.map((c, i) => c + acctRec[i] + inventory[i]);
  const totalFixedA = ppe.map(() => 0);
  const totalOtherA = ppe.map(() => 6439);
  const totalAssets = totalCurrA.map((c, i) => c + totalFixedA[i] + totalOtherA[i]);
  const totalCurrL = acctPay.map(v => v);
  const totalLTL = zeros(ends.length);
  const totalEquity = ownerInvest.map((o, i) => o + retainedEarnings[i]);
  const totalLiabEquity = totalCurrL.map((c, i) => c + totalLTL[i] + totalEquity[i]);
  const debtRatio = totalAssets.map((a, i) => a > 0 ? totalCurrL[i] / a : 0);
  const currRatio = totalCurrL.map((l, i) => l > 0 ? totalCurrA[i] / l : 0);
  const workingCap = totalCurrA.map((a, i) => a - totalCurrL[i]);
  const a2e = totalEquity.map((e, i) => e > 0 ? totalAssets[i] / e : 0);
  const d2e = totalEquity.map((e, i) => e > 0 ? totalCurrL[i] / e : 0);

  const body: string[][] = [];
  const kinds: RowKind[] = [];

  const hdr  = (l: string) => { body.push([l, ...labels.map(() => "")]); kinds.push("header"); };
  const sub  = (l: string) => { body.push([l, ...labels.map(() => "")]); kinds.push("subheader"); };
  const itm  = (l: string, vals: number[], fn = fmtN) => { body.push([`  ${l}`, ...vals.map(fn)]); kinds.push("item"); };
  const tot  = (l: string, vals: number[], fn = fmtN) => { body.push([l, ...vals.map(fn)]); kinds.push("total"); };
  const grand = (l: string, vals: number[], fn = fmtN) => { body.push([l, ...vals.map(fn)]); kinds.push("grandtotal"); };
  const sep  = () => { body.push(["", ...labels.map(() => "")]); kinds.push("separator"); };
  const ratio = (l: string, vals: number[], fn: (v: number) => string) => { body.push([`  ${l}`, ...vals.map(fn)]); kinds.push("ratio"); };

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
  const fmtN = (v: number) => v === 0 ? dash : `$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtRatio = (v: number) => v === 0 ? "-" : v.toFixed(2);
  const fmtWC = (v: number) => v === 0 ? dash : (v < 0 ? `($${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  const totalAssets = bs.totalAssets;
  const totalLiabilities = bs.totalLiabilities;
  const totalEquity = bs.equity;
  const totalLiabEquity = totalLiabilities + totalEquity;
  const debtRatio = totalAssets > 0 ? totalLiabilities / totalAssets : 0;
  const currRatio = bs.currentLiabilities > 0 ? bs.currentAssets / bs.currentLiabilities : 0;
  const workingCap = bs.currentAssets - bs.currentLiabilities;
  const a2e = totalEquity > 0 ? totalAssets / totalEquity : 0;
  const d2e = totalEquity > 0 ? totalLiabilities / totalEquity : 0;

  const body: string[][] = [];
  const kinds: RowKind[] = [];
  const hdr  = (l: string) => { body.push([l, ...labels.map(() => "")]); kinds.push("header"); };
  const sub  = (l: string) => { body.push([l, ...labels.map(() => "")]); kinds.push("subheader"); };
  const itm  = (l: string, vals: number[], fn = fmtN) => { body.push([`  ${l}`, ...vals.map(fn)]); kinds.push("item"); };
  const tot  = (l: string, vals: number[], fn = fmtN) => { body.push([l, ...vals.map(fn)]); kinds.push("total"); };
  const grand = (l: string, vals: number[], fn = fmtN) => { body.push([l, ...vals.map(fn)]); kinds.push("grandtotal"); };
  const sep  = () => { body.push(["", ...labels.map(() => "")]); kinds.push("separator"); };
  const ratio = (l: string, vals: number[], fn: (v: number) => string) => { body.push([`  ${l}`, ...vals.map(fn)]); kinds.push("ratio"); };

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

function zeros(n: number): number[] { return Array.from({ length: n }, () => 0); }

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
) {
  const jspdfModule = await import("jspdf");
  const jsPDF = jspdfModule.jsPDF;
  const { default: autoTable } = await import("jspdf-autotable");

  const startDate = new Date(exportStart);
  const endDate   = new Date(exportEnd);
  let labels: string[];
  if (exportType === "bs") {
    labels = buildBsSnapshotLabels(buildBsSnapshotEnds(endDate, exportFreq, exportPeriodCount), exportFreq, endDate);
  } else {
    labels = buildBucketLabels(startDate, endDate, exportFreq);
  }

  const orientation = exportType === "bs" ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, format: "a4" });
  const pageW = doc.internal.pageSize.width;
  const datePrepared = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const displayName  = companyName || "Organization";
  const titleMap: Record<ExportReportType, string> = {
    pl: "Profit & Loss Statement",
    cf: "Cash Flow Statement",
    bs: "BALANCE SHEET",
  };

  // ── Top header ──
  doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text(displayName, 14, 14);
  doc.setFontSize(14);
  doc.text(titleMap[exportType], pageW - 14, 14, { align: "right" });
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  if (orgInfo.address)   doc.text(orgInfo.address,   14, 21);
  if (orgInfo.cityState) doc.text(orgInfo.cityState, 14, orgInfo.address ? 27 : 21);

  if (exportType === "bs") {
    doc.text(`Date Prepared: ${endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, pageW - 14, 21, { align: "right" });
    doc.text(`As of ${endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, pageW - 14, 27, { align: "right" });
  } else {
    const period = `For the Period ${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} to ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    doc.text(period, pageW - 14, 21, { align: "right" });
    doc.text(`Date Prepared: ${datePrepared}`, pageW - 14, 27, { align: "right" });
  }

  doc.setDrawColor(190, 196, 204);
  doc.setLineWidth(0.4);
  doc.line(14, 32, pageW - 14, 32);

  // ── Table data ──
  let body: string[][];
  let rowKinds: RowKind[] = [];

  if (exportType === "pl") {
    const pnl = buildPnLRows(txs, labels, exportFreq, cats);
    body = pnl.body;
    rowKinds = pnl.kinds;
  } else if (exportType === "cf") {
    const r = cfOverride ? buildCFRowsFromEstimate(cfOverride, labels) : buildCFRows(txs, labels, exportFreq);
    body = r.body;
    rowKinds = r.kinds;
  } else {
    const r = bsOverride
      ? buildBSRowsFromEstimate(bsOverride, labels)
      : buildBSRows(txs, labels, exportFreq, endDate, exportPeriodCount);
    body = r.body;
    rowKinds = r.kinds;
  }

  autoTable(doc, {
    startY: 37,
    head: [["", ...labels]],
    body,
    headStyles:  { fillColor: BLUE_RGB,  textColor: 255, fontStyle: "bold", fontSize: 8 },
    bodyStyles:  { fontSize: 8, textColor: 30 },
    styles:      { cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
    margin:      { left: 14, right: 14 },
    didParseCell: (data: Parameters<import("jspdf-autotable").CellHook>[0]) => {
      if (data.section !== "body") return;
      const kind = rowKinds[data.row.index];
      if (kind === "header") {
        data.cell.styles.fillColor = BLUE_RGB;
        data.cell.styles.textColor = 255;
        data.cell.styles.fontStyle = "bold";
      } else if (kind === "subheader") {
        data.cell.styles.fillColor = [180, 197, 218] as [number, number, number];
        data.cell.styles.textColor = 30;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize  = 7.5;
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

  const slug = exportType === "pl" ? "profit_loss" : exportType === "cf" ? "cash_flow" : "balance_sheet";
  doc.save(`booksmart_${slug}_${exportType === "bs" ? exportEnd : exportStart + "_" + exportEnd}.pdf`);
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
) {
  const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new (ExcelJS as { Workbook: new () => import("exceljs").Workbook }).Workbook();

  const startDate = new Date(exportStart);
  const endDate   = new Date(exportEnd);
  const displayName = companyName || "Organization";
  const datePrepared = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

  let labels: string[];
  if (exportType === "bs") {
    labels = buildBsSnapshotLabels(buildBsSnapshotEnds(endDate, exportFreq, exportPeriodCount), exportFreq, endDate);
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
  const BLUE_ARGB  = "FF5E7BA6";
  const LIGHT_ARGB = "FFD6DCE4";
  const WHITE_ARGB = "FFFFFFFF";
  const DARK_ARGB  = "FF1F3B5C";
  const MID_ARGB   = "FFB4C5DA";

  const applyHeaderStyle = (row: import("exceljs").Row) => {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > colCount) return;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE_ARGB } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "right" };
      cell.border = { bottom: { style: "thin", color: { argb: WHITE_ARGB } } };
    });
    row.height = 18;
  };

  const applySubheaderStyle = (row: import("exceljs").Row) => {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > colCount) return;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MID_ARGB } };
      cell.font = { bold: true, color: { argb: DARK_ARGB }, size: 9 };
      cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "right" };
    });
    row.height = 16;
  };

  const applyTotalStyle = (row: import("exceljs").Row) => {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > colCount) return;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_ARGB } };
      cell.font = { bold: true, color: { argb: DARK_ARGB }, size: 9 };
      cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "right" };
      cell.border = { top: { style: "thin", color: { argb: MID_ARGB } } };
    });
    row.height = 16;
  };

  const applyGrandTotalStyle = (row: import("exceljs").Row) => {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > colCount) return;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE_ARGB } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "right" };
    });
    row.height = 18;
  };

  const applyItemStyle = (row: import("exceljs").Row) => {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > colCount) return;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE_ARGB } };
      cell.font = { size: 9, color: { argb: DARK_ARGB } };
      cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "right" };
    });
    row.height = 15;
  };

  const applyOrgHeaderRow = (row: import("exceljs").Row, leftText: string, rightText: string, isTitleRow: boolean) => {
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
    applyOrgHeaderRow(ws.addRow([]), orgInfo.address,
      exportType === "bs"
        ? `Date Prepared: ${endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
        : `For the Period ${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} to ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      false);
  }
  if (orgInfo.cityState) {
    applyOrgHeaderRow(ws.addRow([]), orgInfo.cityState,
      exportType === "bs"
        ? `As of ${endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
        : `Date Prepared: ${datePrepared}`,
      false);
  }
  ws.addRow([]); // blank spacer

  // ── Column headers ──
  const colHeaderRow = ws.addRow(["", ...labels]);
  applyHeaderStyle(colHeaderRow);

  // ── Data rows ──
  type DataSection = { body: string[][]; kinds: RowKind[] };
  let data: DataSection;
  if (exportType === "pl") {
    data = buildPnLRows(txs, labels, exportFreq, cats) as unknown as DataSection;
  } else if (exportType === "cf") {
    data = cfOverride ? buildCFRowsFromEstimate(cfOverride, labels) : buildCFRows(txs, labels, exportFreq);
  } else {
    data = bsOverride
      ? buildBSRowsFromEstimate(bsOverride, labels)
      : buildBSRows(txs, labels, exportFreq, endDate, exportPeriodCount);
  }

  for (let i = 0; i < data.body.length; i++) {
    const rowData = data.body[i];
    const kind    = data.kinds[i];
    const xlRow   = ws.addRow(rowData);
    if      (kind === "header")     applyHeaderStyle(xlRow);
    else if (kind === "subheader")  applySubheaderStyle(xlRow);
    else if (kind === "total")      applyTotalStyle(xlRow);
    else if (kind === "grandtotal") applyGrandTotalStyle(xlRow);
    else if (kind === "separator")  { xlRow.height = 6; }
    else                            applyItemStyle(xlRow);
  }

  // ── Download ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = exportType === "pl" ? "profit_loss" : exportType === "cf" ? "cash_flow" : "balance_sheet";
  a.download = `booksmart_${slug}_${exportType === "bs" ? exportEnd : exportStart + "_" + exportEnd}.xlsx`;
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
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [plCustomEnd, setPlCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [bsPeriod, setBsPeriod] = useState<Period>("all");
  const [bsCustomStart, setBsCustomStart] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [bsCustomEnd, setBsCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [cfPeriod, setCfPeriod] = useState<Period>("all");
  const [cfShowPaid, setCfShowPaid] = useState(true);
  const [cfCustomStart, setCfCustomStart] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [cfCustomEnd, setCfCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const searchStr = useSearch();
  const [tab, setTab] = useState<Tab>(() => {
    const p = new URLSearchParams(searchStr);
    const t = p.get("tab");
    return (["dashboard","transactions","pl","bs","cf"] as Tab[]).includes(t as Tab) ? t as Tab : "dashboard";
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
  const [editSubCategoryId, setEditSubCategoryId] = useState<number | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [catSearchQuery, setCatSearchQuery] = useState("");
  const [expandedCatIds, setExpandedCatIds] = useState<Set<number>>(new Set());
  const [aiCatLoading, setAiCatLoading] = useState(false);
  const [aiCatSuggested, setAiCatSuggested] = useState(false);
  const [smartCleanOpen, setSmartCleanOpen] = useState(false);
  const [smartCleanPreview, setSmartCleanPreview] = useState<Array<{ id: number; title: string; amount: number }> | null>(null);
  const [smartCleanRunning, setSmartCleanRunning] = useState(false);
  const [plaidConnecting, setPlaidConnecting] = useState(false);
  const [plaidSyncing, setPlaidSyncing] = useState(false);

  // Transactions tab: search + add-transaction form
  const [txSearch, setTxSearch] = useState("");
  const [showAddTx, setShowAddTx] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newType, setNewType] = useState("Business");
  const [newDeductible, setNewDeductible] = useState(false);
  const [newNotes, setNewNotes] = useState("");

  // Export dialog state
  const [showExport, setShowExport] = useState(false);
  const [exportType, setExportType] = useState<ExportReportType>("pl");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [exportFreq, setExportFreq] = useState<ExportFreq>("monthly");
  const [exportStart, setExportStart] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10);
  });
  const [exportEnd, setExportEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [exportPeriodCount, setExportPeriodCount] = useState(3);
  const [isExporting, setIsExporting] = useState(false);

  // Document Repository state
  const [showDocs, setShowDocs] = useState(false);
  const [docSearch, setDocSearch] = useState("");
  const [docCategory, setDocCategory] = useState("All");
  const [deleteDocTarget, setDeleteDocTarget] = useState<DocEntry | null>(null);
  const [deleteDocRunning, setDeleteDocRunning] = useState(false);

  const { data: docs = [], isLoading: docsLoading } = useQuery<DocEntry[]>({
    queryKey: ["user_documents", numericId],
    enabled: numericId !== null,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_documents")
        .select("id,name,file_url,category,tax_year,file_size,mime_type,created_at")
        .eq("user_id", numericId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(row => {
        const ext = (row.name ?? "").split(".").pop()?.toUpperCase() ?? "FILE";
        const sizeBytes = row.file_size as number | null;
        return {
          id: String(row.id),
          title: (row.name ?? "Untitled").replace(/\.[^.]+$/, ""),
          type: ext,
          category: (row.category as string) ?? "Tax Forms",
          date: new Date(row.created_at as string).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          }),
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
  const [uploadYear, setUploadYear] = useState(() => new Date().getFullYear().toString());
  const [uploadPeriodStart, setUploadPeriodStart] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [uploadPeriodEnd, setUploadPeriodEnd] = useState(() => `${new Date().getFullYear()}-12-31`);
  const [uploadAsOf, setUploadAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [uploadSaving, setUploadSaving] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const uploadFileRef = useRef<HTMLInputElement>(null);

  // Document viewer state
  const [viewingDoc, setViewingDoc] = useState<DocEntry | null>(null);
  const [viewDocBlobUrl, setViewDocBlobUrl] = useState<string | null>(null);
  const [viewDocLoading, setViewDocLoading] = useState(false);
  const [viewDocError, setViewDocError] = useState<string | null>(null);

  // Whenever a doc is opened, HEAD-check the public URL to detect missing files
  useEffect(() => {
    if (!viewingDoc?.fileUrl) { setViewDocBlobUrl(null); setViewDocError(null); return; }
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
        if (!cancelled) setViewDocError(msg === "not_found" ? "not_found" : "load_error");
      } finally {
        if (!cancelled) setViewDocLoading(false);
      }
    })();
    return () => { cancelled = true; setViewDocBlobUrl(null); };
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
  const { data: orgId } = useQuery<number | null>({
    queryKey: ["user_org_reports", numericId, activeOrgId],
    enabled: numericId !== null,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id").eq("owner_id", numericId!).order("id", { ascending: true });
      if (error) throw error;
      return pickActiveOrganization(data as { id: number }[] | null, activeOrgId)?.id ?? null;
    },
  });

  // ── Org details (state + business-use overrides) for deduction rule matching ──
  const { data: orgDetails } = useQuery<OrgRow | null>({
    queryKey: ["user_org_details_reports", orgId],
    enabled: orgId != null,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("*").eq("id", orgId!).maybeSingle();
      return (data as OrgRow | null) ?? null;
    },
  });
  const orgStateId = (orgDetails?.state as number | undefined) ?? null;
  const { groups: ruleGroups, rules: deductionRules } = useDeductionRuleSet();

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
    keys.forEach(k => queryClient.invalidateQueries({ queryKey: k }));
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
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `org_id=eq.${orgId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["tx_period", orgId, period] });
        queryClient.invalidateQueries({ queryKey: ["tx_prev_period", orgId, period] });
        queryClient.invalidateQueries({ queryKey: ["tx_all_balance", orgId] });
        queryClient.invalidateQueries({ queryKey: ["tx_all_full", orgId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ dryRun: true, org_id: orgId }),
      });
      const json = await res.json() as { found?: Array<{ id: number; title: string; amount: number }>; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setSmartCleanPreview(json.found ?? []);
    } catch (err) {
      toast({ title: "Smart Clean failed", description: String(err), variant: "destructive" });
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ dryRun: false, org_id: orgId }),
      });
      const json = await res.json() as { deleted?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      const count = json.deleted ?? 0;
      const keysToInvalidate = [
        ["tx_period", orgId, period], ["tx_prev_period", orgId, period],
        ["tx_all_balance", orgId], ["tx_month", orgId],
        ["tx_recent", orgId], ["tx_count", orgId],
      ];
      keysToInvalidate.forEach(k => queryClient.invalidateQueries({ queryKey: k }));
      setSmartCleanOpen(false);
      setSmartCleanPreview(null);
      toast({ title: `Cleaned up ${count} P&L-style entr${count === 1 ? "y" : "ies"}`, description: "Your income, expense, and net profit figures are now accurate." });
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
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
      await supabase.from("transactions").delete().eq("file_path", String(docId));

      // 2. Find statement_imports for this doc
      const { data: imports } = await supabase
        .from("statement_imports")
        .select("id")
        .eq("document_id", docId);

      if (imports && imports.length > 0) {
        const importIds = imports.map((i: { id: number }) => i.id);
        await supabase.from("pending_transactions").delete().in("import_id", importIds);
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
            await fetch(`/api/document-delete?storagePath=${encodeURIComponent(storagePath)}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
          }
        }
      }

      // 4. Delete user_documents record
      await supabase.from("user_documents").delete().eq("id", docId);

      // 5. Invalidate all affected caches
      queryClient.invalidateQueries({ queryKey: ["user_documents", numericId] });
      queryClient.invalidateQueries({ queryKey: ["statement_docs", numericId] });
      const txKeys = [
        ["tx_period", orgId, period], ["tx_prev_period", orgId, period],
        ["tx_all_balance", orgId], ["tx_all_full", orgId],
        ["tx_month", orgId], ["tx_recent", orgId], ["tx_count", orgId],
      ];
      txKeys.forEach(k => queryClient.invalidateQueries({ queryKey: k }));

      setDeleteDocTarget(null);
      toast({ title: "Document deleted", description: "Document and its imported transactions have been removed." });
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
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
      keysToInvalidate.forEach(k => queryClient.invalidateQueries({ queryKey: k }));
      toast({ title: `${ids.length} transaction${ids.length > 1 ? "s" : ""} deleted` });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Update transaction mutation ───────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async (payload: {
      id: number; title: string; amount: number; date_time: string;
      type: string; deductible: boolean; description: string;
      category_id: number | null; sub_category_id: number | null;
    }) => {
      const { id, ...fields } = payload;
      const { error } = await supabase.from("transactions").update(fields).eq("id", id);
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
      keysToInvalidate.forEach(k => queryClient.invalidateQueries({ queryKey: k }));
      toast({ title: "Transaction updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Create transaction mutation ───────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (payload: {
      title: string; amount: number; date_time: string;
      type: string; deductible: boolean; description: string;
    }) => {
      if (!orgId) throw new Error("No organization found");
      await checkAddTransaction();
      const { error } = await supabase.from("transactions").insert({ ...payload, org_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => {
      setShowAddTx(false);
      setNewTitle(""); setNewAmount(""); setNewNotes("");
      setNewType("Business"); setNewDeductible(false);
      setNewDate(new Date().toISOString().slice(0, 10));
      const keys = [
        ["tx_period", orgId, period], ["tx_prev_period", orgId, period],
        ["tx_all_balance", orgId], ["tx_all_full", orgId],
        ["tx_month", orgId], ["tx_recent", orgId], ["tx_count", orgId],
      ];
      keys.forEach(k => queryClient.invalidateQueries({ queryKey: k }));
      toast({ title: "Transaction added" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add transaction", description: err.message, variant: "destructive" });
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

      const catList = categories.map(c => {
        const subs = subCategories.filter(s => s.category_id === c.id);
        return `- ${c.name} (id:${c.id})${subs.length ? ": " + subs.map(s => `${s.name} (id:${s.id})`).join(", ") : ""}`;
      }).join("\n");

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
      const aiData = await res.json() as { choices?: { message?: { content?: string } }[] };
      const content = aiData.choices?.[0]?.message?.content ?? "";
      const jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) return;
      const parsed = JSON.parse(jsonMatch[0]) as { category_id?: number; sub_category_id?: number | null };
      if (parsed.category_id && categories.some(c => c.id === parsed.category_id)) {
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
    setEditDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
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
    try {
      if (!orgId) throw new Error("No active organization found");
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token;
      if (!jwt) throw new Error("Not authenticated");

      const tokenRes = await fetch("/api/plaid/link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ org_id: orgId }),
      });
      const tokenJson = await tokenRes.json() as { link_token?: string; message?: string; error?: string };
      if (!tokenRes.ok || !tokenJson.link_token) {
        throw new Error(tokenJson.message ?? tokenJson.error ?? "Could not start Plaid Link");
      }

      await openPlaidLink({
        token: tokenJson.link_token,
        onSuccess: async (publicToken, metadata) => {
          setPlaidSyncing(true);
          try {
            const exchangeRes = await fetch("/api/plaid/exchange-public-token", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
              body: JSON.stringify({ public_token: publicToken, metadata, org_id: orgId }),
            });
            const exchangeJson = await exchangeRes.json() as { item_id?: number; message?: string; error?: string };
            if (!exchangeRes.ok) throw new Error(exchangeJson.message ?? exchangeJson.error ?? "Could not connect bank");

            const syncRes = await fetch("/api/plaid/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
              body: JSON.stringify({ item_id: exchangeJson.item_id, org_id: orgId }),
            });
            const syncJson = await syncRes.json() as { added?: number; modified?: number; removed?: number; message?: string; error?: string };
            if (!syncRes.ok) throw new Error(syncJson.message ?? syncJson.error ?? "Could not sync bank transactions");

            const changed = (syncJson.added ?? 0) + (syncJson.modified ?? 0);
            if (changed > 0) await categorizeUncategorizedTransactions(Math.min(Math.max(changed, 10), 50));
            invalidateTransactionReports();
            toast({
              title: "Bank connected",
              description: `Synced ${syncJson.added ?? 0} new transaction${(syncJson.added ?? 0) === 1 ? "" : "s"}.`,
            });
          } catch (err) {
            toast({ title: "Bank sync failed", description: String(err), variant: "destructive" });
          } finally {
            setPlaidSyncing(false);
          }
        },
        onExit: (error) => {
          if (error?.error_message) {
            toast({ title: "Plaid Link closed", description: error.error_message, variant: "destructive" });
          }
        },
      });
    } catch (err) {
      toast({ title: "Could not connect bank", description: String(err), variant: "destructive" });
    } finally {
      setPlaidConnecting(false);
    }
  }

  // ── Current period transactions ─────────────────────────────────────────────
  const txPeriod = tab === "pl" ? plPeriod : period;
  const { start, end } = getPeriodRange(txPeriod);
  const { data: txs = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["tx_period", orgId, txPeriod],
    enabled: orgId != null,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, title, amount, type, date_time, description, deductible, category_id, sub_category_id")
        .eq("org_id", orgId!)
        .gte("date_time", start.toISOString())
        .lte("date_time", end.toISOString())
        .order("date_time", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Previous period transactions ────────────────────────────────────────────
  const { start: prevStart, end: prevEnd } = getPrevRange(txPeriod);
  const { data: prevTxs = [] } = useQuery<{ amount: number; title: string }[]>({
    queryKey: ["tx_prev_period", orgId, txPeriod],
    enabled: orgId != null,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("amount, title")
        .eq("org_id", orgId!)
        .gte("date_time", prevStart.toISOString())
        .lte("date_time", prevEnd.toISOString());
      return data ?? [];
    },
  });

  // ── All-time balance for assets ─────────────────────────────────────────────
  // No staleTime: this feeds the shared computeFinancialSnapshot() overview,
  // which must always match the Dashboard's Financial Report card exactly.
  // The Dashboard's equivalent query (tx_month) has no staleTime either, so
  // keeping this one fresh-on-mount too prevents the two pages from
  // showing different Net Profit / Net Income figures after a change.
  const { data: allTxs = [] } = useQuery<{ amount: number }[]>({
    queryKey: ["tx_all_balance", orgId],
    enabled: orgId != null,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions").select("amount").eq("org_id", orgId!);
      return data ?? [];
    },
  });

  // ── All transactions (full fields) for the Transactions tab ─────────────────
  const { data: allTxsFull = [], isLoading: allTxsLoading } = useQuery<Transaction[]>({
    queryKey: ["tx_all_full", orgId],
    enabled: orgId != null,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, title, amount, type, date_time, description, deductible, category_id, sub_category_id")
        .eq("org_id", orgId!)
        .order("date_time", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Uploaded/manually-entered P&L, Balance Sheet, Cash Flow statements ──────
  // Kept fully separate from the transaction-based pl/bs/cf tabs above — this
  // powers the segregated "Financial Statements" tab.
  const { data: statementPeriods = [], isLoading: statementsLoading } = useQuery<StatementPeriod[]>({
    queryKey: ["statement_docs", numericId],
    enabled: numericId !== null,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_documents")
        .select("id, name, category, tax_year, parsed_data")
        .eq("user_id", numericId!)
        .in("category", ["Profit & Loss", "Income Statement", "Balance Sheet", "Cash Flow Statement"]);
      if (error) throw error;
      return (data ?? []).flatMap((row) => normalizeStatementDoc(row as any));
    },
  });

  // ── Categories + sub-categories for the edit dialog ──────────────────────
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("category").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subCategories = [] } = useQuery<SubCategory[]>({
    queryKey: ["sub_categories"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("sub_category").select("id, name, category_id").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Derived metrics ────────────────────────────────────────────────────────
  const income      = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses    = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const netIncome   = income - expenses;
  const margin      = income > 0 ? (netIncome / income) * 100 : 0;

  const prevIncome   = prevTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const prevExpenses = prevTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const prevNet      = prevIncome - prevExpenses;

  // ── Cash Flow Money In/Out — matches Flutter getCashTotals() exactly ────────
  // Period-filtered transactions only; internal transfers excluded; no P&L doc blending.
  const _isInternalTransfer = (title: string) => {
    const t = title.toLowerCase();
    return t.includes('credit card payment') || t.includes('transfer to') || t.includes('autopay');
  };
  // Period-filtered CF (for the CF tab detail view)
  const cfMoneyIn  = txs.filter(t => !_isInternalTransfer(t.title) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const cfMoneyOut = txs.filter(t => !_isInternalTransfer(t.title) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const cfNetCash  = cfMoneyIn - cfMoneyOut;
  const cfDisplayOut = cfShowPaid ? 0 : cfMoneyOut;
  const transactionCf: CashFlowEstimate = {
    operating: cfMoneyIn - cfDisplayOut,
    investing: 0,
    financing: 0,
    netChange: cfMoneyIn - cfDisplayOut,
  };
  const prevCfIn   = prevTxs.filter(t => !_isInternalTransfer(t.title) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const prevCfOut  = prevTxs.filter(t => !_isInternalTransfer(t.title) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const prevCfNet  = prevCfIn - prevCfOut;

  // All-time CF (for the Dashboard tab overview cards — matches the main Dashboard page's all-time view)
  const allTimeCfIn  = allTxsFull.filter(t => !_isInternalTransfer(t.title) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const allTimeCfOut = allTxsFull.filter(t => !_isInternalTransfer(t.title) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const allTimeCfNet = allTimeCfIn - allTimeCfOut;
  const allTimeTransactionBs = useMemo(
    () => estimateBalanceSheetFromTransactions(allTxsFull, categories, subCategories),
    [allTxsFull, categories, subCategories],
  );

  // ── Overview: single shared snapshot (see lib/financial-statements.ts) ─────
  // Uses ALL-time transactions (`allTxs`, matching the Dashboard's Financial
  // Report card) + ALL uploaded/manual statement documents, so the headline
  // KPI cards and Business Overview cards here are IDENTICAL to the numbers
  // shown on the main Dashboard. The period selector above only affects the
  // "vs previous period" comparison badges and the trend chart, not these
  // aggregate totals.
  const snapshot = computeFinancialSnapshot(allTxs, statementPeriods);

  const hasPnlDocs = snapshot.hasPnlDocs;
  const hasBsDocs = snapshot.hasBsDocs;
  const hasCfDocs = snapshot.hasCfDocs;

  const overviewIncome = snapshot.income;
  const overviewExpenses = snapshot.expenses;
  const overviewNetIncome = snapshot.netProfit;
  const overviewMargin = overviewIncome > 0 ? (overviewNetIncome / overviewIncome) * 100 : 0;

  const totalAssets      = hasBsDocs ? snapshot.totalAssets : allTimeTransactionBs.totalAssets;
  const totalLiabilities = hasBsDocs ? snapshot.totalLiabilities : allTimeTransactionBs.totalLiabilities;
  const equity           = hasBsDocs ? snapshot.equity : allTimeTransactionBs.equity;
  const debtToEquity     = equity > 0 ? totalLiabilities / equity : 0;

  // Net Cash MUST equal the Dashboard's Cash Flow "Net Change" figure exactly
  // (pure CF-doc total, no blending with income) whenever CF docs exist, so
  // the two pages never disagree on this headline number. Money In/Out are
  // just a breakdown of that same total's positive/negative activity legs.
  const overviewMoneyIn = hasCfDocs
    ? Math.max(0, snapshot.totalOperating) + Math.max(0, snapshot.totalInvesting) + Math.max(0, snapshot.totalFinancing)
    : overviewIncome;
  const overviewMoneyOut = hasCfDocs
    ? Math.max(0, -snapshot.totalOperating) + Math.max(0, -snapshot.totalInvesting) + Math.max(0, -snapshot.totalFinancing)
    : overviewExpenses;
  const overviewNetCash = hasCfDocs ? snapshot.netChange : overviewNetIncome;

  // AI Deduction Optimization
  // Applies the admin-configured federal deduction rules (percentage caps,
  // per-transaction fixed amounts, org-specific business-use %) instead of
  // assuming every flagged transaction is 100% deductible. Reports has no
  // Federal/State toggle, so it defaults to Federal (consistent with the
  // ~25% federal tax rate estimate below).
  const dedSummary = useMemo(
    () => summarizeDeductions(txs.filter(t => t.deductible), orgStateId, orgDetails ?? null, ruleGroups, deductionRules),
    [txs, orgStateId, orgDetails, ruleGroups, deductionRules],
  );
  const deductibleAmt = dedSummary.totalFederal;
  const deductionPct  = expenses > 0 ? Math.min(100, Math.round((deductibleAmt / expenses) * 100)) : 0;
  const taxSavings    = Math.round(deductibleAmt * 0.25); // ~25% tax rate

  // Business Health Score
  const bhs = Math.min(100, Math.round(
    15 +
    (overviewNetIncome > 0 ? 25 : 0) +
    Math.min(25, (overviewIncome / 1000) * 2) +
    (overviewMargin > 20 ? 20 : overviewMargin > 5 ? 10 : 0) +
    (deductionPct > 50 ? 15 : deductionPct > 20 ? 8 : 0)
  ));

  // Trend chart data
  const trendData = useMemo(() => buildTrendData(txs, txPeriod), [txs, txPeriod]);

  // Period label
  const periodLabel = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

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
          const plan = await planRes.json() as { limits?: { pdfExport?: boolean; excelExport?: boolean }; tier?: string };
          const allowed = exportFormat === "pdf" ? plan.limits?.pdfExport : plan.limits?.excelExport;
          if (allowed === false) {
            if (exportFormat === "pdf") {
              const unlockKey: TokenUnlockKey =
                exportType === "pl" ? "pl_pdf_export"
                : exportType === "cf" ? "cash_flow_pdf_export"
                : "full_financial_pdf_package";
              const cost = exportType === "bs" ? 3 : 1;
              const ok = window.confirm(`${exportType === "bs" ? "Balance Sheet PDF" : exportType === "pl" ? "P&L PDF" : "Cash Flow PDF"} export is not included on your ${plan.tier ?? "current"} plan. Use ${cost} token${cost === 1 ? "" : "s"} for this export?`);
              if (!ok) {
                setIsExporting(false);
                return;
              }
              const result = await spendTokensForUnlock(unlockKey, `${exportType}:${Date.now()}`);
              toast({
                title: "Export unlocked",
                description: result.upgradeMessage ?? `Spent ${cost} token${cost === 1 ? "" : "s"} for this export.`,
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
      // For BS snapshot, fetch all transactions up to asOf date
      const fetchStart = exportType === "bs"
        ? new Date("2000-01-01").toISOString()
        : sDate.toISOString();
      const [{ data: exportTxs }, { data: catData }] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, title, amount, type, date_time, description, deductible, category_id")
          .eq("org_id", orgId)
          .gte("date_time", fetchStart)
          .lte("date_time", eDate.toISOString())
          .order("date_time", { ascending: true }),
        supabase.from("categories").select("id, name, type"),
      ]);
      const rows = exportTxs ?? [];
      const cats: CatRow[] = (catData ?? []) as CatRow[];
      const companyName = (profile as { org_name?: string } | null)?.org_name ?? "";
      const orgRow = orgDetails as Record<string, unknown> | null;
      const orgInfo: OrgInfo = {
        address:   (orgRow?.industry as string | undefined) ?? (orgRow?.address as string | undefined),
        cityState: [orgRow?.city, orgRow?.zip_code].filter(Boolean).join(", ")
                   || (orgRow?.location as string | undefined),
      };

      const bsForExport = exportType === "bs" ? effectiveBs : null;
      const cfForExport = exportType === "cf" ? effectiveCf : null;

      if (exportFormat === "pdf") {
        await exportToPDF(exportType, exportFreq, exportStart, exportEnd, rows, exportPeriodCount, companyName, cats, orgInfo, bsForExport, cfForExport);
      } else if (exportFormat === "excel") {
        await exportToExcel(exportType, exportFreq, exportStart, exportEnd, rows, exportPeriodCount, companyName, cats, orgInfo, bsForExport, cfForExport);
      } else {
        // CSV fallback
        const reportName = exportType === "pl" ? "Profit & Loss" : exportType === "bs" ? "Balance Sheet" : "Cash Flow";
        let csvRows: string[][] = [];
        if (exportType === "pl") {
          const totalRevenue = rows.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
          const totalExpenses = rows.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
          const netIncome = totalRevenue - totalExpenses;
          csvRows = [
            ["BookSmart – Profit & Loss Report"],
            [`Period: ${exportStart} to ${exportEnd}`, `Frequency: ${exportFreq}`],
            [],
            ["Date", "Description", "Category", "Revenue", "Expenses"],
            ...rows.map(t => [
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
          const cf = cfForExport ?? { operating: 0, investing: 0, financing: 0, netChange: 0 };
          csvRows = [
            ["BookSmart – Cash Flow Statement"],
            [`Period: ${exportStart} to ${exportEnd}`, `Frequency: ${exportFreq}`],
            [],
            ["Date", "Description", "Type", "Amount"],
            ...rows.map(t => [
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
            ["Total Liabilities and Equity", (bs.totalLiabilities + bs.equity).toFixed(2)],
          ];
        }
        const slug = reportName.toLowerCase().replace(/\s+/g, "_");
        exportCSV(csvRows, `booksmart_${slug}_${exportStart}_${exportEnd}.csv`);
      }

      setShowExport(false);
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
    delays.forEach(delay => {
      window.setTimeout(async () => {
        const categorization = await categorizeUncategorizedTransactions(30);
        if (categorization.updated > 0) {
          queryClient.invalidateQueries({ queryKey: ["tx_month", orgId] });
          queryClient.invalidateQueries({ queryKey: ["tx_recent", orgId] });
          queryClient.invalidateQueries({ queryKey: ["tx_count", orgId] });
          queryClient.invalidateQueries({ queryKey: ["tx_period", orgId, period] });
          queryClient.invalidateQueries({ queryKey: ["tx_prev_period", orgId, period] });
          queryClient.invalidateQueries({ queryKey: ["tx_all_full", orgId] });
          queryClient.invalidateQueries({ queryKey: ["tx_all_balance", orgId] });
        }
      }, delay);
    });
  }

  async function handleUploadSave() {
    if (!uploadPickedFile) { setUploadError("Please select a file first."); return; }
    if (!uploadName.trim()) { setUploadError("Please enter a document name."); return; }
    if (!uploadCategory) { setUploadError("Please select a document category."); return; }
    if (isBalanceSheetUpload) {
      if (!uploadAsOf) { setUploadError("Please select an As Of date."); return; }
    } else {
      if (!uploadPeriodStart || !uploadPeriodEnd) { setUploadError("Please select period dates."); return; }
      if (uploadPeriodEnd < uploadPeriodStart) { setUploadError("End date must be on or after start date."); return; }
    }
    if (!numericId || !user?.id) { setUploadError("Not authenticated."); return; }

    setUploadSaving(true);
    setUploadError("");
    try {
      // 1. Upload file to Supabase Storage via backend (uses service role key — guaranteed to work)
      const ext = uploadPickedFile.name.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = uploadPickedFile.type || "application/octet-stream";
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated.");

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
        const errBody = await uploadRes.json().catch(() => ({})) as { message?: string };
        throw new Error(`Storage upload failed: ${errBody.message ?? uploadRes.status}`);
      }
      const { publicUrl, storagePath } = await uploadRes.json() as { publicUrl: string; storagePath: string };

      // 3. Build parsed_data (period metadata)
      const parsedData = isBalanceSheetUpload
        ? { as_of: uploadAsOf, document_category: uploadCategory }
        : { period_start: `${uploadPeriodStart}T00:00:00.000`, period_end: `${uploadPeriodEnd}T00:00:00.000`, document_category: uploadCategory };

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
      if (dbError) throw new Error(`Database insert failed: ${dbError.message}`);

      const docType = categoryToDocType(uploadCategory);
      if (docType) {
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
          const extractRes = await fetch("/api/extract-document", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ fileData, mimeType, docType }),
          });
          if (!extractRes.ok) {
            const errBody = await extractRes.json().catch(() => ({})) as { message?: string; error?: string };
            throw new Error(errBody.message ?? errBody.error ?? `Extraction failed: ${extractRes.status}`);
          }
          const extractJson = await extractRes.json() as { extracted?: any };
          const extracted = extractJson.extracted ?? {};
          const flat: Record<string, unknown> = {};
          if (docType === "pnl") {
            Object.assign(flat, extracted);
          } else if (docType === "bs") {
            flat.assets_current = extracted.assets?.current ?? 0;
            flat.assets_non_current = extracted.assets?.non_current ?? 0;
            flat.liabilities_current = extracted.liabilities?.current ?? 0;
            flat.liabilities_long_term = extracted.liabilities?.long_term ?? 0;
            flat.equity = extracted.equity ?? 0;
          } else {
            Object.assign(flat, extracted);
          }
          flat.ai_extracted = true;
          flat.ai_extracted_at = new Date().toISOString();

          const { error: updateError } = await supabase
            .from("user_documents")
            .update({ parsed_data: { ...parsedData, ...flat }, updated_at: new Date().toISOString() })
            .eq("id", docData.id);
          if (updateError) throw updateError;
        } catch (err) {
          console.warn("[upload] financial statement extraction failed:", err);
          toast({
            title: "Document saved, extraction failed",
            description: "The file was uploaded, but no extracted figures were saved. Try uploading a clearer statement.",
            variant: "destructive",
          });
        }
      }

      // 5. Refresh document list
      queryClient.invalidateQueries({ queryKey: ["user_documents", numericId] });
      queryClient.invalidateQueries({ queryKey: ["statement_docs", numericId] });
      setShowUpload(false);
      resetUploadForm();

      // 6. If this is a bank statement / transaction document → trigger AI scan
      const isStatementDoc = uploadCategory === "Transactions";
      if (isStatementDoc && docData?.id) {
        if (!orgId) throw new Error("No organization found for your account. Please contact support.");

        setScanningImportId(-1);
        toast({
          title: "Document uploaded!",
          description: "Your transaction document was queued for n8n processing.",
        });

        let extractedText: string | null = null;
        let isScanned = mimeType.startsWith("image/");

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
              const payload = await textRes.json() as { text?: string; isScanned?: boolean };
              extractedText = payload.text || null;
              isScanned = payload.isScanned ?? false;
            }
          } catch (err) {
            console.warn("[upload] extract-text failed, continuing with n8n OCR path:", err);
          }
        }

        const { data: importData, error: importError } = await supabase
          .from("statement_imports")
          .insert({
            user_id: numericId,
            org_id: orgId,
            document_id: docData.id,
            document_path: storagePath,
            mime_type: mimeType,
            is_scanned: isScanned,
            extracted_text: extractedText,
            status: "processing",
          })
          .select("id")
          .single();

        if (importError) throw new Error(importError.message);

        setScanningImportId((importData as { id: number }).id);
        toast({
          title: "Transaction import started",
          description: "n8n will extract transactions from this file.",
        });
        scheduleUploadCategorization();
        return;
        /*

        toast({
          title: "Document uploaded!",
          description: "AI is scanning your bank statement for transactions… this takes about 15–30 seconds.",
        });

        // Read file as base64 for the API call
        const fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.includes(",") ? result.split(",")[1] : result);
          };
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(uploadPickedFile);
        });

        // Get session JWT
        const { data: sessionData } = await supabase.auth.getSession();
        const jwt = sessionData.session?.access_token;
        if (!jwt) throw new Error("Not authenticated");

        // Call /api/scan-statement directly — no statement_imports row needed
        fetch("/api/scan-statement", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({ fileData, mimeType, documentId: docData.id, org_id: orgId }),
        })
          .then((r) => r.json())
          .then(async (result: unknown) => {
            setScanningImportId(null);
            const count = (result as { count?: number })?.count ?? 0;
            if (count > 0) {
              const categorization = await categorizeUncategorizedTransactions(count);
              toast({
                title: `${count} transactions added!`,
                description: categorization.updated > 0
                  ? `${categorization.updated} transaction${categorization.updated === 1 ? "" : "s"} categorized automatically.`
                  : "Your income & expense totals have been updated on the dashboard.",
              });
              queryClient.invalidateQueries({ queryKey: ["tx_month", orgId] });
              queryClient.invalidateQueries({ queryKey: ["tx_recent", orgId] });
              queryClient.invalidateQueries({ queryKey: ["tx_count", orgId] });
              queryClient.invalidateQueries({ queryKey: ["tx_all_full", orgId] });
              queryClient.invalidateQueries({ queryKey: ["tx_all_balance", orgId] });
            } else {
              toast({
                title: "Scan complete",
                description: "No transactions were extracted. The document may be a summary or unsupported format.",
                variant: "destructive",
              });
            }
          })
          .catch(() => {
            setScanningImportId(null);
            toast({
              title: "Scan failed",
              description: "Could not extract transactions from the document. Try a different format.",
              variant: "destructive",
            });
          });
        */
      } else {
        toast({ title: "Document uploaded successfully!" });
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploadSaving(false);
    }
  }

  const filteredDocs = docs.filter(d => {
    const matchSearch = (d.title ?? "").toLowerCase().includes(docSearch.toLowerCase());
    const matchCat = docCategory === "All" || d.category === docCategory || d.type === docCategory;
    return matchSearch && matchCat;
  });

  // ── Document-sourced statement periods, segregated by type ──────────────────
  // Each of the P&L / Balance Sheet / Cash Flow tabs shows ONLY this source
  // (official uploaded/manual documents) — never blended with transaction data.
  const plRange = plPeriod === "custom"
    ? { start: new Date(plCustomStart), end: new Date(plCustomEnd) }
    : getPeriodRange(plPeriod);
  const pnlPeriods = statementPeriods
    .filter((p) => p.docType === "pnl")
    .filter((p) => plPeriod === "all" || periodOverlaps(p, plRange.start, plRange.end))
    .sort(sortByPeriodDesc);
  const bsRange = bsPeriod === "custom"
    ? { start: new Date(bsCustomStart), end: new Date(bsCustomEnd) }
    : getPeriodRange(bsPeriod);
  const bsPeriods = statementPeriods
    .filter((p) => p.docType === "bs")
    .filter((p) => bsPeriod === "all" || periodOverlaps(p, bsRange.start, bsRange.end))
    .sort(sortByPeriodDesc);
  const cfRange = cfPeriod === "custom"
    ? { start: new Date(cfCustomStart), end: new Date(cfCustomEnd) }
    : getPeriodRange(cfPeriod);
  const cfPeriods = statementPeriods
    .filter((p) => p.docType === "cf")
    .filter((p) => cfPeriod === "all" || periodOverlaps(p, cfRange.start, cfRange.end))
    .sort(sortByPeriodDesc);

  // ── Overall computation across ALL uploaded documents of each type ──────────
  const hasPnlPeriodDocs = pnlPeriods.length > 0;
  const pnlSummary = useMemo(() => {
    if (!hasPnlPeriodDocs) {
      return { totalRevenue: income, totalExpenses: expenses, netIncome, count: txs.length };
    }
    const totalRevenue = pnlPeriods.reduce((s, p) => s + (p.pnl?.revenue ?? 0), 0);
    const totalCogs = pnlPeriods.reduce((s, p) => s + (p.pnl?.cogs ?? 0), 0);
    const totalOpex = pnlPeriods.reduce((s, p) => s + (p.pnl?.opex ?? 0), 0);
    const docNetIncome = pnlPeriods.reduce((s, p) => s + (p.pnl?.netIncome ?? 0), 0);
    return { totalRevenue, totalExpenses: totalCogs + totalOpex, netIncome: docNetIncome, count: pnlPeriods.length };
  }, [hasPnlPeriodDocs, income, expenses, netIncome, pnlPeriods, txs.length]);
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
    () => getNiceTrendScale(trendData, ["revenue", "expenses", "netCash", "profit"]),
    [trendData],
  );
  const pnlTrendScale = useMemo(
    () => getNiceTrendScale(pnlChartData, ["Revenue", "Expenses", "Net Income"]),
    [pnlChartData],
  );
  const cashFlowTrendScale = useMemo(
    () => getNiceTrendScale(trendData, cfShowPaid ? ["revenue", "netCash"] : ["revenue", "expenses", "netCash", "profit"]),
    [cfShowPaid, trendData],
  );

  // Period-over-period growth % for Revenue, Expenses (COGS+Opex), and COGS
  // alone — computed strictly from the same uploaded/manual P&L statements
  // (chronological order), so it stays consistent with pnlChartData above.
  const pnlGrowthData = useMemo(() => {
    const chrono = [...pnlPeriods].reverse();
    const growthPct = (curr: number, prev: number) => {
      if (prev === 0) return curr === 0 ? 0 : 100;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };
    if (!hasPnlPeriodDocs) {
      return trendData.map((d, i) => {
        const prev = i > 0 ? trendData[i - 1] : null;
        return {
          label: d.label,
          "Revenue Growth": prev ? Math.round(growthPct(d.revenue, prev.revenue) * 10) / 10 : 0,
          "Expense Growth": prev ? Math.round(growthPct(d.expenses, prev.expenses) * 10) / 10 : 0,
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
      const prevExpenses = prev ? (prev.pnl?.cogs ?? 0) + (prev.pnl?.opex ?? 0) : 0;
      const prevCogs = prev?.pnl?.cogs ?? 0;
      return {
        label: statementPeriodLabel(p),
        "Revenue Growth": prev ? Math.round(growthPct(revenue, prevRevenue) * 10) / 10 : 0,
        "Expense Growth": prev ? Math.round(growthPct(expenses, prevExpenses) * 10) / 10 : 0,
        "COGS Growth": prev ? Math.round(growthPct(cogs, prevCogs) * 10) / 10 : 0,
      };
    });
  }, [hasPnlPeriodDocs, pnlPeriods, trendData]);

  const bsLatest = bsPeriods[0] ?? null;
  const hasBsPeriodDocs = bsPeriods.length > 0;
  const transactionBs = useMemo(
    () => estimateBalanceSheetFromTransactions(txs, categories, subCategories),
    [txs, categories, subCategories],
  );
  const transactionAssetEstimate = transactionBs.totalAssets;
  const transactionLiabilityEstimate = transactionBs.totalLiabilities;
  const transactionEquityEstimate = transactionBs.equity;
  const bsSummary = useMemo(() => {
    if (!hasBsPeriodDocs) {
      return {
        totalAssets: transactionAssetEstimate,
        totalLiabilities: transactionLiabilityEstimate,
        totalEquity: transactionEquityEstimate,
        count: allTxs.length,
      };
    }
    const totalAssets = bsPeriods.reduce((s, p) => s + (p.bs?.totalAssets ?? 0), 0);
    const totalLiabilities = bsPeriods.reduce((s, p) => s + (p.bs?.totalLiabilities ?? 0), 0);
    const totalEquity = bsPeriods.reduce((s, p) => s + (p.bs?.equity ?? 0), 0);
    return { totalAssets, totalLiabilities, totalEquity, count: bsPeriods.length };
  }, [allTxs.length, bsPeriods, hasBsPeriodDocs, transactionAssetEstimate, transactionEquityEstimate, transactionLiabilityEstimate]);
  const bsChartData = useMemo(() => {
    if (!hasBsPeriodDocs) {
      return [{
        label: end.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        Assets: transactionAssetEstimate,
        Liabilities: transactionLiabilityEstimate,
        Equity: transactionEquityEstimate,
      }];
    }
    return [...bsPeriods].reverse().map((p) => ({
      label: statementPeriodLabel(p),
      Assets: p.bs?.totalAssets ?? 0,
      Liabilities: p.bs?.totalLiabilities ?? 0,
      Equity: p.bs?.equity ?? 0,
    }));
  }, [bsPeriods, end, hasBsPeriodDocs, transactionAssetEstimate, transactionEquityEstimate, transactionLiabilityEstimate]);
  const effectiveBs = bsLatest?.bs ?? (!hasBsPeriodDocs ? transactionBs : null);

  const cfSummary = useMemo(() => {
    const totalOperating = cfPeriods.reduce((s, p) => s + (p.cf?.operating ?? 0), 0);
    const totalInvesting = cfPeriods.reduce((s, p) => s + (p.cf?.investing ?? 0), 0);
    const totalFinancing = cfPeriods.reduce((s, p) => s + (p.cf?.financing ?? 0), 0);
    const netChange = cfPeriods.reduce((s, p) => s + (p.cf?.netChange ?? 0), 0);
    return { totalOperating, totalInvesting, totalFinancing, netChange, count: cfPeriods.length };
  }, [cfPeriods]);
  const effectiveCf: CashFlowEstimate = cfPeriods.length > 0
    ? {
        operating: cfSummary.totalOperating,
        investing: cfSummary.totalInvesting,
        financing: cfSummary.totalFinancing,
        netChange: cfSummary.netChange,
      }
    : transactionCf;
  const cfChartData = useMemo(() => (
    [...cfPeriods].reverse().map((p) => ({
      label: statementPeriodLabel(p),
      Operating: p.cf?.operating ?? 0,
      Investing: p.cf?.investing ?? 0,
      Financing: p.cf?.financing ?? 0,
      "Net Change": p.cf?.netChange ?? 0,
    }))
  ), [cfPeriods]);

  const cfGrowthData = useMemo(() => {
    const chrono = [...cfPeriods].reverse();
    const growthPct = (curr: number, prev: number) => {
      if (prev === 0) return curr === 0 ? 0 : 100;
      return ((curr - prev) / Math.abs(prev)) * 100;
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
        "Operating Growth": prev ? Math.round(growthPct(operating, prevOperating) * 10) / 10 : 0,
        "Financing Growth": prev ? Math.round(growthPct(financing, prevFinancing) * 10) / 10 : 0,
        "Net Change Growth": prev ? Math.round(growthPct(netChange, prevNetChange) * 10) / 10 : 0,
      };
    });
  }, [cfPeriods]);

  // ── Transaction-derived Cash Flow growth (from shared trendData / txs pipeline) ──
  // Summary totals come from `income`, `expenses`, `netIncome` (same source as Dashboard),
  // and the trend chart uses the shared `trendData` so numbers always match.
  const cfTrendGrowth = useMemo(() => {
    const growthPct = (curr: number, prev: number) => {
      if (prev === 0) return curr === 0 ? 0 : 100;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };
    return trendData.map((d, i) => {
      const prev = i > 0 ? trendData[i - 1] : null;
      return {
        label: d.label,
        "Income Growth": prev ? Math.round(growthPct(d.revenue, prev.revenue) * 10) / 10 : 0,
        "Expense Growth": prev ? Math.round(growthPct(d.expenses, prev.expenses) * 10) / 10 : 0,
        "Net Cash Growth": prev ? Math.round(growthPct(d.netCash, prev.netCash) * 10) / 10 : 0,
      };
    });
  }, [trendData]);

  // Key insights
  const insights: string[] = [];
  if (txs.length > 0) {
    insights.push(`Net income is ${fmt(netIncome)}`);
    if (netIncome >= 0) insights.push(`Income exceeded expenses by ${fmt(netIncome)}`);
    else insights.push(`Expenses exceeded income by ${fmt(Math.abs(netIncome))}`);
    insights.push(`Equity ${equity > 0 ? "increased" : "unchanged"} ${pctLabel(changePct(equity, equity * 0.9))}`);
    insights.push(`${netIncome >= 0 ? "Positive" : "Negative"} cash flow of ${fmt(Math.abs(netIncome))}`);
    if (expenses > 0) insights.push(`You have ${fmt(expenses)} in potential deductions`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-0 animate-in fade-in slide-in-from-bottom-4 duration-500 -mt-2">

      {/* ── Flutter-style Tab Bar ── */}
      <div className="flex items-stretch -mx-6 px-0 mb-6" style={{ height: 58, borderBottom: "1px solid rgba(18,52,105,0.6)", background: "hsl(var(--background))" }}>
        {TAB_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1,
              borderBottom: tab === key ? "2px solid #FFC72B" : "2px solid transparent",
              color: tab === key ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
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
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Business Health Score</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center gap-1 pb-4">
                    <BHSGauge score={bhs} />
                    <p className="text-xs text-muted-foreground">{end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                  </CardContent>
                </Card>

                {/* Net Income */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Net Income (Profit)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-4">
                    <p className={`text-2xl font-bold ${overviewNetIncome >= 0 ? "text-foreground" : "text-rose-400"}`}>
                      {fmt(overviewNetIncome)}
                    </p>
                    <div className="flex items-center gap-2">
                      <ChangeBadge curr={overviewNetIncome} prev={prevNet} />
                      <span className="text-xs text-muted-foreground">vs previous period</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Total Assets */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Total Assets</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-4">
                    <p className="text-2xl font-bold">{fmt(totalAssets)}</p>
                    <div className="flex items-center gap-2">
                      <ChangeBadge curr={totalAssets} prev={totalAssets * 0.99} />
                      <span className="text-xs text-muted-foreground">vs previous period</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Cash Flow */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Cash Flow (Net Cash)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-4">
                    <p className={`text-2xl font-bold ${allTimeCfNet >= 0 ? "text-foreground" : "text-rose-400"}`}>
                      {fmt(allTimeCfNet)}
                    </p>
                    <div className="flex items-center gap-2">
                      <ChangeBadge curr={allTimeCfNet} prev={prevCfNet} />
                      <span className="text-xs text-muted-foreground">vs previous period</span>
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
                      <CardTitle className="text-sm font-semibold">Profit &amp; Loss Overview</CardTitle>
                      <p className="text-[10px] text-muted-foreground">{periodLabel}</p>
                    </CardHeader>
                    <CardContent className="space-y-2 pb-3">
                      {[
                        { label: "Income", val: overviewIncome, prev: prevIncome },
                        { label: "Expenses", val: overviewExpenses, prev: prevExpenses },
                        { label: "Net Income", val: overviewNetIncome, prev: prevNet },
                      ].map(r => (
                        <div key={r.label} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{r.label}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{fmt(r.val)}</span>
                            <ChangeBadge curr={r.val} prev={r.prev} />
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">% Margin</span>
                        <span className="font-semibold text-primary">{overviewMargin.toFixed(1)}%</span>
                      </div>
                      <button onClick={() => setTab("pl")} className="flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                        View Profit &amp; Loss <ArrowRight className="h-3 w-3" />
                      </button>
                    </CardContent>
                  </Card>

                  {/* Balance Sheet */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Balance Sheet Overview</CardTitle>
                      <p className="text-[10px] text-muted-foreground">As of {end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                    </CardHeader>
                    <CardContent className="space-y-2 pb-3">
                      {[
                        { label: "Total Assets", val: totalAssets },
                        { label: "Total Liabilities", val: totalLiabilities },
                        { label: "Equity", val: equity },
                      ].map(r => (
                        <div key={r.label} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{r.label}</span>
                          <span className="font-semibold">{fmt(r.val)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">Debt-to-Equity</span>
                        <span className="font-semibold">{debtToEquity.toFixed(2)}</span>
                      </div>
                      <button onClick={() => setTab("bs")} className="flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                        View Balance Sheet <ArrowRight className="h-3 w-3" />
                      </button>
                    </CardContent>
                  </Card>

                  {/* Cash Flow */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Cash Flow Overview</CardTitle>
                      <p className="text-[10px] text-muted-foreground">{periodLabel}</p>
                    </CardHeader>
                    <CardContent className="space-y-2 pb-3">
                      {[
                        { label: "Money In", val: allTimeCfIn, prev: prevCfIn },
                        { label: "Money Out", val: allTimeCfOut, prev: prevCfOut },
                        { label: "Net Cash", val: allTimeCfNet, prev: prevCfNet },
                      ].map(r => (
                        <div key={r.label} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{r.label}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{fmt(r.val)}</span>
                            <ChangeBadge curr={r.val} prev={r.prev} />
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">Cash Flow Trend</span>
                        <span className={`font-semibold ${allTimeCfNet >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {allTimeCfNet >= 0 ? "Positive" : "Negative"}
                        </span>
                      </div>
                      <button onClick={() => setTab("cf")} className="flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                        View Cash Flow <ArrowRight className="h-3 w-3" />
                      </button>
                    </CardContent>
                  </Card>

                  {/* AI Deduction Optimization */}
                  <Card className="border-primary/20 bg-gradient-to-b from-card to-primary/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" /> AI Deduction Optimization
                      </CardTitle>
                      <p className="text-[10px] text-muted-foreground">Deduction Optimization Level</p>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <div className="flex items-center gap-3">
                        <CircularGauge pct={deductionPct} size={85} />
                        <div className="space-y-2 flex-1">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Additional Tax Deductions Found</p>
                            <p className="text-sm font-bold text-primary">{fmt(deductibleAmt)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Potential Tax Savings</p>
                            <p className="text-sm font-bold text-emerald-400">{fmt(taxSavings)}</p>
                          </div>
                        </div>
                      </div>
                      {expenses > 0 && deductionPct < 80 && (
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {(100 - deductionPct).toFixed(0)}% of deductions not yet utilised.
                          You saved {fmt(deductibleAmt)} in deductions this period.
                        </p>
                      )}
                      <button onClick={() => setTab("dashboard")} className="flex items-center gap-1 text-xs text-primary hover:underline mt-2">
                        View AI Activity <ArrowRight className="h-3 w-3" />
                      </button>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* ── Financial Trend + Key Insights ── */}
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Chart — 2/3 width */}
                <Card className="lg:col-span-2 shadow-none" style={trendChartPanelStyle}>
                  <CardHeader className="pb-0 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold text-[#DCE8FF]">Financial Trend</CardTitle>
                    <p className="text-[10px] text-[#8EA5D2]">{financialTrendScale.topLabel}</p>
                  </CardHeader>
                  <CardContent className="pb-3 px-4 pt-0">
                    {trendData.length === 0 ? (
                      <div className="flex items-center justify-center h-[220px]">
                        <p className="text-sm text-muted-foreground">No data for this period</p>
                      </div>
                    ) : (
                      <>
                        <ResponsiveContainer width="100%" height={220}>
                          <ComposedChart data={trendData} margin={{ top: 34, right: 0, left: -16, bottom: 0 }}>
                            <defs>
                              <linearGradient id="dashRevBar" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#20C987" stopOpacity={1} />
                                <stop offset="100%" stopColor="#159F70" stopOpacity={1} />
                              </linearGradient>
                              <linearGradient id="dashExpBar" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3B8CFF" stopOpacity={1} />
                                <stop offset="100%" stopColor="#2163C9" stopOpacity={1} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke={trendChartGrid} />
                            <XAxis dataKey="label" tick={trendAxisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                            <YAxis tick={trendAxisTick} tickLine={false} axisLine={false} tickFormatter={fmtTrendTick} ticks={financialTrendScale.ticks} domain={financialTrendScale.domain} width={58} />
                            <Tooltip
                              contentStyle={trendTooltipStyle}
                              labelStyle={{ color: "#EAF2FF" }}
                              itemStyle={{ color: "#EAF2FF" }}
                              formatter={(v: number) => fmt(v)}
                            />
                            <Bar dataKey="revenue" name="Revenue" fill="url(#dashRevBar)" radius={[4, 4, 0, 0]} barSize={18} />
                            <Bar dataKey="expenses" name="Expenses" fill="url(#dashExpBar)" radius={[4, 4, 0, 0]} barSize={18} />
                            <Line type="monotone" dataKey="netCash" name="Net Cash" stroke="#FFC72B" strokeWidth={2} dot={{ r: 3, fill: "#FFC72B", stroke: "#061f49", strokeWidth: 1 }} activeDot={{ r: 4, fill: "#FFC72B" }} />
                            <Line type="monotone" dataKey="profit" name="Profit" stroke="#F3F7FF" strokeWidth={2.5} dot={{ r: 3, fill: "#F3F7FF", stroke: "#061f49", strokeWidth: 1 }} activeDot={{ r: 5, fill: "#F3F7FF" }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                        <div className="flex items-center gap-4 justify-center mt-0 pb-1">
                          <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                            <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: "#20C987" }} />Revenue
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                            <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: "#2B7FFF" }} />Expenses
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                            <span className="inline-block w-5 border-t-2 mb-0.5" style={{ borderColor: "#FFC72B" }} />Net Cash
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                            <span className="inline-block w-5 border-t-2 mb-0.5" style={{ borderColor: "#F3F7FF" }} />Profit
                          </span>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Key Financial Insights — 1/3 width */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Key Financial Insights</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-4">
                    {txs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data for this period. Upload and approve bank statements to see insights.</p>
                    ) : (
                      insights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                          <p className="text-sm text-muted-foreground">{insight}</p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ── Business Health Summary banner ── */}
              <div
                className="rounded-xl border border-border px-6 py-4 text-center"
                style={{ background: "linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)))" }}
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Business Health Summary</p>
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
              <div className="grid grid-cols-2 gap-0 rounded-xl overflow-hidden border border-border md:grid-cols-4" style={{ background: "hsl(var(--muted))" }}>
                {[
                  { label: "Transactions", action: () => setTab("transactions") },
                  { label: "Dun & Bradstreet", action: () => navigate("/user") },
                  { label: "Reports", action: () => navigate("/user/tax") },
                  { label: "Accounts", action: handleConnectBank, disabled: plaidConnecting || plaidSyncing },
                ].map((item, i) => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    disabled={item.disabled}
                    className="py-4 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    style={{ borderLeft: i > 0 ? "1px solid rgba(18,52,105,0.6)" : undefined }}
                  >
                    {item.label === "Accounts" && (plaidConnecting || plaidSyncing)
                      ? plaidSyncing ? "Syncing..." : "Connecting..."
                      : item.label}
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
              <Button size="sm" variant="outline" className="border-border/60 text-muted-foreground hover:bg-secondary/50 gap-1.5 text-xs h-8" onClick={() => { setExportType("pl"); setShowExport(true); }}>
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={() => setShowDocs(true)}>
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
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* ── 4 KPI cards (Flutter style) ── */}
              {(() => {
                const income = pnlSummary.totalRevenue;
                const expenses = pnlSummary.totalExpenses;
                const grossProfit = income - expenses;
                const margin = income > 0 ? (grossProfit / income) * 100 : 0;
                const kpis = [
                  { label: "Income", value: fmt(income), color: "#22c55e", badge: "Prev", up: true, sub: "Upcoming Prediction" },
                  { label: "Expenses", value: fmt(expenses), color: "#f97316", badge: "Prev", up: false, sub: "Upcoming Prediction" },
                  { label: "Gross Profit", value: fmt(grossProfit), color: grossProfit >= 0 ? "#22c55e" : "#ef4444", badge: "Prev", up: grossProfit >= 0, sub: "Upcoming Prediction" },
                  { label: "% Margin", value: `${margin.toFixed(1)}%`, color: margin >= 0 ? "#22c55e" : "#ef4444", badge: "Max", up: margin >= 0, sub: "vs previous 6 months" },
                ];
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {kpis.map(k => (
                      <div
                        key={k.label}
                        className="rounded-xl border border-border px-4 py-4 flex flex-col gap-2"
                        style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}
                      >
                        <p className="text-[11px] text-muted-foreground text-center font-medium">{k.label}</p>
                        <p className="text-xl font-bold text-foreground text-center truncate">{k.value}</p>
                        <div className="flex items-center justify-between gap-1 mt-auto">
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: k.up ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: k.up ? "#22c55e" : "#ef4444" }}
                          >
                            {k.up ? "▲" : "▼"} {k.badge}
                          </span>
                          <span className="text-[9px] text-muted-foreground text-right leading-tight">{k.sub}</span>
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
                      <CardTitle className="text-sm font-semibold text-[#DCE8FF]">P &amp; L Trends</CardTitle>
                      <p className="text-[10px] text-[#8EA5D2] mt-0.5">{pnlTrendScale.topLabel}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="text-[10px] font-medium text-[#8EA5D2] border border-[#2B7FFF]/35 rounded px-2 py-1 hover:text-[#EAF2FF] transition-colors">
                        Filter +
                      </button>
                      <label className="flex items-center gap-1 text-[10px] text-[#8EA5D2] cursor-pointer">
                        <input type="checkbox" className="h-3 w-3 accent-primary" />
                        at prior month
                      </label>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="h-[260px] pt-0 px-4 pb-3">
                  {pnlChartData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground text-center">No P&amp;L statements yet.<br />Upload a document to see trends.</p>
                      <Button size="sm" className="gap-1.5 text-xs" onClick={() => setShowDocs(true)}>
                        <Upload className="h-3.5 w-3.5" /> Upload Statement
                      </Button>
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={220}>
                        <ComposedChart data={pnlChartData} margin={{ top: 34, right: 0, left: -16, bottom: 0 }}>
                          <defs>
                            <linearGradient id="plRevBar" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#20C987" stopOpacity={1} />
                              <stop offset="100%" stopColor="#159F70" stopOpacity={1} />
                            </linearGradient>
                            <linearGradient id="plExpBar" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3B8CFF" stopOpacity={1} />
                              <stop offset="100%" stopColor="#2163C9" stopOpacity={1} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} stroke={trendChartGrid} />
                          <XAxis dataKey="label" tick={trendAxisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={trendAxisTick} axisLine={false} tickLine={false} tickFormatter={fmtTrendTick} ticks={pnlTrendScale.ticks} domain={pnlTrendScale.domain} width={58} />
                          <Tooltip
                            contentStyle={trendTooltipStyle}
                            labelStyle={{ color: "#EAF2FF" }}
                            itemStyle={{ color: "#EAF2FF" }}
                            formatter={(v: number) => fmt(v)}
                          />
                          <Bar dataKey="Revenue" name="Revenue" fill="url(#plRevBar)" radius={[4, 4, 0, 0]} barSize={18} />
                          <Bar dataKey="Expenses" name="Expenses" fill="url(#plExpBar)" radius={[4, 4, 0, 0]} barSize={18} />
                          <Line type="monotone" dataKey="Net Income" name="Net Income" stroke="#F3F7FF" strokeWidth={2.5} dot={{ r: 3, fill: "#F3F7FF", stroke: "#061f49", strokeWidth: 1 }} activeDot={{ r: 5, fill: "#F3F7FF" }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                      <div className="flex items-center gap-4 justify-center mt-0">
                        <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                          <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: "#20C987" }} />Revenue
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                          <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: "#2B7FFF" }} />Expenses
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                          <span className="inline-block w-5 border-t-2 mb-0.5" style={{ borderColor: "#F3F7FF" }} />Net Income
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* ── Growth charts (side by side) ── */}
              {pnlChartData.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))", border: "1px solid rgba(18,52,105,0.5)" }}>
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm font-semibold">Revenue Growth vs Expense Growth</CardTitle>
                      <p className="text-[10px] text-muted-foreground">{periodLabel}</p>
                    </CardHeader>
                    <CardContent className="h-[200px] pt-2">
                      {pnlGrowthData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={pnlGrowthData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                            <defs>
                              <linearGradient id="rgRevGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="rgExpGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f472b6" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#f472b6" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                            <Tooltip contentStyle={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} formatter={(v: number) => `${v.toFixed(1)}%`} />
                            <Legend wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }} />
                            <Area type="monotone" dataKey="Revenue Growth" stroke="#38bdf8" strokeWidth={2} fill="url(#rgRevGrad)" dot={false} />
                            <Area type="monotone" dataKey="Expense Growth" stroke="#f472b6" strokeWidth={2} fill="url(#rgExpGrad)" dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-xs text-muted-foreground text-center px-4">Upload another P&amp;L statement to see growth trends.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))", border: "1px solid rgba(18,52,105,0.5)" }}>
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm font-semibold">COGS Growth vs Revenue Growth</CardTitle>
                      <p className="text-[10px] text-muted-foreground">{periodLabel}</p>
                    </CardHeader>
                    <CardContent className="h-[200px] pt-2">
                      {pnlGrowthData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={pnlGrowthData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                            <defs>
                              <linearGradient id="cgRevGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#FFC72B" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#FFC72B" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="cgCogsGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                            <Tooltip contentStyle={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} formatter={(v: number) => `${v.toFixed(1)}%`} />
                            <Legend wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }} />
                            <Area type="monotone" dataKey="Revenue Growth" stroke="#FFC72B" strokeWidth={2} fill="url(#cgRevGrad)" dot={false} />
                            <Area type="monotone" dataKey="COGS Growth" stroke="#22c55e" strokeWidth={2} fill="url(#cgCogsGrad)" dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-xs text-muted-foreground text-center px-4">Upload another P&amp;L statement to see COGS trends.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ── Recently Uploaded list ── */}
              {pnlPeriods.length > 0 ? (
                <div>
                  <h2 className="text-sm font-semibold text-foreground mb-3">Recently Uploaded</h2>
                  <div className="space-y-2">
                    {pnlPeriods.map((p, i) => (
                      <div
                        key={`${p.docId}-${i}`}
                        className="flex items-center gap-3 rounded-xl border border-border px-4 py-3"
                        style={{ background: "linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)))" }}
                      >
                        <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <FileText className="h-4.5 w-4.5 text-primary" style={{ height: 18, width: 18 }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{p.docName}</p>
                          <p className="text-[10px] text-muted-foreground">Profit &amp; Loss · {statementPeriodLabel(p)}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-muted-foreground">{p.pnl ? fmt(p.pnl.revenue) : "—"}</span>
                          <button
                            className="text-[10px] font-bold text-muted-foreground border border-border rounded px-2 py-1 hover:text-foreground transition-colors"
                          >
                            VIEW
                          </button>
                          <span
                            className="inline-flex items-center justify-center h-6 w-6 rounded text-[10px] font-bold"
                            style={{ background: p.source === "manual" ? "rgba(59,130,246,0.2)" : "rgba(239,68,68,0.2)", color: p.source === "manual" ? "#60a5fa" : "#f87171" }}
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
                  style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}
                >
                  <FileText className="h-10 w-10 text-muted-foreground/60" />
                  <div>
                    <p className="font-medium text-foreground">No P&amp;L statements yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Upload a Profit &amp; Loss document to see it here.</p>
                  </div>
                  <Button size="sm" className="mt-2 gap-1.5" onClick={() => setShowDocs(true)}>
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Balance Sheet</h1>
              <p className="text-xs text-muted-foreground">Snapshot as of {end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
              {!hasBsPeriodDocs && (
                <p className="text-xs text-[#FFC72B] mt-1">
                  Estimated from transactions. Upload a Balance Sheet for full assets, liabilities, equity, and ratios.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-muted-foreground mr-1">As Of Date: <strong className="text-foreground">{end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</strong> 📅</span>
              <Button size="sm" variant="outline" className="border-border/60 text-muted-foreground hover:bg-secondary/50 gap-1.5 text-xs h-8" onClick={() => { setExportType("bs"); setShowExport(true); }}>
                <Download className="h-3.5 w-3.5" /> EXPORT
              </Button>
              <Button size="sm" className="gap-1.5 text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setShowDocs(true)}>
                <Upload className="h-3.5 w-3.5" /> UPLOAD
              </Button>
            </div>
          </div>

          {statementsLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* ── Top 3 KPI cards ── */}
              {(() => {
                const asOfLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                const kpis = [
                  {
                    label: "Total Assets",
                    value: fmt(bsSummary.totalAssets),
                    tooltip: null as string | null,
                  },
                  {
                    label: "Total Liabilities",
                    value: fmt(bsSummary.totalLiabilities),
                    tooltip: "Debt / Equity Ratio\nHow much you owe vs what you own.\n• Good: Below 1\n• Strong: Below 0.5\n• Watch out: Above 2 means heavy reliance on debt.",
                  },
                  {
                    label: "Equity",
                    value: fmt(bsSummary.totalEquity),
                    tooltip: null,
                  },
                ];
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {kpis.map(k => (
                      <div
                        key={k.label}
                        className="rounded-xl border border-border px-5 py-5 flex flex-col gap-2"
                        style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}
                      >
                        <p className="text-[11px] text-muted-foreground text-center font-medium">{k.label}</p>
                        <p className="text-2xl font-bold text-foreground text-center">{k.value}</p>
                        <div className="flex items-center justify-center gap-2 mt-1">
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                            ▲ 0.0%
                          </span>
                          <span className="text-[9px] text-muted-foreground">vs previous month</span>
                          {k.tooltip && (
                            <div className="relative group">
                              <Info className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-help" />
                              <div className="absolute bottom-full right-0 mb-2 z-50 hidden group-hover:block w-52 rounded-lg border border-border p-3 shadow-2xl" style={{ background: "hsl(var(--muted))" }}>
                                {k.tooltip.split("\n").map((line, i) => (
                                  <p key={i} className={`text-[11px] leading-relaxed ${i === 0 ? "font-semibold text-foreground mb-1" : "text-muted-foreground"}`}>{line}</p>
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
              {effectiveBs && (() => {
                const bs = effectiveBs;
                const currentRatio = bs.currentLiabilities > 0 ? bs.currentAssets / bs.currentLiabilities : null;
                const debtEquity = bs.equity !== 0 ? bs.totalLiabilities / bs.equity : 0;
                const roe = bs.equity > 0 ? (netIncome / bs.equity) * 100 : 0;
                const metrics = [
                  {
                    label: "Current Ratio",
                    value: currentRatio !== null ? currentRatio.toFixed(2) : "N/A",
                    tip: "Current Ratio\nMeasures ability to pay short-term obligations.\n• Good: Above 2\n• Acceptable: 1–2\n• Watch out: Below 1",
                  },
                  {
                    label: "Debt / Equity Ratio",
                    value: debtEquity > 0 ? debtEquity.toFixed(2) : "—",
                    tip: "Debt / Equity Ratio\nHow much you owe vs what you own.\n• Good: Below 1\n• Strong: Below 0.5\n• Watch out: Above 2 means heavy reliance on debt.",
                  },
                  {
                    label: "Return on Equity (ROE)",
                    value: `${roe.toFixed(1)}%`,
                    tip: "Return on Equity\nMeasures profitability relative to equity.\n• Good: Above 15%\n• Strong: Above 20%",
                  },
                  {
                    label: "Total Assets",
                    value: fmt(bs.totalAssets),
                    tip: "Total Assets\nCombined value of everything your business owns.",
                  },
                ];
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {metrics.map(m => (
                      <div
                        key={m.label}
                        className="rounded-xl border border-border px-4 py-4 flex flex-col gap-2"
                        style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-muted-foreground font-medium">{m.label}</p>
                          <div className="relative group flex-shrink-0">
                            <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                            <div className="absolute bottom-full right-0 mb-2 z-50 hidden group-hover:block w-52 rounded-lg border border-border p-3 shadow-2xl" style={{ background: "hsl(var(--muted))" }}>
                              {m.tip.split("\n").map((line, i) => (
                                <p key={i} className={`text-[11px] leading-relaxed ${i === 0 ? "font-semibold text-foreground mb-1" : "text-muted-foreground"}`}>{line}</p>
                              ))}
                            </div>
                          </div>
                        </div>
                        <p className="text-xl font-bold text-foreground">{m.value}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                            ▲ 0.0%
                          </span>
                          <span className="text-[9px] text-muted-foreground">vs previous month</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── Two donut chart cards ── */}
              {effectiveBs && (() => {
                const bs = effectiveBs;
                const asOf = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                const totalAssets = bs.totalAssets || 1;
                const totalLiaEq = (bs.totalLiabilities + bs.equity) || 1;

                const assetSlices = [
                  { name: "Current Assets", value: bs.currentAssets, fill: "#22c55e" },
                  { name: "Fixed Assets", value: bs.nonCurrentAssets, fill: "#38bdf8" },
                ].filter(d => d.value > 0);

                const liabEqSlices = [
                  { name: "Current Liabilities", value: bs.currentLiabilities, fill: "#fb7185" },
                  { name: "Long-Term Liabilities", value: bs.longTermLiabilities, fill: "#f97316" },
                  { name: "Equity", value: bs.equity, fill: "#eab308" },
                ].filter(d => d.value > 0);

                const pct = (v: number, tot: number) => tot > 0 ? `${Math.round((v / tot) * 100)}%` : "0%";

                return (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {/* Assets card */}
                    <div className="rounded-xl border border-border p-5" style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}>
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Assets</p>
                          <p className="text-[10px] text-muted-foreground">As of {asOf}</p>
                        </div>
                        <p className="text-sm font-bold text-foreground">{fmt(bs.totalAssets)}</p>
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        {/* Donut */}
                        <div className="flex-shrink-0">
                          <ResponsiveContainer width={150} height={150}>
                            <PieChart>
                              <Pie data={assetSlices} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={40} paddingAngle={2}>
                                {assetSlices.map(d => <Cell key={d.name} fill={d.fill} opacity={0.9} />)}
                              </Pie>
                              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        {/* Breakdown */}
                        <div className="flex-1 space-y-3 text-xs">
                          <div>
                            <p className="text-[9px] font-bold text-[#FFC72B] uppercase tracking-widest mb-1">Current Assets</p>
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Current Assets</span>
                              <span className="text-foreground font-medium">{pct(bs.currentAssets, totalAssets)} →</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[#FFC72B] uppercase tracking-widest mb-1">Fixed Assets</p>
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" />Fixed Assets</span>
                              <span className="text-foreground font-medium">{pct(bs.nonCurrentAssets, totalAssets)} →</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Liabilities & Equity card */}
                    <div className="rounded-xl border border-border p-5" style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}>
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Liabilities &amp; Equity</p>
                          <p className="text-[10px] text-muted-foreground">As of {asOf}</p>
                        </div>
                        <p className="text-sm font-bold text-foreground">{fmt(bs.totalLiabilities + bs.equity)}</p>
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        {/* Donut */}
                        <div className="flex-shrink-0">
                          <ResponsiveContainer width={150} height={150}>
                            <PieChart>
                              <Pie data={liabEqSlices} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={40} paddingAngle={2}>
                                {liabEqSlices.map(d => <Cell key={d.name} fill={d.fill} opacity={0.9} />)}
                              </Pie>
                              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        {/* Breakdown */}
                        <div className="flex-1 space-y-3 text-xs">
                          <div>
                            <p className="text-[9px] font-bold text-[#FFC72B] uppercase tracking-widest mb-1">Current Liabilities</p>
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />Current Liabilities</span>
                              <span className="text-foreground font-medium">{pct(bs.currentLiabilities, totalLiaEq)} →</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[#FFC72B] uppercase tracking-widest mb-1">Long-Term Liabilities</p>
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-orange-400" />Long-Term Liabilities</span>
                              <span className="text-foreground font-medium">{pct(bs.longTermLiabilities, totalLiaEq)} →</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[#FFC72B] uppercase tracking-widest mb-1">Equity</p>
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />Equity</span>
                              <span className="text-foreground font-medium">{pct(bs.equity, totalLiaEq)} →</span>
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
                  <h2 className="text-sm font-semibold text-foreground mb-3">Recently Uploaded</h2>
                  <div className="space-y-2">
                    {bsPeriods.map((p, i) => (
                      <div
                        key={`${p.docId}-${i}`}
                        className="flex items-center gap-3 rounded-xl border border-border px-4 py-3"
                        style={{ background: "linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)))" }}
                      >
                        <div className="h-9 w-9 rounded-lg bg-sky-500/20 flex items-center justify-center flex-shrink-0">
                          <FileText className="text-sky-400" style={{ height: 18, width: 18 }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{p.docName}</p>
                          <p className="text-[10px] text-muted-foreground">Balance Sheet · {statementPeriodLabel(p)}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {p.bs && <span className="text-[10px] text-muted-foreground">{fmt(p.bs.totalAssets)}</span>}
                          <button className="text-[10px] font-bold text-muted-foreground border border-border rounded px-2 py-1 hover:text-foreground transition-colors">
                            View
                          </button>
                          <span
                            className="inline-flex items-center justify-center h-6 w-6 rounded text-[10px] font-bold"
                            style={{ background: p.source === "manual" ? "rgba(59,130,246,0.2)" : "rgba(239,68,68,0.2)", color: p.source === "manual" ? "#60a5fa" : "#f87171" }}
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
                  style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}
                >
                  <FileText className="h-10 w-10 text-muted-foreground/60" />
                  <div>
                    <p className="font-medium text-foreground">No Balance Sheet statements yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Upload a Balance Sheet document to see it here.</p>
                  </div>
                  <Button size="sm" className="mt-2 gap-1.5" onClick={() => setShowDocs(true)}>
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
              <Button size="sm" variant="outline" className="border-border/60 text-muted-foreground hover:bg-secondary/50 gap-1.5 text-xs h-8" onClick={() => { setExportType("cf"); setShowExport(true); }}>
                <Download className="h-3.5 w-3.5" /> EXPORT
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={() => setShowDocs(true)}>
                <Upload className="h-3.5 w-3.5" /> UPLOAD
              </Button>
              <button className="px-3 py-1.5 text-[11px] font-semibold rounded border border-[#FFC72B]/60 text-[#FFC72B] hover:bg-[#FFC72B]/10 transition-colors">
                ADJUST CASH FLOW
              </button>
              {/* Showing toggle */}
              <button
                onClick={() => setCfShowPaid(v => !v)}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-opacity hover:opacity-80"
                style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}
              >
                <span className="text-muted-foreground">Showing:</span>
                <span className="text-foreground font-bold">{cfShowPaid ? "paid" : "paid + unpaid"}</span>
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
              const displayOut = cfShowPaid ? 0 : cfMoneyOut;
              const displayNet = cfMoneyIn - displayOut;
              return [
                { label: "Money In",  value: fmt(cfMoneyIn),  color: "#22c55e",                              tip: "Money In\nTotal inflows in the selected period. Includes all paid income transactions." },
                { label: "Money Out", value: fmt(displayOut),  color: "#fb7185",                              tip: "Money Out\nTotal outflows in the selected period. Includes all paid expense transactions." },
                { label: "Net Cash",  value: fmt(displayNet),  color: displayNet >= 0 ? "#22c55e" : "#fb7185", tip: null as string | null },
              ];
            })().map(k => (
              <div
                key={k.label}
                className="rounded-xl border border-border px-5 py-5 flex flex-col gap-2"
                style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground font-medium">{k.label}</p>
                  {k.tip && (
                    <div className="relative group">
                      <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                      <div className="absolute right-0 top-full mt-1.5 z-50 hidden group-hover:block w-52 rounded-lg border border-border p-3 shadow-2xl" style={{ background: "hsl(var(--muted))" }}>
                        {k.tip.split("\n").map((line, i) => (
                          <p key={i} className={`text-[11px] leading-relaxed ${i === 0 ? "font-semibold text-foreground mb-1" : "text-muted-foreground"}`}>{line}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                    {cfNetCash === 0 ? "None" : "▲ 0.0%"}
                  </span>
                  <span className="text-[9px] text-muted-foreground">vs previous 3 months</span>
                </div>
              </div>
            ))}
          </div>

          {/* ── Cash Flow Trend chart ── */}
          <div className="p-4" style={trendChartPanelStyle}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-sm font-semibold text-[#DCE8FF]">Cash Flow Trend</p>
                <p className="text-[10px] text-[#8EA5D2] mt-0.5">{cashFlowTrendScale.topLabel}</p>
                {/* Reference chart keeps this header compact. */}
                {false && <p className="hidden">
                  {cfShowPaid
                    ? "Yellow = net cash (paid only). Circles mark each period — not a separate unrealized line."
                    : "Yellow = net cash including unpaid/projected. Circles mark each period — still one net line, not two."}
                </p>}
                {false && <p className="text-[10px] text-muted-foreground">
                  {trendData[0]?.label && trendData[trendData.length - 1]?.label
                    ? `${trendData[0].label} – ${trendData[trendData.length - 1].label}`
                    : periodLabel
                  } | Monthly
                </p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button className="flex items-center gap-1 text-[10px] text-[#8EA5D2] border border-[#2B7FFF]/35 rounded px-2 py-1 hover:text-[#EAF2FF] transition-colors">
                  Filter +
                </button>
                <label className="flex items-center gap-1 text-[10px] text-[#8EA5D2] cursor-pointer select-none">
                  <input type="checkbox" className="h-3 w-3 rounded accent-[#FFC72B]" readOnly />
                  vs prior months
                </label>
              </div>
            </div>
            <div className="h-[220px] mt-0">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendData} margin={{ top: 34, right: 0, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cfRevBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#20C987" stopOpacity={1} />
                        <stop offset="100%" stopColor="#159F70" stopOpacity={1} />
                      </linearGradient>
                      <linearGradient id="cfExpBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B8CFF" stopOpacity={1} />
                        <stop offset="100%" stopColor="#2163C9" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={trendChartGrid} />
                    <XAxis dataKey="label" tick={trendAxisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={trendAxisTick} tickFormatter={fmtTrendTick} ticks={cashFlowTrendScale.ticks} domain={cashFlowTrendScale.domain} axisLine={false} tickLine={false} width={58} />
                    <Tooltip
                      formatter={(v: number) => fmt(v)}
                      contentStyle={trendTooltipStyle}
                      labelStyle={{ color: "#EAF2FF" }}
                      itemStyle={{ color: "#EAF2FF" }}
                    />
                    <Bar dataKey="revenue" name="Money In" fill="url(#cfRevBar)" radius={[4, 4, 0, 0]} barSize={18} />
                    {!cfShowPaid && <Bar dataKey="expenses" name="Money Out" fill="url(#cfExpBar)" radius={[4, 4, 0, 0]} barSize={18} />}
                    <Line type="monotone" dataKey="netCash" name="Net Cash" stroke="#FFC72B" strokeWidth={2} dot={{ r: 3, fill: "#FFC72B", stroke: "#061f49", strokeWidth: 1 }} activeDot={{ r: 4, fill: "#FFC72B" }} />
                    <Line type="monotone" dataKey={cfShowPaid ? "revenue" : "profit"} name="Profit" stroke="#F3F7FF" strokeWidth={2.5} dot={{ r: 3, fill: "#F3F7FF", stroke: "#061f49", strokeWidth: 1 }} activeDot={{ r: 5, fill: "#F3F7FF" }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">No transaction data for this period.</p>
                </div>
              )}
            </div>
            {/* Legend */}
            <div className="flex items-center justify-center gap-5 mt-0 pl-1">
              <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#20C987" }} /> Money In
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#2B7FFF" }} /> Money Out
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                <span className="h-4 border-t-2 border-[#FFC72B] w-5 inline-block mb-0.5" /> Net Cash
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-[#8EA5D2]">
                <span className="h-4 border-t-2 border-[#F3F7FF] w-5 inline-block mb-0.5" /> Profit
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
              { title: "Operating Activities", label: "Operating Cash Flow", value: opCF, border: "#22c55e" },
              { title: "Investing Activities", label: "Investing Cash Flow", value: invCF, border: "#38bdf8" },
              { title: "Financing Activities", label: "Financing Cash Flow", value: finCF, border: "#FFC72B" },
            ];
            return (
              <div className="rounded-xl border border-border p-5" style={{ background: "linear-gradient(160deg, hsl(var(--muted)), hsl(var(--card)))" }}>
                <p className="text-sm font-semibold text-foreground mb-4">Cash Flow Statement</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {sections.map(s => (
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
                        <p className="text-xs font-semibold text-foreground">{s.title}</p>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      {/* Value row */}
                      <div className="flex items-center justify-between px-4 py-3 border-t border-border/60">
                        <p className="text-[11px] text-muted-foreground">{s.label}</p>
                        <p
                          className="text-sm font-bold"
                          style={{ color: s.value >= 0 ? "#22c55e" : "#fb7185" }}
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
                  <p className="text-sm font-bold" style={{ color: netCF >= 0 ? "#22c55e" : "#fb7185" }}>
                    {fmt(netCF)}
                  </p>
                </div>
              </div>
            );
          })()}

        </div>
      )}

      {/* ── Export Dialog — matches Flutter _PdfExportDialog exactly ── */}
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
            const bsEnds = isBs ? buildBsSnapshotEnds(eDate, exportFreq, exportPeriodCount) : [];
            const labels = isBs
              ? buildBsSnapshotLabels(bsEnds, exportFreq, eDate)
              : buildBucketLabels(sDate, eDate, exportFreq);
            const validationError = isBs
              ? (exportPeriodCount < 1 || exportPeriodCount > MAX_EXPORT_COLS ? `Choose between 1 and ${MAX_EXPORT_COLS} periods.` : null)
              : validateExportRange(sDate, eDate, exportFreq);
            const tooMany = labels.length > MAX_EXPORT_COLS;
            const hasError = !!validationError || tooMany;
            const colPreview = `${Math.min(labels.length, MAX_EXPORT_COLS)}/5 columns: ${labels.slice(0, MAX_EXPORT_COLS).join(", ") || "—"}`;
            const helperText = exportFreq === "monthly"
              ? "Monthly: max 5 months"
              : exportFreq === "quarterly"
              ? "Quarterly: max 5 quarters (~15 months)"
              : "Yearly: max 5 years";
            /* Flutter DateFormat('MMM dd, yyyy') */
            const fmtTile = (iso: string) => {
              try {
                return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
              } catch { return iso; }
            };

            return (
              /* Flutter: Padding(all: 20) → Column(mainAxisSize: min, crossAxisAlignment: start) */
              <div className="p-5">

                {/* ── Report type + format (not in Flutter but needed for single-dialog UX) ── */}
                <div className="flex gap-2 mb-4">
                  {(["pl", "bs", "cf"] as ExportReportType[]).map(rt => (
                    <button key={rt} onClick={() => setExportType(rt)}
                      className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors
                        ${exportType === rt ? "bg-primary/20 text-primary border-primary/60" : "border-border/50 text-muted-foreground hover:border-primary/40"}`}>
                      {rt === "pl" ? "Profit & Loss" : rt === "bs" ? "Balance Sheet" : "Cash Flow"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mb-5">
                  {([["pdf", "PDF"], ["excel", "Excel"], ["csv", "CSV"]] as [ExportFormat, string][]).map(([f, lbl]) => (
                    <button key={f} onClick={() => setExportFormat(f)}
                      className={`flex-1 py-1 text-[11px] font-medium rounded-md border transition-colors
                        ${exportFormat === f ? "bg-primary/20 text-primary border-primary/60" : "border-border/40 text-muted-foreground hover:border-primary/30"}`}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {/* Flutter: Text("Export PDF" / "Export Excel", fontSize:18, fontWeight:w700) */}
                <p className="text-[18px] font-bold text-foreground">
                  {exportFormat === "pdf" ? "Export PDF" : exportFormat === "excel" ? "Export Excel" : "Export CSV"}
                </p>

                {/* Flutter: SizedBox(height:16) */}
                <div className="h-4" />

                {/* Flutter: date tiles row — BS gets "As Of Date" + period count dropdown */}
                {isBs ? (
                  <div className="flex gap-3 items-start">
                    {/* As Of Date tile */}
                    <label className="flex-1 relative cursor-pointer">
                      {/* Flutter: InkWell r=16, Container padding h=16/v=14, border grey.shade400 r=16 */}
                      <div className="px-4 py-[14px] rounded-2xl border border-gray-400/70 hover:border-primary/60 transition-colors select-none">
                        <p className="text-[12px] text-foreground/60 leading-none">As Of Date</p>
                        <div className="h-1" />
                        {/* Flutter: Text(value, fontWeight:w600) */}
                        <p className="text-[14px] font-semibold text-foreground">{fmtTile(exportEnd)}</p>
                      </div>
                      <input type="date" value={exportEnd} onChange={e => setExportEnd(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer" />
                    </label>
                    {/* Number of periods */}
                    <div className="flex-1">
                      <p className="text-[12px] font-semibold text-foreground mb-2">Number of periods</p>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n} onClick={() => setExportPeriodCount(n)}
                            className={`flex-1 py-2 text-[12px] font-semibold rounded-lg border transition-colors
                              ${exportPeriodCount === n ? "bg-primary/20 text-primary border-primary/60" : "border-border/50 text-muted-foreground hover:border-primary/40"}`}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Flutter: Row with two Expanded date tiles, SizedBox(w:12) gap */
                  <div className="flex gap-3">
                    <label className="flex-1 relative cursor-pointer">
                      <div className="px-4 py-[14px] rounded-2xl border border-gray-400/70 hover:border-primary/60 transition-colors select-none">
                        <p className="text-[12px] text-foreground/60 leading-none">Start Date</p>
                        <div className="h-1" />
                        <p className="text-[14px] font-semibold text-foreground">{fmtTile(exportStart)}</p>
                      </div>
                      <input type="date" value={exportStart} onChange={e => setExportStart(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer" />
                    </label>
                    <label className="flex-1 relative cursor-pointer">
                      <div className="px-4 py-[14px] rounded-2xl border border-gray-400/70 hover:border-primary/60 transition-colors select-none">
                        <p className="text-[12px] text-foreground/60 leading-none">End Date</p>
                        <div className="h-1" />
                        <p className="text-[14px] font-semibold text-foreground">{fmtTile(exportEnd)}</p>
                      </div>
                      <input type="date" value={exportEnd} onChange={e => setExportEnd(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer" />
                    </label>
                  </div>
                )}

                {/* Flutter: SizedBox(height:14) */}
                <div className="h-[14px]" />

                {/* Flutter: Text("Frequency", fontWeight:w600) */}
                <p className="text-[14px] font-semibold text-foreground">Frequency</p>

                {/* Flutter: SizedBox(height:8) */}
                <div className="h-2" />

                {/* Flutter: Wrap(spacing:8) with ChoiceChip for Monthly/Quarterly/Yearly */}
                <div className="flex flex-wrap gap-2">
                  {(["monthly", "quarterly", "yearly"] as ExportFreq[]).map(f => {
                    const sel = exportFreq === f;
                    return (
                      <button key={f} onClick={() => setExportFreq(f)}
                        className={`px-4 py-1.5 rounded-full text-[13px] border transition-colors
                          ${sel
                            ? "bg-primary/20 text-primary border-primary/60 font-medium"
                            : "border-border/50 text-foreground/70 hover:border-primary/40 hover:text-primary"}`}>
                        {f === "monthly" ? "Monthly" : f === "quarterly" ? "Quarterly" : "Yearly"}
                      </button>
                    );
                  })}
                </div>

                {/* Flutter: SizedBox(height:12) × 2 = 24px */}
                <div className="h-6" />

                {/* Flutter: Text(_helperText(), fontSize:12, color: bodySmall.withAlpha(0.8)) */}
                <p className="text-[12px] text-muted-foreground/80 leading-snug">{helperText}</p>

                {/* Flutter: SizedBox(height:8) */}
                <div className="h-2" />

                {/* Flutter: Text(_columnPreviewText(), fontSize:12, fontWeight:w600, maxLines:2, overflow:ellipsis) */}
                <p className="text-[12px] font-semibold text-foreground line-clamp-2">{colPreview}</p>

                {/* Flutter: if hasError → SizedBox(height:8) + Text(error, color:red, fontSize:12) */}
                {hasError && (
                  <>
                    <div className="h-2" />
                    <p className="text-[12px] text-red-500 leading-snug">
                      {validationError ?? "Too many columns selected. Reduce range to 5 or less."}
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
                    style={{ backgroundColor: "rgba(30,58,138,0.35)", borderColor: "rgba(255,255,255,0.8)" }}
                    className="px-6 py-3 rounded-xl text-[14px] font-medium text-foreground border hover:opacity-90 disabled:opacity-40 transition-opacity">
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={isExporting || hasError || !orgId}
                    style={{
                      backgroundColor: isExporting || hasError || !orgId ? "rgba(30,58,138,0.20)" : "rgba(30,58,138,0.35)",
                      borderColor: "rgba(255,255,255,0.8)",
                      color: isExporting || hasError || !orgId ? "rgba(255,255,255,0.5)" : "white",
                    }}
                    className="px-6 py-3 rounded-xl text-[14px] font-medium border flex items-center gap-2 hover:opacity-90 disabled:cursor-not-allowed transition-opacity">
                    {isExporting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {exportFormat === "pdf" ? "Download PDF" : exportFormat === "excel" ? "Download Excel" : "Download CSV"}
                  </button>
                </div>

              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Upload Financial Document Dialog ── */}
      <Dialog open={showUpload} onOpenChange={v => { if (!v) resetUploadForm(); setShowUpload(v); }}>
        <DialogContent className="sm:max-w-md bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4.5 w-4.5 text-primary" />
              Upload Financial Document
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* File pick area */}
            <input ref={uploadFileRef} type="file" className="hidden"
              accept=".pdf,.csv,.xlsx,.xls,.doc,.docx,.jpg,.jpeg,.png"
              onChange={handleFilePicked} />
            <button
              onClick={() => uploadFileRef.current?.click()}
              className="w-full border-2 border-dashed border-border/60 hover:border-primary/50 rounded-xl p-6 flex flex-col items-center gap-2 transition-colors group"
            >
              <div className="h-12 w-12 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <span className="text-sm font-medium">Upload From Device</span>
              <span className="text-xs text-muted-foreground">PDF, CSV, Excel, Word, or Image</span>
            </button>

            {/* Picked file badge */}
            {uploadPickedFile && (
              <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-xs text-primary flex-1 truncate">{uploadPickedFile.name}</span>
                <button onClick={() => { setUploadPickedFile(null); if (uploadFileRef.current) uploadFileRef.current.value = ""; }}
                  className="text-muted-foreground hover:text-foreground ml-1 flex-shrink-0">
                  ✕
                </button>
              </div>
            )}

            {/* Document Name */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Document Name *</label>
              <Input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="e.g. W-9 Form - John Doe"
                className="mt-1.5 bg-background border-border/60 h-9 text-sm" />
            </div>

            {/* Category + Year row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category *</label>
                <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/60">
                  <option value="">Select category</option>
                  {["Balance Sheet", "Profit & Loss", "Income Statement", "Cash Flow Statement", "Transactions"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Year</label>
                <select value={uploadYear} onChange={e => handleUploadYearChange(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/60">
                  {Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
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
                  <input type="date" value={uploadAsOf} onChange={e => setUploadAsOf(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/60" />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                    <input type="date" value={uploadPeriodStart} onChange={e => setUploadPeriodStart(e.target.value)}
                      placeholder="Start date"
                      className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/60" />
                    <input type="date" value={uploadPeriodEnd} onChange={e => setUploadPeriodEnd(e.target.value)}
                      placeholder="End date"
                      className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/60" />
                  </div>
                )}
              </div>
            )}

            {/* Validation error */}
            {uploadError && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{uploadError}</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { resetUploadForm(); setShowUpload(false); }}
              className="border-border/60">
              Close
            </Button>
            <Button size="sm" onClick={handleUploadSave} disabled={uploadSaving}
              className="bg-primary text-primary-foreground gap-1.5">
              {uploadSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Document Preview Dialog ── */}
      {viewingDoc && (
        <Dialog open={!!viewingDoc} onOpenChange={v => { if (!v) { setViewingDoc(null); setViewDocError(null); } }}>
          <DialogContent className="sm:max-w-2xl bg-card border-border/60 p-0 overflow-hidden">
            <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="flex items-center gap-2 text-sm font-semibold truncate">
                  <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="truncate">{viewingDoc.title}</span>
                  <span className="text-xs font-normal text-muted-foreground flex-shrink-0">{viewingDoc.type}</span>
                </DialogTitle>
                <button
                  onClick={async () => {
                    if (!viewingDoc.fileUrl) return;
                    try {
                      await proxyDownload(viewingDoc.fileUrl, `${viewingDoc.title}.${viewingDoc.type.toLowerCase()}`);
                    } catch {
                      toast({ title: "Download failed", description: "Could not download this file.", variant: "destructive" });
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline flex-shrink-0">
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
              </div>
            </DialogHeader>
            <div className="bg-background/60 flex items-center justify-center" style={{ minHeight: 420 }}>
              {!viewingDoc.fileUrl ? (
                <div className="flex flex-col items-center gap-4 py-16 text-center px-8">
                  <div className="h-16 w-16 rounded-2xl bg-muted/40 flex items-center justify-center">
                    <FileText className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="font-semibold">{viewingDoc.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{viewingDoc.type} · {viewingDoc.size}</p>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    This is a sample document. Upload your own documents using the <span className="text-primary font-medium">Upload Document</span> button to view and download them here.
                  </p>
                </div>
              ) : viewDocLoading ? (
                <div className="flex flex-col items-center gap-3 py-20">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading document…</p>
                </div>
              ) : viewDocError === "not_found" ? (
                <div className="flex flex-col items-center gap-3 py-20 text-center px-8">
                  <FileText className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium">File not found in storage</p>
                  <p className="text-sm text-muted-foreground max-w-xs">This document record exists but the file is no longer in storage. Please delete this entry and re-upload the document.</p>
                </div>
              ) : viewDocError ? (
                <div className="flex flex-col items-center gap-3 py-20 text-center px-8">
                  <FileText className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Could not load document. Try downloading it instead.</p>
                </div>
              ) : !viewDocBlobUrl ? (
                <div className="flex flex-col items-center gap-3 py-20 text-center px-8">
                  <FileText className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Could not load document. Try downloading it instead.</p>
                </div>
              ) : ["PDF"].includes(viewingDoc.type) ? (
                <iframe src={viewDocBlobUrl} className="w-full" style={{ height: 500, border: "none" }} title={viewingDoc.title} />
              ) : ["JPG", "JPEG", "PNG", "GIF", "WEBP", "SVG"].includes(viewingDoc.type) ? (
                <img src={viewDocBlobUrl} alt={viewingDoc.title} className="max-w-full max-h-[500px] object-contain p-4" />
              ) : (
                <div className="flex flex-col items-center gap-4 py-16 text-center px-8">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{viewingDoc.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{viewingDoc.type} · {viewingDoc.size}</p>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    This file type can't be previewed directly. Download it to open it in the appropriate application.
                  </p>
                  <button
                    onClick={async () => {
                      if (!viewingDoc.fileUrl) return;
                      try {
                        await proxyDownload(viewingDoc.fileUrl, `${viewingDoc.title}.${viewingDoc.type.toLowerCase()}`);
                      } catch {
                        toast({ title: "Download failed", description: "Could not download this file.", variant: "destructive" });
                      }
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary border border-primary/40 rounded-lg px-4 py-2 hover:bg-primary/10 transition-colors">
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
        <SheetContent side="right" className="w-full sm:max-w-lg bg-card border-border/60 flex flex-col p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Document Repository
              </SheetTitle>
              <Button size="sm" onClick={() => setShowUpload(true)}
                className="bg-primary text-primary-foreground gap-1.5 h-8 text-xs">
                <Upload className="h-3.5 w-3.5" /> Upload Document
              </Button>
            </div>
            {/* Search */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search documents…" value={docSearch} onChange={e => setDocSearch(e.target.value)}
                className="pl-9 h-8 text-sm bg-background border-border/60" />
            </div>
            {/* Category chips */}
            <div className="flex gap-1.5 flex-wrap mt-2">
              {DOC_CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setDocCategory(cat)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${docCategory === cat ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:border-primary/50"}`}>
                  {cat}
                </button>
              ))}
            </div>
          </SheetHeader>

          {/* Document list */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {docsLoading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Loading documents…</p>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
                <File className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {docSearch ? "No documents match your search." : "No documents yet. Upload your first document."}
                </p>
                <Button size="sm" variant="outline" onClick={() => setShowUpload(true)}
                  className="border-primary/40 text-primary gap-1.5">
                  <Upload className="h-3.5 w-3.5" /> Upload
                </Button>
              </div>
            ) : filteredDocs.map(doc => {
              const SIcon = STATUS_ICON[doc.status] ?? CheckCircle2;
              return (
                <div key={doc.id} className="rounded-xl border border-border/40 bg-background/50 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">Type: {doc.type}</p>
                      </div>
                    </div>
                    <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${STATUS_COLOR[doc.status]}`}>
                      <SIcon className="h-3 w-3" />
                      {doc.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{doc.date}</span>
                    <span>{doc.size}</span>
                  </div>
                  <div className="flex gap-2 pt-1 border-t border-border/30">
                    <button
                      onClick={() => setViewingDoc(doc)}
                      className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                      <Search className="h-3 w-3" /> View
                    </button>
                    <button
                      onClick={async () => {
                        if (!doc.fileUrl) return;
                        await proxyDownload(doc.fileUrl, `${doc.title}.${doc.type.toLowerCase()}`);
                      }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline cursor-pointer">
                      <Download className="h-3 w-3" /> Download
                    </button>
                    <button
                      onClick={() => setDeleteDocTarget(doc)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive hover:underline cursor-pointer ml-auto">
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Delete Document confirmation dialog ── */}
      <Dialog open={!!deleteDocTarget} onOpenChange={v => { if (!v && !deleteDocRunning) setDeleteDocTarget(null); }}>
        <DialogContent className="sm:max-w-sm bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2 className="h-4 w-4" /> Delete Document
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Deleting <span className="font-semibold text-foreground">{deleteDocTarget?.title}</span> will also permanently remove all transactions that were imported from this document. This cannot be undone.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" disabled={deleteDocRunning}
              onClick={() => setDeleteDocTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={deleteDocRunning}
              onClick={() => deleteDocTarget && handleDeleteDoc(deleteDocTarget)}
              className="gap-1.5">
              {deleteDocRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {deleteDocRunning ? "Deleting…" : "Delete document & transactions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Transactions tab ── */}
      {tab === "transactions" && (
        <div className="space-y-3">
          {/* Search bar — matches Flutter TransactionListScreen */}
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleConnectBank}
              disabled={plaidConnecting || plaidSyncing}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {plaidConnecting || plaidSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {plaidSyncing ? "Syncing..." : plaidConnecting ? "Connecting..." : "Connect Bank"}
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search transactions"
              value={txSearch}
              onChange={e => setTxSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted pl-10 pr-24 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-3">
              <button className="text-muted-foreground hover:text-foreground" title="Smart Clean" onClick={handleSmartCleanOpen}>
                <Sparkles className="h-4 w-4" />
              </button>
              <button className="text-muted-foreground hover:text-foreground" title="Filter">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 8h10M11 12h2M13 16h-2" /></svg>
              </button>
            </div>
          </div>

          {/* Smart Clean preview dialog */}
          <Dialog open={smartCleanOpen} onOpenChange={v => { if (!v && !smartCleanRunning) { setSmartCleanOpen(false); setSmartCleanPreview(null); } }}>
            <DialogContent className="sm:max-w-lg bg-card border-border/60">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-amber-400" /> Smart Clean — Auto-detect P&amp;L Entries
                </DialogTitle>
              </DialogHeader>
              {smartCleanRunning && !smartCleanPreview ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                  <p className="text-sm text-muted-foreground">Scanning all transactions for P&amp;L-style entries…</p>
                </div>
              ) : smartCleanPreview !== null && smartCleanPreview.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm font-medium text-emerald-400">All clear!</p>
                  <p className="text-xs text-muted-foreground mt-1">No P&amp;L-style entries detected. Your data looks clean.</p>
                </div>
              ) : smartCleanPreview !== null ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Found <span className="font-semibold text-foreground">{smartCleanPreview.length}</span> transactions that look like P&amp;L summary entries
                    (large round amounts or known P&amp;L categories). These are distorting your income &amp; expense calculations.
                  </p>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/30">
                    {smartCleanPreview.map(t => (
                      <div key={t.id} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="text-muted-foreground truncate flex-1 pr-3">{t.title}</span>
                        <span className={`font-semibold flex-shrink-0 ${t.amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {t.amount >= 0 ? "+" : ""}{fmt(t.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setSmartCleanOpen(false); setSmartCleanPreview(null); }} className="border-border/60">
                      Cancel
                    </Button>
                    <Button size="sm" variant="destructive" disabled={smartCleanRunning} onClick={handleSmartCleanConfirm}
                      className="gap-1.5">
                      {smartCleanRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      {smartCleanRunning ? "Deleting…" : `Remove ${smartCleanPreview.length} entr${smartCleanPreview.length === 1 ? "y" : "ies"}`}
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
                {selectedTxIds.size} transaction{selectedTxIds.size > 1 ? "s" : ""} selected
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="text-xs h-7"
                  onClick={() => setSelectedTxIds(new Set())}>
                  Deselect all
                </Button>
                <Button size="sm" variant="destructive" className="gap-1.5 text-xs h-7"
                  onClick={() => setConfirmDeleteOpen(true)}>
                  <Trash2 className="h-3 w-3" /> Delete selected
                </Button>
              </div>
            </div>
          )}

          {/* Flutter-style transaction cards */}
          {allTxsLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (() => {
            const q = txSearch.toLowerCase();
            const filtered = allTxsFull.filter(tx =>
              !q || tx.title.toLowerCase().includes(q) || (tx.description ?? "").toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 p-12 text-center">
                <p className="text-muted-foreground">{txSearch ? "No matching transactions." : "No transactions yet. Use '+ Add Transaction' or upload a bank statement."}</p>
              </div>
            ) : (
              <div className="space-y-2 pb-20">
                {filtered.map(tx => (
                  <div
                    key={tx.id}
                    className="rounded-2xl border border-border overflow-hidden cursor-pointer hover:border-primary/40 transition-colors group"
                    style={{ background: "linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)))" }}
                    onClick={() => openDetailTx(tx)}
                  >
                    <div className="flex" style={{ minHeight: 86 }}>
                      {/* 6px colored indicator bar */}
                      <div style={{ width: 6, flexShrink: 0, background: tx.amount >= 0 ? "#22c55e" : "#6b7280" }} />
                      {/* Card body */}
                      <div className="flex-1 px-3 py-3">
                        {/* Title + amount */}
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[15px] font-bold text-foreground truncate flex-1">{tx.title}</p>
                          <div className="flex-shrink-0 text-right">
                            <p className={`text-[15px] font-bold ${tx.amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {tx.amount < 0 ? "- " : ""}{fmt(Math.abs(tx.amount))}
                            </p>
                            {tx.description ? (
                              <FileText className="h-3.5 w-3.5 text-muted-foreground ml-auto mt-0.5 opacity-70" />
                            ) : null}
                          </div>
                        </div>
                        {/* Avatar + date */}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <div className="h-5 w-5 rounded-full bg-[#1E3A5F] flex items-center justify-center flex-shrink-0">
                            <svg className="h-3 w-3 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(tx.date_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                            {" "}· Manual
                          </span>
                        </div>
                        {/* Tags row */}
                        <div className="flex items-center justify-between mt-2">
                          <button
                            className="text-muted-foreground hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 p-0.5"
                            title="Delete"
                            onClick={e => { e.stopPropagation(); setSelectedTxIds(new Set([tx.id])); setConfirmDeleteOpen(true); }}
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
          })()}

          {/* Flutter bottom action bar */}
          <div className="fixed bottom-0 left-0 right-0 flex z-30 overflow-hidden md:left-[var(--sidebar-width)]" style={{ height: 56 }}>
            <button
              className="flex-1 flex items-center justify-center gap-2 font-bold text-sm text-black transition-opacity hover:opacity-90"
              style={{ background: "#FFC72B" }}
              onClick={handleSmartCleanOpen}
            >
              <Sparkles className="h-4 w-4" />
              AI Categorization
            </button>
            <button
              className="flex-1 flex items-center justify-center gap-2 font-bold text-sm text-black transition-opacity hover:opacity-90"
              style={{ background: "#FFC72B", borderLeft: "1px solid rgba(0,0,0,0.1)" }}
              onClick={() => setShowAddTx(true)}
            >
              <span className="text-lg leading-none font-bold">+</span>
              Add Transaction
            </button>
          </div>

          {/* Add Transaction dialog */}
          <Dialog open={showAddTx} onOpenChange={v => { if (!v) setShowAddTx(false); }}>
            <DialogContent className="sm:max-w-md bg-card border-border/60">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold">Add Transaction</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Title</label>
                  <input
                    autoFocus
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="e.g. Freelance payment"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Amount (+ for income, − for expense)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="e.g. 1500.00 or -250.00"
                    value={newAmount}
                    onChange={e => setNewAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Type</label>
                  <select
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    value={newType}
                    onChange={e => setNewType(e.target.value)}
                  >
                    <option value="Business">Business</option>
                    <option value="Personal">Personal</option>
                  </select>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 px-4 py-3">
                  <span className="text-sm font-medium">Deductible</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={newDeductible}
                    onClick={() => setNewDeductible(v => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${newDeductible ? "bg-primary" : "bg-secondary"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${newDeductible ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Notes</label>
                  <textarea
                    rows={2}
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    placeholder="Notes (optional)"
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={createMutation.isPending || !newTitle.trim() || !newAmount}
                  onClick={() => {
                    const raw = parseFloat(newAmount);
                    if (isNaN(raw)) return;
                    createMutation.mutate({
                      title: newTitle.trim(),
                      amount: raw,
                      date_time: newDate ? new Date(newDate).toISOString() : new Date().toISOString(),
                      type: newType,
                      deductible: newDeductible,
                      description: newNotes,
                    });
                  }}
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {createMutation.isPending ? "Saving…" : "Add Transaction"}
                </Button>
              </div>
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
                <span className="font-semibold text-foreground">{selectedTxIds.size} transaction{selectedTxIds.size > 1 ? "s" : ""}</span>?
                This will update your income, expense, and net profit figures.
              </p>
              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmDeleteOpen(false)} className="border-border/60">
                  Cancel
                </Button>
                <Button size="sm" variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate([...selectedTxIds])}>
                  {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Update Transaction dialog */}
          <Dialog open={detailTx !== null} onOpenChange={v => { if (!v) setDetailTx(null); }}>
            <DialogContent className="sm:max-w-md bg-card border-border/60 max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <DialogTitle className="text-base font-semibold">Update Transaction</DialogTitle>
                  <button
                    className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                    title="Delete transaction"
                    onClick={() => {
                      if (detailTx) { setSelectedTxIds(new Set([detailTx.id])); setDetailTx(null); setConfirmDeleteOpen(true); }
                    }}>
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
                      onChange={e => setEditTitle(e.target.value)}
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
                      onChange={e => setEditDate(e.target.value)}
                    />
                  </div>

                  {/* Amount */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full rounded-lg border border-border/60 bg-secondary/40 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        value={editAmount}
                        onChange={e => setEditAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter positive for income, negative for expense (e.g. -48.77)
                    </p>
                  </div>

                  {/* Category picker button */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Category</label>
                    <button
                      type="button"
                      onClick={() => { setCatSearchQuery(""); setExpandedCatIds(new Set()); setCategoryPickerOpen(true); }}
                      className="w-full flex items-center justify-between rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm text-left hover:bg-secondary/60 transition-colors focus:outline-none focus:ring-1 focus:ring-primary">
                      <span className="flex items-center gap-2 min-w-0">
                        {editCategoryId ? (
                          <>
                            <span className="text-foreground truncate">
                              {(() => {
                                const cat = categories.find(c => c.id === editCategoryId);
                                const sub = subCategories.find(s => s.id === editSubCategoryId);
                                const catName = cat?.name;
                                const subName = sub?.name;
                                return catName ? (subName ? `${catName}: ${subName}` : catName) : "Select Category";
                              })()}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Select Category</span>
                        )}
                        {false ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
                            <span className="text-muted-foreground">AI is categorizing…</span>
                          </>
                        ) : false ? (
                          <>
                            {aiCatSuggested && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary flex-shrink-0">
                                <Sparkles className="h-2.5 w-2.5" />AI
                              </span>
                            )}
                            <span className="text-foreground truncate">
                              {(() => {
                                const cat = categories.find(c => c.id === editCategoryId);
                                const sub = subCategories.find(s => s.id === editSubCategoryId);
                                const catName = cat?.name;
                                const subName = sub?.name;
                                return catName ? (subName ? `${catName}: ${subName}` : catName) : "Select Category";
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
                      onChange={e => setEditType(e.target.value)}>
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
                      onClick={() => setEditDeductible(v => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${editDeductible ? "bg-primary" : "bg-secondary"}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editDeductible ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Notes</label>
                    <textarea
                      rows={3}
                      className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      placeholder="Notes (optional)"
                    />
                  </div>

                  {/* Save button */}
                  <Button
                    className="w-full"
                    disabled={updateMutation.isPending || !editTitle.trim() || !editAmount}
                    onClick={() => {
                      const rawAmount = parseFloat(editAmount);
                      if (isNaN(rawAmount)) return;
                      updateMutation.mutate({
                        id: detailTx.id,
                        title: editTitle.trim(),
                        amount: rawAmount,
                        date_time: editDate ? new Date(editDate).toISOString() : detailTx.date_time,
                        type: editType,
                        deductible: editDeductible,
                        description: editNotes,
                        category_id: editCategoryId,
                        sub_category_id: editSubCategoryId,
                      });
                    }}>
                    {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {updateMutation.isPending ? "Saving…" : "Update Transaction"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Select Category modal */}
          <Dialog open={categoryPickerOpen} onOpenChange={v => { if (!v) setCategoryPickerOpen(false); }}>
            <DialogContent className="sm:max-w-md bg-card border-border/60 max-h-[85vh] flex flex-col p-0 gap-0">
              <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
                <DialogTitle className="text-base font-semibold">Select Category</DialogTitle>
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
                    onChange={e => {
                      setCatSearchQuery(e.target.value);
                      if (e.target.value) {
                        setExpandedCatIds(new Set(categories.map(c => c.id)));
                      }
                    }}
                  />
                </div>
              </div>

              {/* Category accordion list */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {(() => {
                  const q = catSearchQuery.toLowerCase();
                  const visibleCats = categories.filter(c => {
                    if (!q) return true;
                    if (c.name.toLowerCase().includes(q)) return true;
                    return subCategories.some(s => s.category_id === c.id && s.name.toLowerCase().includes(q));
                  });

                  if (visibleCats.length === 0) {
                    return <p className="text-center text-sm text-muted-foreground py-8">No categories found</p>;
                  }

                  function getCatIcon(name: string) {
                    switch (name) {
                      case "Expense": return <TrendingDown className="h-4 w-4" />;
                      case "Income": return <DollarSign className="h-4 w-4" />;
                      case "Cost of Goods Sold (COS)": return <Package className="h-4 w-4" />;
                      case "Other Current Asset": return <Wallet className="h-4 w-4" />;
                      case "Equity": return <BarChart2 className="h-4 w-4" />;
                      case "Other Expense": return <AlertTriangle className="h-4 w-4" />;
                      default: return <Tag className="h-4 w-4" />;
                    }
                  }

                  return visibleCats.map(cat => {
                    const isExpanded = expandedCatIds.has(cat.id);
                    const subs = subCategories.filter(s => {
                      if (s.category_id !== cat.id) return false;
                      if (!q) return true;
                      return s.name.toLowerCase().includes(q) || cat.name.toLowerCase().includes(q);
                    });

                    return (
                      <div key={cat.id} className="rounded-lg border border-border/40 overflow-hidden">
                        {/* Category header row */}
                        <button
                          type="button"
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                          onClick={() => {
                            const next = new Set(expandedCatIds);
                            if (isExpanded) next.delete(cat.id); else next.add(cat.id);
                            setExpandedCatIds(next);
                          }}>
                          <span className="text-primary flex-shrink-0">{getCatIcon(cat.name)}</span>
                          <span className="flex-1 text-sm font-medium">{cat.name}</span>
                          {isExpanded
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                        </button>

                        {/* Sub-categories */}
                        {isExpanded && (
                          <div className="border-t border-border/30 divide-y divide-border/20">
                            {subs.length === 0 ? (
                              <p className="px-12 py-2.5 text-xs text-muted-foreground">No sub-categories</p>
                            ) : subs.map(sub => {
                              const isSelected = editSubCategoryId === sub.id && editCategoryId === cat.id;
                              return (
                                <button
                                  key={sub.id}
                                  type="button"
                                  className={`w-full flex items-center gap-3 pl-12 pr-4 py-2.5 text-left text-sm transition-colors hover:bg-secondary/30 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                                  onClick={() => {
                                    setEditCategoryId(cat.id);
                                    setEditSubCategoryId(sub.id);
                                    setCategoryPickerOpen(false);
                                  }}>
                                  <span className="flex-1">{sub.name}</span>
                                  {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                                </button>
                              );
                            })}
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
