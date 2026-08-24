import assert from "node:assert/strict";
import test from "node:test";
import { buildContractorFinancialIntelligence } from "./contractor-financial-intelligence";

test("canonical accounting totals remain authoritative and Jobber is not added to revenue", () => {
  const result = buildContractorFinancialIntelligence({ organizationId: 7, start: new Date("2026-08-01Z"), end: new Date("2026-08-31Z"),
    canonical: { revenue: 15_000, accountingExpenses: 6_000, netIncome: 9_000 }, connectedSources: ["quickbooks", "plaid", "jobber"],
    jobberInvoices: [{ external_id: "invoice-1", amount: 15_000, payload: { amounts: { total: 15_000, invoiceBalance: 0 } } }],
  });
  assert.equal(result.revenue.value, 15_000);
  assert.deepEqual(result.revenue.sources, ["booksmart"]);
});

test("margin is unavailable until both revenue context and assigned costs exist", () => {
  const result = buildContractorFinancialIntelligence({ organizationId: 7, start: new Date("2026-08-01Z"), end: new Date("2026-08-31Z"),
    canonical: { revenue: 10_000, accountingExpenses: 4_000, netIncome: 6_000 }, connectedSources: ["jobber"],
    jobberJobs: [{ external_id: "job-1", amount: 12_000, payload: { invoicedTotal: 10_000 } }],
  });
  assert.equal(result.jobs[0].currentTrackedMargin.confidence, "unavailable");
  assert.ok(result.jobs[0].currentTrackedMargin.missingInputs.includes("assigned_job_costs"));
});

test("current tracked margin uses only explicitly assigned costs", () => {
  const result = buildContractorFinancialIntelligence({ organizationId: 7, start: new Date("2026-08-01Z"), end: new Date("2026-08-31Z"),
    canonical: { revenue: 10_000, accountingExpenses: 4_000, netIncome: 6_000 }, connectedSources: ["jobber"],
    jobberJobs: [{ external_id: "job-1", payload: { invoicedTotal: 10_000 } }],
    assignments: [{ jobber_job_id: "job-1", amount: 4_000, confidence: "confirmed", source_record_id: "tx-1" }],
  });
  assert.equal(result.jobs[0].currentTrackedProfit.value, 6_000);
  assert.equal(result.jobs[0].currentTrackedMargin.value, 0.6);
});

test("period comparisons and verified cash preserve confidence and source", () => {
  const result = buildContractorFinancialIntelligence({ organizationId: 7, start: new Date("2026-08-01Z"), end: new Date("2026-08-31Z"),
    canonical: { revenue: 12_000, accountingExpenses: 6_000, netIncome: 6_000 },
    previousCanonical: { revenue: 10_000, accountingExpenses: 5_000, netIncome: 5_000 },
    connectedSources: ["plaid"], cash: { current: 8_000, available: 7_500, confidence: "high", latestBalanceAt: "2026-08-20T10:00:00Z" },
  });
  assert.equal(result.comparisons.previousPeriod.revenueChangePercent.value, 0.2);
  assert.equal(result.cashPosition.availableBalance.value, 7_500);
  assert.deepEqual(result.cashPosition.availableBalance.sources, ["plaid"]);
});

test("YTD, prior-year change, and customer receivable concentration use trusted records", () => {
  const result = buildContractorFinancialIntelligence({ organizationId: 7, start: new Date("2026-08-01Z"), end: new Date("2026-08-31Z"),
    canonical: { revenue: 12_000, accountingExpenses: 6_000, netIncome: 6_000 },
    yearToDateCanonical: { revenue: 80_000, accountingExpenses: 40_000, netIncome: 40_000 },
    priorYearCanonical: { revenue: 10_000, accountingExpenses: 5_000, netIncome: 5_000 }, connectedSources: ["jobber"],
    jobberClients: [{ external_id: "client-1", title: "Johnson Construction" }],
    jobberInvoices: [{ external_id: "invoice-1", related_client_id: "client-1", source_created_at: "2026-08-01T00:00:00Z", payload: { amounts: { invoiceBalance: 5000 }, dueDate: "2026-08-15" } }],
  });
  assert.equal(result.yearToDate.revenue.value, 80_000);
  assert.equal(result.comparisons.samePeriodLastYear.revenueChangePercent.value, 0.2);
  assert.equal(result.accountsReceivable.largestCustomerBalances[0].customerName, "Johnson Construction");
  assert.equal(result.accountsReceivable.largestCustomerBalances[0].overdue, 5000);
});

test("ranks below-target jobs and reports explainable unusual approved expenses", () => {
  const result = buildContractorFinancialIntelligence({ organizationId: 7, start: new Date("2026-08-01Z"), end: new Date("2026-08-31Z"),
    canonical: { revenue: 10_000, accountingExpenses: 8_000, netIncome: 2_000, visuals: { spendingBreakdown: [{ key: "cost_of_sales", label: "Cost of sales", value: 8000 }] } },
    previousCanonical: { revenue: 10_000, accountingExpenses: 4_000, netIncome: 6_000, visuals: { spendingBreakdown: [{ key: "cost_of_sales", label: "Cost of sales", value: 4000 }] } },
    connectedSources: ["jobber"], targetGrossMargin: 0.3, targetSource: "organization",
    jobberJobs: [{ external_id: "job-1", title: "Johnson Remodel", payload: { invoicedTotal: 10_000 } }],
    assignments: [{ jobber_job_id: "job-1", amount: 8_000, confidence: "confirmed", source_record_id: "tx-2" }],
    transactions: [{ id: 1, amount: -100, date_time: "2026-08-02", pending: false }, { id: 2, amount: -5000, date_time: "2026-08-03", title: "Home Depot", pending: false }],
  });
  assert.equal(result.jobs[0].attentionStatus, "needs_attention");
  assert.ok(result.jobs[0].attentionReasons.includes("tracked_margin_below_target"));
  assert.equal(result.expenseCategoryChanges[0].changePercent, 1);
  assert.equal(result.unusualTransactions[0].transactionId, "2");
});

for (const scenario of [
  { name: "Jobber + QuickBooks + Plaid", sources: ["jobber", "quickbooks", "plaid"] as const, jobs: true, cash: true },
  { name: "Jobber + QuickBooks", sources: ["jobber", "quickbooks"] as const, jobs: true, cash: false },
  { name: "Jobber + Plaid", sources: ["jobber", "plaid"] as const, jobs: true, cash: true },
  { name: "Jobber only", sources: ["jobber"] as const, jobs: true, cash: false },
  { name: "Plaid only", sources: ["plaid"] as const, jobs: false, cash: true },
]) {
  test(`${scenario.name} mode exposes only supported intelligence and never adds operational values to canonical totals`, () => {
    const result = buildContractorFinancialIntelligence({
      organizationId: 7, start: new Date("2026-08-01Z"), end: new Date("2026-08-31Z"),
      canonical: { revenue: 1_000, accountingExpenses: 400, netIncome: 600 },
      connectedSources: [...scenario.sources],
      jobberJobs: scenario.jobs ? [{ external_id: "job-1", amount: 50_000, payload: { invoicedTotal: 15_000 } }] : [],
      jobberInvoices: scenario.jobs ? [{ external_id: "invoice-1", amount: 15_000, payload: { jobId: "job-1", amounts: { total: 15_000, invoiceBalance: 5_000 } } }] : [],
      cash: scenario.cash ? { current: 8_000, available: 7_500, confidence: "high", latestBalanceAt: "2026-08-20T00:00:00Z" } : undefined,
    });
    assert.equal(result.revenue.value, 1_000);
    assert.equal(result.expenses.value, 400);
    assert.equal(result.netIncome.value, 600);
    assert.equal(result.jobs.length, scenario.jobs ? 1 : 0);
    assert.equal(result.cashPosition.currentBalance.value, scenario.cash ? 8_000 : null);
    assert.equal(result.cashPosition.currentBalance.confidence, scenario.cash ? "high" : "unavailable");
    assert.equal(result.accountsReceivable.totalOutstanding.value, scenario.jobs ? 5_000 : null);
    assert.equal(result.dataSources.includes("gmail"), false);
  });
}

test("Jobber invoice, QuickBooks-backed canonical payment, and Plaid cash evidence count revenue once", () => {
  const result = buildContractorFinancialIntelligence({
    organizationId: 7, start: new Date("2026-08-01Z"), end: new Date("2026-08-31Z"),
    canonical: { revenue: 15_000, accountingExpenses: 0, netIncome: 15_000 },
    connectedSources: ["jobber", "quickbooks", "plaid"],
    jobberJobs: [{ external_id: "job-1", amount: 15_000, payload: { invoicedTotal: 15_000 } }],
    jobberInvoices: [{ external_id: "invoice-1", amount: 15_000, payload: { jobId: "job-1", amounts: { total: 15_000, invoiceBalance: 0 } } }],
    jobberPayments: [{ external_id: "payment-1", amount: 15_000, payload: { jobId: "job-1" } }],
    cash: { current: 15_000, available: 15_000, confidence: "high", latestBalanceAt: "2026-08-20T00:00:00Z" },
  });
  assert.equal(result.revenue.value, 15_000);
  assert.deepEqual(result.revenue.sources, ["booksmart"]);
  assert.equal(result.jobs[0].amountCollected.value, 15_000);
});
