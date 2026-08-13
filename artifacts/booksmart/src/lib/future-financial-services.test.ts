import assert from "node:assert/strict";
import test from "node:test";
import { calculateSafeToSpend, calculateThirtyDayForecast, forecastAvailability, taxReserveAvailability } from "./future-financial-services";

test("safe to spend refuses to fabricate a result with missing inputs", () => {
  const result = calculateSafeToSpend({ cashAvailable: 10_000, balanceFresh: true });
  assert.equal(result.available, false);
  if (!result.available) assert.deepEqual(result.missingInputs, ["knownObligations", "payrollRequirement", "taxReserveRequirement", "operatingBuffer"]);
});

test("safe to spend calculates only when every trusted input exists", () => {
  const result = calculateSafeToSpend({ cashAvailable: 10_000, balanceFresh: true, knownObligations: 2_000, payrollRequirement: 1_000, taxReserveRequirement: 1_500, operatingBuffer: 500 });
  assert.equal(result.available, true);
  if (result.available) { assert.equal(result.safeToSpend, 5_000); assert.equal(result.rawAvailableCash, 5_000); assert.equal(result.shortfall, 0); }
});

test("safe to spend exposes a shortfall without returning a negative spend recommendation", () => {
  const result = calculateSafeToSpend({ cashAvailable: 400, balanceFresh: true, knownObligations: 2_000, payrollRequirement: 2_500, taxReserveRequirement: 15_000, operatingBuffer: 5_000 });
  assert.equal(result.available, true); if (result.available) { assert.equal(result.safeToSpend, 0); assert.equal(result.rawAvailableCash, -24_100); assert.equal(result.shortfall, 24_100); }
});

test("tax and forecast services expose missing prerequisites", () => {
  assert.deepEqual(taxReserveAvailability({ taxStrategyConfigured: false }).missingInputs, ["tax_strategy", "effective_rate", "projected_taxable_income", "reserved_funds"]);
  assert.deepEqual(forecastAvailability({ recurringTransactions: true, knownObligations: false, payroll: false, receivables: false }).missingInputs, ["knownObligations", "payroll", "receivables"]);
});

test("tax reserve exposes estimated, reserved, and remaining amounts", () => {
  const result = taxReserveAvailability({ taxStrategyConfigured: true, effectiveRate: 25, projectedTaxableIncome: 80_000, amountSetAside: 5_000 });
  assert.equal(result.available, true); assert.equal(result.estimatedReserve, 20_000); assert.equal(result.remainingReserve, 15_000);
});

test("30-day forecast projects recurring items, payroll, and the lowest cash point", () => {
  const result = calculateThirtyDayForecast({ openingCash: 10_000, balanceFresh: true, start: new Date("2026-08-12T00:00:00Z"), payrollAmount: 2_000, payrollCadence: "biweekly", nextPayrollDate: "2026-08-14", items: [
    { id: 1, itemType: "obligation", name: "Rent", amount: 3_000, dueDate: "2026-08-15", recurrence: "monthly" },
    { id: 2, itemType: "receivable", name: "Client invoice", amount: 5_000, dueDate: "2026-08-20", recurrence: "none" },
  ] });
  assert.equal(result.available, true); if (result.available) { assert.equal(result.events.length, 5); assert.equal(result.totalCashIn, 5_000); assert.equal(result.totalCashOut, 9_000); assert.equal(result.endingCash, 6_000); assert.equal(result.lowestBalance, 5_000); assert.equal(result.shortfall, 0); }
});

test("30-day forecast refuses stale cash and reports the first shortfall", () => {
  assert.equal(calculateThirtyDayForecast({ openingCash: 100, balanceFresh: false, items: [] }).available, false);
  const result = calculateThirtyDayForecast({ openingCash: 1_000, balanceFresh: true, start: new Date("2026-08-12T00:00:00Z"), payrollAmount: 2_000, payrollCadence: "monthly", nextPayrollDate: "2026-08-13", items: [{ id: 1, itemType: "obligation", name: "Rent", amount: 500, dueDate: "2026-08-15", recurrence: "none" }, { id: 2, itemType: "receivable", name: "Invoice", amount: 100, dueDate: "2026-08-20", recurrence: "none" }] });
  assert.equal(result.available, true); if (result.available) { assert.equal(result.shortfallDate, "2026-08-13"); assert.equal(result.shortfall, 1_500); }
});
