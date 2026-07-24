import {
  calculateFinancialReport,
  type FinancialCategory,
  type FinancialReportResult,
  type FinancialSubCategory,
  type FinancialTransaction,
} from "./financial-engine";

export type StatementType = "pl" | "cf" | "bs";
export type StatementFrequency = "monthly" | "quarterly" | "yearly";
export type StatementRowKind =
  | "header"
  | "subheader"
  | "item"
  | "total"
  | "grandtotal"
  | "separator";

export type StatementExportRow = {
  label: string;
  values: number[];
  kind: StatementRowKind;
};

export type StatementExport = {
  reportType: StatementType;
  reportName: string;
  companyName: string;
  address?: string;
  logoUrl?: string;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  columnLabels: string[];
  rows: StatementExportRow[];
};

export type StatementExportOptions = {
  reportType: StatementType;
  frequency: StatementFrequency;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  snapshotCount?: number;
  companyName: string;
  address?: string;
  logoUrl?: string;
  transactions: FinancialTransaction[];
  categories?: FinancialCategory[];
  subCategories?: FinancialSubCategory[];
};

export const MAX_STATEMENT_COLUMNS = 5;

function localDate(iso: string, endOfDay = false) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function labelFor(date: Date, frequency: StatementFrequency) {
  if (frequency === "monthly")
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  if (frequency === "quarterly")
    return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
  return String(date.getFullYear());
}

export function buildRangePeriods(
  startIso: string,
  endIso: string,
  frequency: StatementFrequency,
) {
  const start = localDate(startIso);
  const end = localDate(endIso, true);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    throw new Error("Choose valid report dates.");
  if (end < start) throw new Error("End date must be on or after start date.");

  const periods: { start: Date; end: Date; label: string }[] = [];
  let cursor =
    frequency === "monthly"
      ? new Date(start.getFullYear(), start.getMonth(), 1)
      : frequency === "quarterly"
        ? new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1)
        : new Date(start.getFullYear(), 0, 1);
  while (cursor <= end) {
    const next =
      frequency === "monthly"
        ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
        : frequency === "quarterly"
          ? new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1)
          : new Date(cursor.getFullYear() + 1, 0, 1);
    const periodStart = new Date(Math.max(start.getTime(), cursor.getTime()));
    const periodEnd = new Date(Math.min(end.getTime(), next.getTime() - 1));
    periods.push({
      start: periodStart,
      end: periodEnd,
      label: labelFor(cursor, frequency),
    });
    cursor = next;
  }
  if (periods.length > MAX_STATEMENT_COLUMNS)
    throw new Error(
      `Exports support at most ${MAX_STATEMENT_COLUMNS} period columns.`,
    );
  return periods;
}

export function buildSnapshotPeriods(
  asOfIso: string,
  frequency: StatementFrequency,
  count: number,
) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_STATEMENT_COLUMNS)
    throw new Error(
      `Choose between 1 and ${MAX_STATEMENT_COLUMNS} snapshot periods.`,
    );
  const asOf = localDate(asOfIso, true);
  if (Number.isNaN(asOf.getTime()))
    throw new Error("Choose a valid As Of date.");
  const ends = [asOf];
  let cursor = asOf;
  while (ends.length < count) {
    if (frequency === "monthly")
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        0,
        23,
        59,
        59,
        999,
      );
    else if (frequency === "quarterly") {
      const quarterStartMonth = Math.floor(cursor.getMonth() / 3) * 3;
      cursor = new Date(
        cursor.getFullYear(),
        quarterStartMonth,
        0,
        23,
        59,
        59,
        999,
      );
    } else cursor = new Date(cursor.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    ends.unshift(cursor);
  }
  return ends.map((end, index) => ({
    start: new Date(0),
    end,
    label:
      index === ends.length - 1
        ? `As of ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
        : labelFor(end, frequency),
  }));
}

function transactionLabel(
  tx: FinancialTransaction,
  subCategories: FinancialSubCategory[],
) {
  return (
    tx.sub_category_name ??
    subCategories.find((item) => item.id === tx.sub_category_id)?.name ??
    "Uncategorized"
  );
}

function categoryRows(
  reports: FinancialReportResult[],
  subCategories: FinancialSubCategory[],
  classifications: string[],
) {
  const names = new Set<string>();
  for (const report of reports)
    for (const tx of report.classifiedTransactions)
      if (classifications.includes(tx.classification))
        names.add(transactionLabel(tx, subCategories));
  return [...names].sort().map((label) => ({
    label,
    values: reports.map((report) =>
      report.classifiedTransactions
        .filter((tx) => classifications.includes(tx.classification))
        .filter((tx) => transactionLabel(tx, subCategories) === label)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
    ),
    kind: "item" as const,
  }));
}

function buildRows(
  type: StatementType,
  reports: FinancialReportResult[],
  subCategories: FinancialSubCategory[],
): StatementExportRow[] {
  const row = (
    label: string,
    kind: StatementRowKind,
    getter: (report: FinancialReportResult) => number,
  ): StatementExportRow => ({ label, kind, values: reports.map(getter) });
  const blank = (
    label: string,
    kind: StatementRowKind,
  ): StatementExportRow => ({
    label,
    kind,
    values: reports.map(() => 0),
  });

  if (type === "pl") {
    return [
      blank("Revenue", "header"),
      ...categoryRows(reports, subCategories, [
        "revenue",
        "returns",
        "discounts",
      ]),
      row("Total Revenue", "total", (r) => r.pnl.netRevenue),
      blank("Cost of Goods Sold", "header"),
      ...categoryRows(reports, subCategories, ["cogs"]),
      row("Total COGS", "total", (r) => r.pnl.cogs),
      row("Gross Profit", "grandtotal", (r) => r.pnl.grossProfit),
      blank("Operating Expenses", "header"),
      ...categoryRows(reports, subCategories, ["opex"]),
      row("Depreciation", "item", (r) => r.pnl.depreciation),
      row("Amortization", "item", (r) => r.pnl.amortization),
      row("Total Operating Expenses", "total", (r) => r.pnl.operatingExpenses),
      row("Operating Income", "grandtotal", (r) => r.pnl.operatingIncome),
      blank("Other Income / Expenses", "header"),
      row("Other Income", "item", (r) => r.pnl.otherIncome),
      row("Other Expenses", "item", (r) => -r.pnl.otherExpenses),
      row(
        "Total Other Income / Expenses",
        "total",
        (r) => r.pnl.otherIncome - r.pnl.otherExpenses,
      ),
      row("EBITDA", "total", (r) => r.pnl.ebitda),
      row("Net Income", "grandtotal", (r) => r.pnl.netIncome),
    ];
  }
  if (type === "cf") {
    return [
      blank("Operating Activities", "header"),
      row("Net Income", "item", (r) => r.cashFlow.netIncome),
      row(
        "Depreciation & Amortization",
        "item",
        (r) => r.cashFlow.depreciation + r.cashFlow.amortization,
      ),
      row(
        "Working Capital Changes",
        "item",
        (r) =>
          -r.cashFlow.accountsReceivableChange -
          r.cashFlow.inventoryChange -
          r.cashFlow.prepaidsChange +
          r.cashFlow.accountsPayableChange +
          r.cashFlow.accruedLiabilitiesChange +
          r.cashFlow.deferredRevenueChange,
      ),
      row(
        "Other Operating Adjustments",
        "item",
        (r) => r.cashFlow.otherOperatingActivity,
      ),
      row(
        "Net Cash from Operating Activities",
        "total",
        (r) => r.cashFlow.operatingCashFlow,
      ),
      blank("Investing Activities", "header"),
      row(
        "Asset Purchases / CapEx",
        "item",
        (r) => -r.cashFlow.capitalExpenditures,
      ),
      row(
        "Other Investing Activities",
        "item",
        (r) => r.cashFlow.assetSaleProceeds + r.cashFlow.investmentActivity,
      ),
      row(
        "Net Cash from Investing Activities",
        "total",
        (r) => r.cashFlow.investingCashFlow,
      ),
      blank("Financing Activities", "header"),
      row(
        "Loan Activities",
        "item",
        (r) => r.cashFlow.loanProceeds - r.cashFlow.principalPayments,
      ),
      row("Owner Contributions", "item", (r) => r.cashFlow.ownerContributions),
      row(
        "Distributions",
        "item",
        (r) => -r.cashFlow.ownerDraws - r.cashFlow.dividends,
      ),
      row("Other Financing Activities", "item", () => 0),
      row(
        "Net Cash from Financing Activities",
        "total",
        (r) => r.cashFlow.financingCashFlow,
      ),
      row(
        "Net Change in Cash",
        "grandtotal",
        (r) => r.cashFlow.netChangeInCash,
      ),
      row("Beginning Cash", "item", (r) => r.cashFlow.beginningCash),
      row("Ending Cash", "grandtotal", (r) => r.cashFlow.endingCash),
    ];
  }
  return [
    blank("Current Assets", "header"),
    row("Cash", "item", (r) => Math.max(0, r.balanceSheet.cash)),
    row(
      "Accounts Receivable",
      "item",
      (r) => r.balanceSheet.accountsReceivable,
    ),
    row("Inventory", "item", (r) => r.balanceSheet.inventory),
    row(
      "Other Current Assets",
      "item",
      (r) =>
        r.balanceSheet.prepaids +
        r.balanceSheet.shortTermInvestments +
        r.balanceSheet.otherCurrentAssets,
    ),
    row(
      "Total Current Assets",
      "total",
      (r) =>
        Math.max(0, r.balanceSheet.cash) +
        r.balanceSheet.accountsReceivable +
        r.balanceSheet.inventory +
        r.balanceSheet.prepaids +
        r.balanceSheet.shortTermInvestments +
        r.balanceSheet.otherCurrentAssets,
    ),
    blank("Fixed Assets", "header"),
    row("Gross Fixed Assets", "item", (r) => r.balanceSheet.grossFixedAssets),
    row(
      "Accumulated Depreciation",
      "item",
      (r) => -r.balanceSheet.accumulatedDepreciation,
    ),
    row("Net Fixed Assets", "total", (r) => r.balanceSheet.netFixedAssets),
    row("Other Assets", "item", (r) => r.balanceSheet.otherAssets),
    row(
      "Total Assets",
      "grandtotal",
      (r) => r.balanceSheet.totalAssets + Math.max(0, -r.balanceSheet.cash),
    ),
    blank("Current Liabilities", "header"),
    row("Accounts Payable", "item", (r) => r.balanceSheet.accountsPayable),
    row("Credit Cards", "item", (r) => r.balanceSheet.creditCards),
    row("Bank Overdraft", "item", (r) => Math.max(0, -r.balanceSheet.cash)),
    row(
      "Other Current Liabilities",
      "item",
      (r) =>
        r.balanceSheet.accruedExpenses +
        r.balanceSheet.taxesPayable +
        r.balanceSheet.currentDebt +
        r.balanceSheet.otherCurrentLiabilities,
    ),
    row(
      "Total Current Liabilities",
      "total",
      (r) =>
        r.balanceSheet.currentLiabilities + Math.max(0, -r.balanceSheet.cash),
    ),
    row(
      "Long-Term Liabilities",
      "item",
      (r) => r.balanceSheet.longTermLiabilities,
    ),
    row(
      "Total Liabilities",
      "total",
      (r) =>
        r.balanceSheet.totalLiabilities + Math.max(0, -r.balanceSheet.cash),
    ),
    blank("Equity", "header"),
    row(
      "Owner's Equity",
      "item",
      (r) =>
        r.balanceSheet.ownerContributions -
        r.balanceSheet.ownerDraws -
        r.balanceSheet.dividends,
    ),
    row("Retained Earnings", "item", (r) => r.balanceSheet.cumulativeNetIncome),
    row(
      "Total Equity",
      "total",
      (r) => r.balanceSheet.totalAssets - r.balanceSheet.totalLiabilities,
    ),
    row(
      "Total Liabilities & Equity",
      "grandtotal",
      (r) => r.balanceSheet.totalAssets + Math.max(0, -r.balanceSheet.cash),
    ),
  ];
}

export function createStatementExport(
  options: StatementExportOptions,
): StatementExport {
  const periods =
    options.reportType === "bs"
      ? buildSnapshotPeriods(
          options.asOfDate ?? "",
          options.frequency,
          options.snapshotCount ?? 1,
        )
      : buildRangePeriods(
          options.startDate ?? "",
          options.endDate ?? "",
          options.frequency,
        );
  const reports = periods.map((period) =>
    calculateFinancialReport({
      transactions: options.transactions,
      start: period.start,
      end: period.end,
      categories: options.categories,
      subCategories: options.subCategories,
    }),
  );
  if (!reports.some((report) => report.classifiedTransactions.length > 0))
    throw new Error(
      "No transactions were found for the selected report dates.",
    );
  const names = { pl: "Profit & Loss", cf: "Cash Flow", bs: "Balance Sheet" };
  return {
    reportType: options.reportType,
    reportName: names[options.reportType],
    companyName: options.companyName || "Organization",
    address: options.address,
    logoUrl: options.logoUrl,
    startDate: options.reportType === "bs" ? undefined : options.startDate,
    endDate: options.reportType === "bs" ? undefined : options.endDate,
    asOfDate: options.reportType === "bs" ? options.asOfDate : undefined,
    columnLabels: periods.map((period) => period.label),
    rows: buildRows(options.reportType, reports, options.subCategories ?? []),
  };
}

export function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function statementExportToCsv(model: StatementExport) {
  const metadata = model.asOfDate
    ? `As of ${model.asOfDate}`
    : `${model.startDate} to ${model.endDate}`;
  return [
    [model.companyName],
    [model.reportName],
    [metadata],
    [],
    ["", ...model.columnLabels],
    ...model.rows.map((row) => [
      row.label,
      ...row.values.map((value) => value.toFixed(2)),
    ]),
  ]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\r\n");
}

export function safeStatementFilename(
  model: StatementExport,
  extension: string,
) {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const dates = model.asOfDate ?? `${model.startDate}_${model.endDate}`;
  return `${slug(model.reportName)}_${slug(model.companyName)}_${dates}.${extension}`;
}
