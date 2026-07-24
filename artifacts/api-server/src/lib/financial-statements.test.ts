import assert from "node:assert/strict";
import test from "node:test";
import {
  hasAnyNonZeroValue,
  normalizeStatementType,
  parseStructuredStatement,
  periodsOverlap,
  validateAccounting,
} from "./financial-statements";
import { detectFormat, parseDelimited } from "../routes/extract-document";

function pnl(overrides: Record<string, unknown> = {}): any {
  return {
    metadata: {
      statement_type: "pnl", entity_name: "Acme LLC", period_start: "2025-01-01",
      period_end: "2025-12-31", as_of_date: null, currency: "USD", scale: "ones",
      comparative_periods: [],
    },
    values: {
      revenue: 100, cost_of_goods_sold: 40, gross_profit: 60, operating_expenses: 20,
      operating_income: 40, interest_expense: 5, tax_expense: 10, net_income: 25,
    },
    evidence: [], warnings: [], confidence: 0.9, ...overrides,
  };
}

test("Profit & Loss and Income Statement map to canonical pnl", () => {
  assert.equal(normalizeStatementType("Profit & Loss"), "pnl");
  assert.equal(normalizeStatementType("Income Statement"), "pnl");
});

test("missing values remain null and genuine zero remains zero", () => {
  const raw = pnl();
  raw.values.interest_expense = null;
  raw.values.tax_expense = 0;
  const parsed = parseStructuredStatement(raw, "pnl");
  assert.equal(parsed.values.interest_expense, null);
  assert.equal(parsed.values.tax_expense, 0);
});

test("malformed numeric values are rejected", () => {
  const raw = pnl();
  raw.values.revenue = "100" as unknown as number;
  assert.throws(() => parseStructuredStatement(raw, "pnl"), /finite number/);
});

test("P&L equation differences are visible and not forced", () => {
  const raw = pnl();
  raw.values.net_income = 30;
  const parsed = parseStructuredStatement(raw, "pnl");
  const findings = validateAccounting(parsed);
  assert.equal(findings.some(f => f.code === "pnl_net_income"), true);
  assert.equal(parsed.values.net_income, 30);
});

test("Balance Sheet equation failures are reported", () => {
  const parsed = parseStructuredStatement({
    metadata: { statement_type: "bs", entity_name: null, period_start: null, period_end: null, as_of_date: "2025-12-31", currency: "USD", scale: "ones", comparative_periods: [] },
    values: { cash: 10, current_assets: 100, non_current_assets: 50, total_assets: 150, current_liabilities: 40, long_term_liabilities: 30, total_liabilities: 70, equity: 50, total_liabilities_and_equity: 120 },
    evidence: [], warnings: [], confidence: 1,
  }, "bs");
  assert.equal(validateAccounting(parsed).some(f => f.code === "bs_equation"), true);
});

test("Cash Flow roll-forward failures are reported", () => {
  const parsed = parseStructuredStatement({
    metadata: { statement_type: "cf", entity_name: null, period_start: "2025-01-01", period_end: "2025-12-31", as_of_date: null, currency: "USD", scale: "thousands", comparative_periods: [] },
    values: { beginning_cash: 100, operating_activities: 20, investing_activities: -5, financing_activities: 0, net_cash_change: 15, ending_cash: 130 },
    evidence: [], warnings: [], confidence: 1,
  }, "cf");
  assert.equal(validateAccounting(parsed).some(f => f.code === "cf_rollforward"), true);
});

test("all-zero extraction is not treated as meaningful extraction", () => {
  const raw = pnl();
  for (const key of Object.keys(raw.values)) raw.values[key as keyof typeof raw.values] = 0;
  assert.equal(hasAnyNonZeroValue(parseStructuredStatement(raw, "pnl")), false);
});

test("annual and quarterly periods overlap", () => {
  assert.equal(periodsOverlap("pnl",
    { period_start: "2025-01-01", period_end: "2025-12-31", as_of_date: null },
    { period_start: "2025-01-01", period_end: "2025-03-31", as_of_date: null }), true);
});

test("CSV parser preserves quoted delimiters and detects semicolon files", () => {
  assert.match(parseDelimited('name,amount\n"Sales, online","1,200"\n'), /Sales, online/);
  assert.match(parseDelimited("name;amount\nSales;1200\n"), /c2=\"1200\"/);
});

test("magic bytes override misleading PDF MIME and reject legacy Office", () => {
  assert.equal(detectFormat(Buffer.from("%PDF-1.7"), "text/plain", "fake.txt"), "pdf");
  assert.throws(() => detectFormat(Buffer.from("d0cf11e0", "hex"), "application/octet-stream", "old.xls"), /unsupported/i);
});
