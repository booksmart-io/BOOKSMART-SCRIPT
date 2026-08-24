import assert from "node:assert/strict";
import test from "node:test";
import { buildFinancialPlanningSummary, FINANCIAL_PLANNING_SUMMARY_VERSION } from "./financial-planning-summary";

const now = new Date("2026-08-13T12:00:00.000Z");
const snapshots = [{ external_account_id: "checking", account_type: "depository", current_balance: 10_000, available_balance: 10_000, currency: "USD", balance_timestamp: "2026-08-13T10:00:00.000Z" }];
const connections = [{ status: "active", last_sync_status: "success" }];
const settings = { payroll_amount: 1_000, payroll_cadence: "monthly" as const, next_payroll_date: "2026-08-20", operating_buffer: 500, tax_effective_rate: 25, projected_taxable_income: 20_000, tax_amount_set_aside: 1_000 };
const items = [
  { id: 1, item_type: "obligation" as const, name: "Rent", amount: 2_000, due_date: "2026-08-20", recurrence: "monthly" as const, status: "active" },
  { id: 2, item_type: "receivable" as const, name: "Invoice", amount: 3_000, due_date: "2026-08-18", recurrence: "none" as const, status: "active" },
  { id: 3, item_type: "filing_schedule" as const, name: "Quarterly filing", amount: 0, due_date: "2026-09-15", recurrence: "quarterly" as const, status: "active" },
];

test("one versioned planning service produces fully configured owner and CPA results", () => {
  const first = buildFinancialPlanningSummary({ settings, items, snapshots, connections, now });
  const second = buildFinancialPlanningSummary({ settings, items, snapshots, connections, now });
  assert.equal(first.calculation_version, FINANCIAL_PLANNING_SUMMARY_VERSION);
  assert.deepEqual(second.verified_cash, first.verified_cash);
  assert.deepEqual(second.readiness.safe_to_spend.available && first.readiness.safe_to_spend.available
    ? second.readiness.safe_to_spend.safeToSpend : null, 2_500);
  assert.deepEqual(second.readiness.tax_reserve.remainingReserve, first.readiness.tax_reserve.remainingReserve);
  assert.deepEqual(second.readiness.forecast.available && first.readiness.forecast.available
    ? second.readiness.forecast.events : null, first.readiness.forecast.available ? first.readiness.forecast.events : null);
  assert.equal(first.readiness.safe_to_spend.available, true);
  assert.equal(first.readiness.tax_reserve.available, true);
  assert.equal(first.readiness.forecast.available, true);
});

test("planning service refuses values when cash is stale or prerequisites are missing", () => {
  const result = buildFinancialPlanningSummary({ settings: null, items: [], snapshots, connections, now: new Date("2026-08-15T12:00:00.000Z") });
  assert.equal(result.verified_cash.available, false);
  assert.equal(result.readiness.safe_to_spend.available, false);
  assert.equal(result.readiness.tax_reserve.available, false);
  assert.equal(result.readiness.forecast.available, false);
});
