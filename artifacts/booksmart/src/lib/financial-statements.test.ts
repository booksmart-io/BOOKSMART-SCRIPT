import assert from "node:assert/strict";
import test from "node:test";
import {
  earliestFinancialDate,
  normalizeStatementDoc,
  resolveFinancialStatements,
  type BSFigures,
  type StatementPeriod,
} from "./financial-statements";

const fallbackBs: BSFigures = {
  currentAssets: 20_217.23,
  nonCurrentAssets: 0,
  totalAssets: 20_217.23,
  currentLiabilities: 0,
  longTermLiabilities: 0,
  totalLiabilities: 0,
  equity: 20_217.23,
};

const fallbacks = {
  pnl: {
    totalRevenue: 21_749.95,
    totalCogs: 0,
    totalGrossProfit: 21_749.95,
    totalOpex: 1_532.72,
    totalExpenses: 1_532.72,
    netIncome: 20_217.23,
    count: 2,
  },
  bs: fallbackBs,
  cf: {
    operating: 20_217.23,
    investing: 0,
    financing: 0,
    netChange: 20_217.23,
    count: 2,
  },
};

function statement(
  partial: Partial<StatementPeriod> &
    Pick<StatementPeriod, "docId" | "docType">,
): StatementPeriod {
  return {
    docName: `statement-${partial.docId}`,
    source: "ai",
    organizationId: 10,
    periodStart: null,
    periodEnd: null,
    asOf: null,
    year: 2026,
    ...partial,
  };
}

test("latest uploaded Balance Sheet is the shared as-of source", () => {
  const periods: StatementPeriod[] = [
    statement({
      docId: 1,
      docType: "bs",
      asOf: new Date("2026-06-30T12:00:00Z"),
      bs: {
        currentAssets: 30_000,
        nonCurrentAssets: 10_000,
        totalAssets: 40_000,
        currentLiabilities: 10_000,
        longTermLiabilities: 10_000,
        totalLiabilities: 20_000,
        equity: 20_000,
      },
    }),
    statement({
      docId: 2,
      docType: "bs",
      asOf: new Date("2026-07-22T12:00:00Z"),
      bs: {
        currentAssets: 39_800,
        nonCurrentAssets: 14_000,
        totalAssets: 53_800,
        currentLiabilities: 18_950,
        longTermLiabilities: 12_000,
        totalLiabilities: 30_950,
        equity: 22_850,
      },
    }),
  ];

  const resolved = resolveFinancialStatements(
    periods,
    new Date("2026-07-01T00:00:00Z"),
    new Date("2026-07-23T23:59:59Z"),
    fallbacks,
  );

  assert.equal(resolved.sources.balanceSheet, "uploaded");
  assert.equal(resolved.balanceSheetPeriod?.docId, 2);
  assert.equal(resolved.balanceSheet.totalAssets, 53_800);
  assert.equal(resolved.balanceSheet.totalLiabilities, 30_950);
  assert.equal(resolved.balanceSheet.equity, 22_850);
  assert.equal(
    resolved.balanceSheet.totalAssets,
    resolved.balanceSheet.totalLiabilities + resolved.balanceSheet.equity,
  );
});

test("Dashboard P&L and Cash Flow resolve from the same uploaded periods", () => {
  const periods: StatementPeriod[] = [
    statement({
      docId: 3,
      docType: "pnl",
      periodStart: new Date("2026-07-01T00:00:00Z"),
      periodEnd: new Date("2026-07-31T23:59:59Z"),
      pnl: {
        revenue: 10_000,
        cogs: 2_000,
        grossProfit: 8_000,
        opex: 3_000,
        netIncome: 5_000,
      },
    }),
    statement({
      docId: 4,
      docType: "cf",
      periodStart: new Date("2026-07-01T00:00:00Z"),
      periodEnd: new Date("2026-07-31T23:59:59Z"),
      cf: {
        operating: 7_000,
        investing: -1_500,
        financing: -500,
        netChange: 5_000,
      },
    }),
  ];

  const resolved = resolveFinancialStatements(
    periods,
    new Date("2026-07-01T00:00:00Z"),
    new Date("2026-07-23T23:59:59Z"),
    fallbacks,
  );

  assert.deepEqual(resolved.pnl, {
    totalRevenue: 10_000,
    totalCogs: 2_000,
    totalGrossProfit: 8_000,
    totalOpex: 3_000,
    totalExpenses: 5_000,
    netIncome: 5_000,
    count: 1,
  });
  assert.deepEqual(resolved.cashFlow, {
    operating: 7_000,
    investing: -1_500,
    financing: -500,
    netChange: 5_000,
    count: 1,
  });
});

test("transaction calculations remain the fallback when no statement applies", () => {
  const resolved = resolveFinancialStatements(
    [],
    new Date("2026-07-01T00:00:00Z"),
    new Date("2026-07-23T23:59:59Z"),
    fallbacks,
  );

  assert.equal(resolved.sources.pnl, "transactions");
  assert.equal(resolved.sources.balanceSheet, "transactions");
  assert.equal(resolved.sources.cashFlow, "transactions");
  assert.equal(resolved.pnl.netIncome, 20_217.23);
  assert.equal(resolved.balanceSheet.totalAssets, 20_217.23);
  assert.equal(resolved.cashFlow.netChange, 20_217.23);
});

test("statement normalization preserves optional organization metadata", () => {
  const normalized = normalizeStatementDoc({
    id: 9,
    name: "balance-sheet.pdf",
    category: "Balance Sheet",
    tax_year: "2026",
    parsed_data: {
      org_id: 42,
      as_of: "2026-07-22",
      assets_current: 39_800,
      assets_non_current: 14_000,
      liabilities_current: 18_950,
      liabilities_long_term: 12_000,
      equity: 22_850,
      ai_extracted: true,
    },
  });

  assert.equal(normalized[0]?.organizationId, 42);
});

test("all-time display starts at the earliest real financial date", () => {
  const start = earliestFinancialDate(
    [
      { date_time: "2026-02-10T12:00:00Z" },
      { date_time: "2026-03-01T12:00:00Z" },
    ],
    [
      statement({
        docId: 10,
        docType: "pnl",
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-01-31T23:59:59Z"),
        pnl: {
          revenue: 1,
          cogs: 0,
          grossProfit: 1,
          opex: 0,
          netIncome: 1,
        },
      }),
    ],
    new Date("2026-07-23T23:59:59Z"),
  );

  assert.equal(start?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.notEqual(start?.getUTCFullYear(), 1970);
});
