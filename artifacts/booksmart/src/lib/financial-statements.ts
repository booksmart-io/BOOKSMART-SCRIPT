// Shared helpers for normalizing uploaded/manually-entered P&L, Balance Sheet,
// and Cash Flow documents (stored in `user_documents.parsed_data`) into a
// canonical shape usable by both the Dashboard and Financial Reports pages.
//
// `parsed_data` can come from two different pipelines with different key casing:
//  - AI extraction (tax.tsx `handleConfirmExtraction`): snake_case keys
//    (revenue, cost_of_goods_sold, net_income, assets_current, ...)
//  - Manual Review Template (tax.tsx `handleManualConfirm`): camelCase keys,
//    nested under `periods: [...]` (and spread at top level when there's only
//    one period).

export type DocType = "pnl" | "bs" | "cf";

export function categoryToDocType(cat: string | null | undefined): DocType | null {
  if (cat === "Profit & Loss" || cat === "Income Statement") return "pnl";
  if (cat === "Balance Sheet") return "bs";
  if (cat === "Cash Flow Statement") return "cf";
  return null;
}

export type PnLFigures = {
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  netIncome: number;
};

export type BSFigures = {
  currentAssets: number;
  nonCurrentAssets: number;
  totalAssets: number;
  currentLiabilities: number;
  longTermLiabilities: number;
  totalLiabilities: number;
  equity: number;
};

export type CFFigures = {
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
};

export type StatementPeriod = {
  docId: number;
  docName: string;
  docType: DocType;
  source: "ai" | "manual";
  periodStart: Date | null;
  periodEnd: Date | null;
  asOf: Date | null;
  year: number | null;
  pnl?: PnLFigures;
  bs?: BSFigures;
  cf?: CFFigures;
};

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function parseDateSafe(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pnlFromRecord(r: Record<string, unknown>, manual: boolean): PnLFigures {
  if (manual) {
    const revenue = num(r.totalRevenue);
    const cogs = num(r.totalCogs);
    const grossProfit = num(r.grossProfit) || revenue - cogs;
    const opex = num(r.totalOperatingExpenses);
    const netIncome = num(r.netIncome);
    return { revenue, cogs, grossProfit, opex, netIncome };
  }
  const revenue = num(r.revenue);
  const cogs = num(r.cost_of_goods_sold);
  const grossProfit = num(r.gross_profit) || revenue - cogs;
  const opex = num(r.operating_expenses);
  const netIncome = num(r.net_income);
  return { revenue, cogs, grossProfit, opex, netIncome };
}

function bsFromRecord(r: Record<string, unknown>, manual: boolean): BSFigures {
  const currentAssets = manual ? num(r.currentAssets) : num(r.assets_current);
  const nonCurrentAssets = manual ? num(r.nonCurrentAssets) : num(r.assets_non_current);
  const currentLiabilities = manual ? num(r.currentLiabilities) : num(r.liabilities_current);
  const longTermLiabilities = manual ? num(r.longTermLiabilities) : num(r.liabilities_long_term);
  const equity = num(r.equity);
  return {
    currentAssets,
    nonCurrentAssets,
    totalAssets: currentAssets + nonCurrentAssets,
    currentLiabilities,
    longTermLiabilities,
    totalLiabilities: currentLiabilities + longTermLiabilities,
    equity,
  };
}

function cfFromRecord(r: Record<string, unknown>, manual: boolean): CFFigures {
  const operating = manual ? num(r.operatingActivities) : num(r.operating_activities);
  const investing = manual ? num(r.investingActivities) : num(r.investing_activities);
  const financing = manual ? num(r.financingActivities) : num(r.financing_activities);
  return { operating, investing, financing, netChange: operating + investing + financing };
}

type UserDocumentRow = {
  id: number;
  name: string;
  category: string | null;
  tax_year?: string | null;
  parsed_data: Record<string, unknown> | null;
};

/** Normalizes a single `user_documents` row into one or more canonical
 * `StatementPeriod`s (manual entries can carry multiple periods per row). */
export function normalizeStatementDoc(row: UserDocumentRow): StatementPeriod[] {
  const docType = categoryToDocType(row.category);
  if (!docType) return [];
  const pd = row.parsed_data;
  if (!pd || typeof pd !== "object") return [];

  const isManual = pd.manual_entry === true;
  const rawPeriods = Array.isArray(pd.periods) ? (pd.periods as Record<string, unknown>[]) : null;

  const buildFor = (r: Record<string, unknown>): StatementPeriod => {
    const year = typeof r.year === "number" ? r.year : row.tax_year ? Number(row.tax_year) || null : null;
    const periodStart = parseDateSafe(r.period_start ?? pd.period_start);
    const periodEnd = parseDateSafe(r.period_end ?? pd.period_end);
    const asOf = parseDateSafe(pd.as_of) ?? periodEnd;
    const base: StatementPeriod = {
      docId: row.id,
      docName: row.name,
      docType,
      source: isManual ? "manual" : "ai",
      periodStart,
      periodEnd,
      asOf,
      year,
    };
    if (docType === "pnl") base.pnl = pnlFromRecord(r, isManual);
    else if (docType === "bs") base.bs = bsFromRecord(r, isManual);
    else base.cf = cfFromRecord(r, isManual);
    return base;
  };

  if (isManual && rawPeriods && rawPeriods.length > 0) {
    return rawPeriods.map(buildFor);
  }
  return [buildFor(pd)];
}

/** True if a statement period overlaps a given [start, end] window (inclusive). */
export function periodOverlaps(p: StatementPeriod, start: Date, end: Date): boolean {
  if (p.docType === "bs") {
    return p.asOf !== null && p.asOf >= start && p.asOf <= end;
  }
  if (!p.periodStart || !p.periodEnd) return false;
  return p.periodStart <= end && p.periodEnd >= start;
}

export type FinancialSnapshot = {
  income: number;
  expenses: number;
  netProfit: number;
  hasPnlDocs: boolean;
  pnlDocCount: number;

  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  hasBsDocs: boolean;
  bsDocCount: number;

  totalOperating: number;
  totalInvesting: number;
  totalFinancing: number;
  netChange: number;
  hasCfDocs: boolean;
  cfDocCount: number;
};

/**
 * Single source of truth for the "combined snapshot" shown on both the main
 * Dashboard's Financial Report card and the Reports page's Financial
 * Dashboard overview tab. Both pages MUST call this with the same
 * `monthTxs` (current calendar month transactions) and the same
 * `statementPeriods` (all uploaded/manual statement documents) so the two
 * views never diverge.
 */
export function computeFinancialSnapshot(
  monthTxs: { amount: number }[],
  statementPeriods: StatementPeriod[],
): FinancialSnapshot {
  const pnlDocs = statementPeriods.filter((p) => p.docType === "pnl");
  const bsDocs = statementPeriods.filter((p) => p.docType === "bs");
  const cfDocs = statementPeriods.filter((p) => p.docType === "cf");

  const txIncome = monthTxs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const txExpenses = Math.abs(monthTxs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));

  const pnlTotals = pnlDocs.reduce(
    (acc, p) => ({
      revenue: acc.revenue + (p.pnl?.revenue ?? 0),
      expenses: acc.expenses + (p.pnl?.cogs ?? 0) + (p.pnl?.opex ?? 0),
    }),
    { revenue: 0, expenses: 0 },
  );
  const income = txIncome + pnlTotals.revenue;
  const expenses = txExpenses + pnlTotals.expenses;

  const bsTotals = bsDocs.reduce(
    (acc, p) => ({
      totalAssets: acc.totalAssets + (p.bs?.totalAssets ?? 0),
      totalLiabilities: acc.totalLiabilities + (p.bs?.totalLiabilities ?? 0),
      equity: acc.equity + (p.bs?.equity ?? 0),
    }),
    { totalAssets: 0, totalLiabilities: 0, equity: 0 },
  );

  const cfTotals = cfDocs.reduce(
    (acc, p) => ({
      operating: acc.operating + (p.cf?.operating ?? 0),
      investing: acc.investing + (p.cf?.investing ?? 0),
      financing: acc.financing + (p.cf?.financing ?? 0),
      netChange: acc.netChange + (p.cf?.netChange ?? 0),
    }),
    { operating: 0, investing: 0, financing: 0, netChange: 0 },
  );

  return {
    income,
    expenses,
    netProfit: income - expenses,
    hasPnlDocs: pnlDocs.length > 0,
    pnlDocCount: pnlDocs.length,

    totalAssets: bsTotals.totalAssets,
    totalLiabilities: bsTotals.totalLiabilities,
    equity: bsTotals.equity,
    hasBsDocs: bsDocs.length > 0,
    bsDocCount: bsDocs.length,

    totalOperating: cfTotals.operating,
    totalInvesting: cfTotals.investing,
    totalFinancing: cfTotals.financing,
    netChange: cfTotals.netChange,
    hasCfDocs: cfDocs.length > 0,
    cfDocCount: cfDocs.length,
  };
}

export function statementPeriodLabel(p: StatementPeriod): string {
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (p.docType === "bs") return p.asOf ? `As of ${fmtDate(p.asOf)}` : (p.year ? String(p.year) : "Unknown period");
  if (p.periodStart && p.periodEnd) return `${fmtDate(p.periodStart)} – ${fmtDate(p.periodEnd)}`;
  return p.year ? String(p.year) : "Unknown period";
}
