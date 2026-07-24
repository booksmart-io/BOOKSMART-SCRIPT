import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRangePeriods,
  createStatementExport,
  escapeCsv,
  statementExportToCsv,
  type StatementExportOptions,
} from "./statement-export";

let id = 1;
const tx = (
  amount: number,
  title: string,
  date_time: string,
  sub_category_name?: string,
) => ({
  id: id++,
  amount,
  title,
  date_time,
  sub_category_name,
});

const base: Omit<StatementExportOptions, "reportType"> = {
  frequency: "monthly",
  startDate: "2026-01-01",
  endDate: "2026-02-28",
  asOfDate: "2026-02-28",
  snapshotCount: 2,
  companyName: "Acme, Inc.",
  transactions: [
    tx(1_000, "[Revenue] Sales", "2026-01-10T12:00:00Z", "Consulting"),
    tx(-200, "[COGS] Materials", "2026-01-11T12:00:00Z", "Materials"),
    tx(-100, "[OPEX] Rent", "2026-01-12T12:00:00Z", "Rent"),
    tx(500, "[Revenue] Sales", "2026-02-10T12:00:00Z", "Consulting"),
  ],
};

test("P&L uses subcategory rows and required totals", () => {
  const model = createStatementExport({ ...base, reportType: "pl" });
  assert.deepEqual(model.columnLabels, ["Jan 2026", "Feb 2026"]);
  assert.deepEqual(
    model.rows.find((row) => row.label === "Consulting")?.values,
    [1000, 500],
  );
  assert.deepEqual(
    model.rows.find((row) => row.label === "Gross Profit")?.values,
    [800, 500],
  );
  assert.deepEqual(
    model.rows.find((row) => row.label === "Net Income")?.values,
    [700, 500],
  );
});

test("cash flow reconciles beginning, change, and ending cash", () => {
  const model = createStatementExport({
    ...base,
    reportType: "cf",
    startDate: "2026-02-01",
    transactions: [
      tx(300, "[Revenue] Earlier cash sale", "2026-01-10T12:00:00Z"),
      tx(500, "[Revenue] Cash sale", "2026-02-10T12:00:00Z"),
      tx(-100, "[OPEX] Rent", "2026-02-11T12:00:00Z"),
    ],
  });
  const value = (label: string) =>
    model.rows.find((row) => row.label === label)!.values[0];
  assert.equal(value("Beginning Cash"), 300);
  assert.equal(value("Net Change in Cash"), 400);
  assert.equal(value("Ending Cash"), 700);
});

test("Balance Sheet snapshots are cumulative and negative cash becomes overdraft", () => {
  const model = createStatementExport({
    ...base,
    reportType: "bs",
    asOfDate: "2026-02-28",
    transactions: [
      tx(100, "[Revenue] Cash sale", "2026-01-10T12:00:00Z"),
      tx(-250, "[OPEX] Rent", "2026-02-10T12:00:00Z"),
    ],
  });
  assert.deepEqual(
    model.rows.find((row) => row.label === "Cash")?.values,
    [100, 0],
  );
  assert.deepEqual(
    model.rows.find((row) => row.label === "Bank Overdraft")?.values,
    [0, 150],
  );
  assert.match(model.columnLabels.at(-1)!, /^As of Feb 28, 2026$/);
});

test("monthly, quarterly, and yearly periods aggregate and reject more than five columns", () => {
  assert.equal(
    buildRangePeriods("2026-01-01", "2026-03-31", "monthly").length,
    3,
  );
  assert.equal(
    buildRangePeriods("2026-01-01", "2026-12-31", "quarterly").length,
    4,
  );
  assert.equal(
    buildRangePeriods("2024-01-01", "2026-12-31", "yearly").length,
    3,
  );
  assert.throws(
    () => buildRangePeriods("2026-01-01", "2026-06-30", "monthly"),
    /at most 5/,
  );
});

test("CSV escapes commas, quotes, and newlines and consumes the normalized model", () => {
  assert.equal(escapeCsv('A, "quoted"\nvalue'), '"A, ""quoted""\nvalue"');
  const model = createStatementExport({ ...base, reportType: "pl" });
  const csv = statementExportToCsv(model);
  assert.match(csv, /^"Acme, Inc."/);
  for (const row of model.rows) {
    assert.ok(csv.includes(row.label));
    assert.equal(row.values.length, model.columnLabels.length);
  }
});
