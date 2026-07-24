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

export function categoryToDocType(
  cat: string | null | undefined,
): DocType | null {
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
  organizationId: number | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  asOf: Date | null;
  year: number | null;
  pnl?: PnLFigures;
  bs?: BSFigures;
  cf?: CFFigures;
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseDateSafe(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pnlFromRecord(
  r: Record<string, unknown>,
  manual: boolean,
): PnLFigures {
  if (manual) {
    const revenue = num(r.totalRevenue);
    const cogs = num(r.totalCogs);
    const grossProfit =
      r.grossProfit == null || r.grossProfit === ""
        ? revenue - cogs
        : num(r.grossProfit);
    const opex = num(r.totalOperatingExpenses);
    const netIncome = num(r.netIncome);
    return { revenue, cogs, grossProfit, opex, netIncome };
  }
  const revenue = num(r.revenue);
  const cogs = num(r.cost_of_goods_sold);
  const grossProfit =
    r.gross_profit == null || r.gross_profit === ""
      ? revenue - cogs
      : num(r.gross_profit);
  const opex = num(r.operating_expenses);
  const netIncome = num(r.net_income);
  return { revenue, cogs, grossProfit, opex, netIncome };
}

function bsFromRecord(r: Record<string, unknown>, manual: boolean): BSFigures {
  const assets =
    typeof r.assets === "object" && r.assets !== null
      ? (r.assets as Record<string, unknown>)
      : {};
  const liabilities =
    typeof r.liabilities === "object" && r.liabilities !== null
      ? (r.liabilities as Record<string, unknown>)
      : {};
  const currentAssets = manual
    ? num(r.currentAssets)
    : num(r.assets_current ?? assets.current);
  const nonCurrentAssets = manual
    ? num(r.nonCurrentAssets)
    : num(r.assets_non_current ?? assets.non_current);
  const currentLiabilities = manual
    ? num(r.currentLiabilities)
    : num(r.liabilities_current ?? liabilities.current);
  const longTermLiabilities = manual
    ? num(r.longTermLiabilities)
    : num(r.liabilities_long_term ?? liabilities.long_term);
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
  const operating = manual
    ? num(r.operatingActivities)
    : num(r.operating_activities);
  const investing = manual
    ? num(r.investingActivities)
    : num(r.investing_activities);
  const financing = manual
    ? num(r.financingActivities)
    : num(r.financing_activities);
  return {
    operating,
    investing,
    financing,
    netChange: operating + investing + financing,
  };
}

function hasStatementFigures(
  r: Record<string, unknown>,
  docType: DocType,
  manual: boolean,
): boolean {
  if (manual) return true;
  if (r.ai_extracted === true) return true;
  if (docType === "pnl") {
    return [
      "revenue",
      "cost_of_goods_sold",
      "gross_profit",
      "operating_expenses",
      "net_income",
    ].some((key) => key in r);
  }
  if (docType === "bs") {
    return [
      "assets_current",
      "assets_non_current",
      "liabilities_current",
      "liabilities_long_term",
      "equity",
      "assets",
      "liabilities",
    ].some((key) => key in r);
  }
  return [
    "operating_activities",
    "investing_activities",
    "financing_activities",
  ].some((key) => key in r);
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
  const workflow =
    pd.statement_workflow && typeof pd.statement_workflow === "object"
      ? pd.statement_workflow as Record<string, unknown>
      : null;
  if (
    workflow?.lifecycle_status === "confirmed" &&
    workflow.confirmed_result &&
    typeof workflow.confirmed_result === "object"
  ) {
    const statementType = categoryToDocType(row.category);
    if (!statementType) return [];
    return normalizeConfirmedStatementImport({
      id: row.id,
      document_id: row.id,
      document_name: row.name,
      statement_type: statementType,
      confirmed_result: workflow.confirmed_result as Record<string, unknown>,
      organization_id: num(workflow.organization_id),
    });
  }

  const isManual = pd.manual_entry === true;
  const rawPeriods = Array.isArray(pd.periods)
    ? (pd.periods as Record<string, unknown>[])
    : null;
  if (!isManual && !hasStatementFigures(pd, docType, false)) return [];

  const buildFor = (r: Record<string, unknown>): StatementPeriod => {
    const organizationIdValue = num(r.org_id ?? pd.org_id);
    const organizationId =
      Number.isInteger(organizationIdValue) && organizationIdValue > 0
        ? organizationIdValue
        : null;
    const year =
      typeof r.year === "number"
        ? r.year
        : row.tax_year
          ? Number(row.tax_year) || null
          : null;
    const periodStart = parseDateSafe(r.period_start ?? pd.period_start);
    const periodEnd = parseDateSafe(r.period_end ?? pd.period_end);
    const asOf = parseDateSafe(pd.as_of) ?? periodEnd;
    const base: StatementPeriod = {
      docId: row.id,
      docName: row.name,
      docType,
      source: isManual ? "manual" : "ai",
      organizationId,
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

export function normalizeConfirmedStatementImport(row: {
  id: number;
  document_id: number;
  document_name?: string;
  statement_type: DocType;
  confirmed_result: Record<string, unknown> | null;
  organization_id: number;
  created_at?: string;
}): StatementPeriod[] {
  if (!row.confirmed_result || typeof row.confirmed_result !== "object") return [];
  const result = row.confirmed_result;
  const metadata = result.metadata as Record<string, unknown> | undefined;
  const values = result.values as Record<string, unknown> | undefined;
  if (!metadata || !values) return [];
  const base: StatementPeriod = {
    docId: row.document_id,
    docName: row.document_name ?? `Confirmed statement #${row.id}`,
    docType: row.statement_type,
    source: "ai",
    organizationId: row.organization_id,
    periodStart: parseDateSafe(metadata.period_start),
    periodEnd: parseDateSafe(metadata.period_end),
    asOf: parseDateSafe(metadata.as_of_date),
    year: Number(String(metadata.period_end ?? metadata.as_of_date ?? "").slice(0, 4)) || null,
  };
  if (row.statement_type === "pnl") {
    base.pnl = {
      revenue: num(values.revenue),
      cogs: num(values.cost_of_goods_sold),
      grossProfit: num(values.gross_profit),
      opex: num(values.operating_expenses),
      netIncome: num(values.net_income),
    };
  } else if (row.statement_type === "bs") {
    base.bs = {
      currentAssets: num(values.current_assets),
      nonCurrentAssets: num(values.non_current_assets),
      totalAssets: num(values.total_assets),
      currentLiabilities: num(values.current_liabilities),
      longTermLiabilities: num(values.long_term_liabilities),
      totalLiabilities: num(values.total_liabilities),
      equity: num(values.equity),
    };
  } else {
    base.cf = {
      operating: num(values.operating_activities),
      investing: num(values.investing_activities),
      financing: num(values.financing_activities),
      netChange: num(values.net_cash_change),
    };
  }
  return [base];
}

/** True if a statement period overlaps a given [start, end] window (inclusive). */
export function periodOverlaps(
  p: StatementPeriod,
  start: Date,
  end: Date,
): boolean {
  if (p.docType === "bs") {
    return p.asOf !== null && p.asOf >= start && p.asOf <= end;
  }
  if (!p.periodStart || !p.periodEnd) return false;
  return p.periodStart <= end && p.periodEnd >= start;
}

export function statementPeriodDate(p: StatementPeriod): Date | null {
  if (p.docType === "bs") {
    return (
      p.asOf ??
      p.periodEnd ??
      (p.year ? new Date(p.year, 11, 31, 23, 59, 59, 999) : null)
    );
  }
  return (
    p.periodEnd ??
    p.periodStart ??
    (p.year ? new Date(p.year, 11, 31, 23, 59, 59, 999) : null)
  );
}

function statementStartsAt(p: StatementPeriod): Date | null {
  if (p.docType === "bs") return statementPeriodDate(p);
  return (
    p.periodStart ??
    p.periodEnd ??
    (p.year ? new Date(p.year, 0, 1) : null)
  );
}

function statementIsInRange(
  p: StatementPeriod,
  start: Date,
  end: Date,
): boolean {
  if (p.docType === "bs") {
    const asOf = statementPeriodDate(p);
    return asOf !== null && asOf <= end;
  }
  if (p.periodStart && p.periodEnd) {
    return periodOverlaps(p, start, end);
  }
  if (p.year) {
    const yearStart = new Date(p.year, 0, 1);
    const yearEnd = new Date(p.year, 11, 31, 23, 59, 59, 999);
    return yearStart <= end && yearEnd >= start;
  }
  return false;
}

function sortPeriodsDesc(a: StatementPeriod, b: StatementPeriod): number {
  const aTime = statementPeriodDate(a)?.getTime() ?? 0;
  const bTime = statementPeriodDate(b)?.getTime() ?? 0;
  return bTime - aTime || b.docId - a.docId;
}

function withoutOverlappingPeriods(periods: StatementPeriod[]): StatementPeriod[] {
  const selected: StatementPeriod[] = [];
  for (const candidate of [...periods].sort(sortPeriodsDesc)) {
    const overlaps = selected.some(existing => {
      if (candidate.docType !== existing.docType) return false;
      if (candidate.docType === "bs") return candidate.asOf !== null && candidate.asOf.getTime() === existing.asOf?.getTime();
      if (!candidate.periodStart || !candidate.periodEnd || !existing.periodStart || !existing.periodEnd) return false;
      return candidate.periodStart <= existing.periodEnd && existing.periodStart <= candidate.periodEnd;
    });
    if (!overlaps) selected.push(candidate);
  }
  return selected;
}

export type PnLStatementSummary = {
  totalRevenue: number;
  totalCogs: number;
  totalGrossProfit: number;
  totalOpex: number;
  totalExpenses: number;
  netIncome: number;
  count: number;
};

export type CashFlowStatementSummary = {
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
  count: number;
};

export type FinancialStatementFallbacks = {
  pnl: Omit<PnLStatementSummary, "count"> & { count?: number };
  bs: BSFigures;
  cf: Omit<CashFlowStatementSummary, "count"> & { count?: number };
};

export type ResolvedFinancialStatements = {
  pnl: PnLStatementSummary;
  balanceSheet: BSFigures;
  cashFlow: CashFlowStatementSummary;
  pnlPeriods: StatementPeriod[];
  balanceSheetPeriods: StatementPeriod[];
  cashFlowPeriods: StatementPeriod[];
  balanceSheetPeriod: StatementPeriod | null;
  sources: {
    pnl: "uploaded" | "transactions";
    balanceSheet: "uploaded" | "transactions";
    cashFlow: "uploaded" | "transactions";
  };
};

/**
 * Resolves uploaded statements and transaction-derived fallbacks once for a
 * reporting window. Screens and exports should consume this object rather than
 * independently deciding which source wins.
 */
export function resolveFinancialStatements(
  statementPeriods: StatementPeriod[],
  start: Date,
  end: Date,
  fallbacks: FinancialStatementFallbacks,
): ResolvedFinancialStatements {
  const pnlPeriods = withoutOverlappingPeriods(statementPeriods
    .filter(
      (period) =>
        period.docType === "pnl" &&
        period.pnl !== undefined &&
        statementIsInRange(period, start, end),
    )
    .sort(sortPeriodsDesc));
  const balanceSheetPeriods = statementPeriods
    .filter(
      (period) =>
        period.docType === "bs" &&
        period.bs !== undefined &&
        statementIsInRange(period, start, end),
    )
    .sort(sortPeriodsDesc);
  const cashFlowPeriods = withoutOverlappingPeriods(statementPeriods
    .filter(
      (period) =>
        period.docType === "cf" &&
        period.cf !== undefined &&
        statementIsInRange(period, start, end),
    )
    .sort(sortPeriodsDesc));

  const pnl =
    pnlPeriods.length > 0
      ? {
          totalRevenue: pnlPeriods.reduce(
            (sum, period) => sum + (period.pnl?.revenue ?? 0),
            0,
          ),
          totalCogs: pnlPeriods.reduce(
            (sum, period) => sum + (period.pnl?.cogs ?? 0),
            0,
          ),
          totalGrossProfit: pnlPeriods.reduce(
            (sum, period) => sum + (period.pnl?.grossProfit ?? 0),
            0,
          ),
          totalOpex: pnlPeriods.reduce(
            (sum, period) => sum + (period.pnl?.opex ?? 0),
            0,
          ),
          totalExpenses: pnlPeriods.reduce(
            (sum, period) =>
              sum + (period.pnl?.cogs ?? 0) + (period.pnl?.opex ?? 0),
            0,
          ),
          netIncome: pnlPeriods.reduce(
            (sum, period) => sum + (period.pnl?.netIncome ?? 0),
            0,
          ),
          count: pnlPeriods.length,
        }
      : {
          ...fallbacks.pnl,
          count: fallbacks.pnl.count ?? 0,
        };

  const balanceSheetPeriod = balanceSheetPeriods[0] ?? null;
  const balanceSheet = balanceSheetPeriod?.bs ?? fallbacks.bs;

  const cashFlow =
    cashFlowPeriods.length > 0
      ? {
          operating: cashFlowPeriods.reduce(
            (sum, period) => sum + (period.cf?.operating ?? 0),
            0,
          ),
          investing: cashFlowPeriods.reduce(
            (sum, period) => sum + (period.cf?.investing ?? 0),
            0,
          ),
          financing: cashFlowPeriods.reduce(
            (sum, period) => sum + (period.cf?.financing ?? 0),
            0,
          ),
          netChange: cashFlowPeriods.reduce(
            (sum, period) => sum + (period.cf?.netChange ?? 0),
            0,
          ),
          count: cashFlowPeriods.length,
        }
      : {
          ...fallbacks.cf,
          count: fallbacks.cf.count ?? 0,
        };

  return {
    pnl,
    balanceSheet,
    cashFlow,
    pnlPeriods,
    balanceSheetPeriods,
    cashFlowPeriods,
    balanceSheetPeriod,
    sources: {
      pnl: pnlPeriods.length > 0 ? "uploaded" : "transactions",
      balanceSheet:
        balanceSheetPeriod !== null ? "uploaded" : "transactions",
      cashFlow: cashFlowPeriods.length > 0 ? "uploaded" : "transactions",
    },
  };
}

/** Returns the earliest real financial date on or before `end`. */
export function earliestFinancialDate(
  transactions: { date_time: string }[],
  statementPeriods: StatementPeriod[],
  end: Date,
): Date | null {
  const dates: Date[] = [];
  for (const transaction of transactions) {
    const date = parseDateSafe(transaction.date_time);
    if (date && date <= end) dates.push(date);
  }
  for (const period of statementPeriods) {
    const date = statementStartsAt(period);
    if (date && date <= end) dates.push(date);
  }
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

export function statementPeriodLabel(p: StatementPeriod): string {
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (p.docType === "bs")
    return p.asOf
      ? `As of ${fmtDate(p.asOf)}`
      : p.year
        ? String(p.year)
        : "Unknown period";
  if (p.periodStart && p.periodEnd)
    return `${fmtDate(p.periodStart)} – ${fmtDate(p.periodEnd)}`;
  return p.year ? String(p.year) : "Unknown period";
}
