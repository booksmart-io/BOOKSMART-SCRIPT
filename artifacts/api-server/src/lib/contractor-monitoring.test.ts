import assert from "node:assert/strict";
import test from "node:test";
import { contractorMonitoringEnabled, evaluateContractorSignals, mergeUpcomingObligations } from "./contractor-monitoring";

test("contractor monitoring is default-off", () => { assert.equal(contractorMonitoringEnabled({}), false); });

test("disconnected QuickBooks visibly limits accounting confidence without inventing values", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null, jobs: [], invoices: [], confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [], accountingConfirmationUnavailable: true });
  const signal = signals.find(row => row.signalKey === "contractor:accounting-confirmation-unavailable");
  assert.equal(signal?.title, "Accounting confirmation is limited");
  assert.equal(signal?.currentValue, 0);
  assert.match(signal?.description ?? "", /no QuickBooks values are invented/i);
  assert.equal(signal?.evidence?.[0]?.state, "missing");
});

test("explicit customer payments exclude transfers and preserve calculated starting cash", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null, jobs: [], invoices: [], confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [],
    bankActivity: { customerPayments: [{ id: "ach", amount: 4_500 }, { id: "check", amount: 1_800 }], transactionCount: 5, supportedEmailCount: 5, startingCash: 0 } });
  const signal = signals.find(row => row.signalKey === "contractor:classified-customer-payments");
  assert.equal(signal?.currentValue, 6_300);
  assert.deepEqual(signal?.exclusions, ["internal_transfers", "personal_transfers"]);
  assert.equal(signal?.calculation?.operands.at(-1)?.value, 0);
});

test("sparse bank and email evidence remains low confidence with visible counts", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null, jobs: [], invoices: [], confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [],
    bankActivity: { customerPayments: [], transactionCount: 25, supportedEmailCount: 5 } });
  const signal = signals.find(row => row.signalKey === "contractor:sparse-evidence");
  assert.equal(signal?.confidence, .2);
  assert.deepEqual(signal?.calculation?.operands.map(row => row.value), [25, 5]);
  assert.match(signal?.description ?? "", /low confidence/i);
});

test("creates deterministic margin, overdue, confirmation, and receipt-review signals", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: 0.3, now: new Date("2026-08-20T12:00:00Z"),
    jobs: [{ id: "job-1", title: "Johnson Remodel", status: "active", value: 10_000, invoiced: 10_000, trackedCosts: 8_000, costCount: 2 }],
    invoices: [{ id: "invoice-1", number: "101", balance: 12_000, dueDate: "2026-08-01", jobId: "job-1", clientId: null }],
    confirmationMatches: [{ id: "match-1", sourceId: "receipt-1" }], receiptReviewTransactionIds: ["tx-2"], unassignedExpenseTransactionIds: [],
  });
  assert.deepEqual(signals.map(signal => signal.signalKey), ["contractor:job-margin:job-1", "contractor:overdue-receivables", "contractor:matches-needing-confirmation", "contractor:expenses-needing-receipt-review"]);
  assert.equal(signals[0].severity, "high"); assert.equal(signals[1].severity, "high");
});

test("does not invent margin without both invoicing and tracked costs", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: 0.3, jobs: [{ id: "job-1", title: null, status: "active", value: 10_000, invoiced: 10_000, trackedCosts: 0, costCount: 0 }], invoices: [], confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [] });
  assert.equal(signals.length, 0);
});

test("overdue QuickBooks invoices retain their provider and do not become revenue", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null, now: new Date("2026-08-28T12:00:00Z"), jobs: [],
    invoices: [{ id: "quickbooks:invoice-1", number: "ROOF-1", balance: 25_000, dueDate: "2026-05-15", jobId: null, clientId: "customer-1", provider: "quickbooks" }],
    confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [] });
  assert.equal(signals[0]?.signalKey, "contractor:overdue-receivables");
  assert.match(signals[0]?.title ?? "", /QuickBooks invoice is overdue/);
  assert.equal(signals[0]?.currentValue, 25_000);
  assert.equal(signals[0]?.ctaRoute, "/user/money");
  assert.match(signals[0]?.description ?? "", /not added to accounting revenue/i);
});

test("receivables aging preserves exact 30, 60, and 90 day buckets", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null, now: new Date("2026-08-31T23:59:59Z"), jobs: [], invoices: [
    { id: "i-current", number: "1", balance: 10_000, dueDate: "2026-09-15", jobId: null, clientId: "c1", provider: "quickbooks" },
    { id: "i-30", number: "2", balance: 18_000, dueDate: "2026-07-25", jobId: null, clientId: "c2", provider: "quickbooks" },
    { id: "i-60", number: "3", balance: 22_000, dueDate: "2026-06-20", jobId: null, clientId: "c3", provider: "quickbooks" },
    { id: "i-90", number: "4", balance: 25_000, dueDate: "2026-05-15", jobId: null, clientId: "c4", provider: "quickbooks" }],
    confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [] });
  const aging = signals.find(signal => signal.signalKey === "contractor:receivables-aging");
  assert.equal(aging?.currentValue, 65_000);
  assert.match(aging?.description ?? "", /31–60 days: \$18,000/);
  assert.match(aging?.description ?? "", /61–90 days: \$22,000/);
  assert.match(aging?.description ?? "", /Over 90 days: \$25,000/);
  assert.deepEqual(aging?.sourceIds, ["i-30", "i-60", "i-90"]);
});

test("customer concentration uses explicit Jobber invoice totals without recognizing revenue", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null, jobs: [], invoices: [
    { id: "i-1", number: "1", total: 48_000, balance: 0, dueDate: null, jobId: null, clientId: "major", provider: "jobber" },
    { id: "i-2", number: "2", total: 22_000, balance: 0, dueDate: null, jobId: null, clientId: "two", provider: "jobber" },
    { id: "i-3", number: "3", total: 18_000, balance: 0, dueDate: null, jobId: null, clientId: "three", provider: "jobber" },
    { id: "i-4", number: "4", total: 12_000, balance: 0, dueDate: null, jobId: null, clientId: "four", provider: "jobber" }],
    confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [] });
  const concentration = signals.find(signal => signal.signalKey === "contractor:customer-concentration");
  assert.equal(concentration?.percentage, 48);
  assert.equal(concentration?.currentValue, 48_000);
  assert.deepEqual(concentration?.sourceIds, ["i-1"]);
  assert.match(concentration?.description ?? "", /not additional accounting revenue/i);
});

test("creates supported completed-work, concentration, and unassigned-expense signals", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null,
    jobs: [{ id: "job-1", title: "Finished Roof", status: "completed", value: 5_000, invoiced: 5_000, trackedCosts: 0, costCount: 0 }],
    invoices: [{ id: "invoice-1", number: "201", balance: 4_000, dueDate: null, jobId: "job-1", clientId: "client-1" },
      { id: "invoice-2", number: "202", balance: 1_000, dueDate: null, jobId: null, clientId: "client-2" }],
    confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: ["tx-1", "tx-2"],
  });
  assert.deepEqual(signals.map(signal => signal.signalKey), ["contractor:completed-jobs-outstanding", "contractor:receivable-concentration", "contractor:unassigned-job-expenses"]);
  assert.equal(signals[1]?.percentage, 80); assert.equal(signals[2]?.currentValue, 2);
});

test("warns when confirmed tracked costs approach break-even without inventing a target", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null,
    jobs: [{ id: "job-9", title: "Tight Margin Remodel", status: "active", value: 10_000, invoiced: 10_000, trackedCosts: 9_500, costCount: 3 }],
    invoices: [], confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [],
  });
  assert.equal(signals.length, 1);
  assert.equal(signals[0].signalKey, "contractor:job-margin:job-9");
  assert.equal(signals[0].severity, "high");
  assert.match(signals[0].title, /approaching tracked break-even/i);
  assert.equal(signals[0].comparisonValue, null);
  assert.deepEqual(signals[0].sourceIds, ["job-9"]);
});

test("classifies tracked costs above invoicing as a tracked loss, not a forecast", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null,
    jobs: [{ id: "job-loss", title: "Loss Job", status: "active", value: 8_000, invoiced: 8_000, trackedCosts: 8_500, costCount: 2 }],
    invoices: [], confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [],
  });
  assert.equal(signals[0].severity, "critical");
  assert.match(signals[0].title, /tracked loss/i);
  assert.match(signals[0].description, /not a final profit forecast/i);
});

test("identifies completed Jobber work with no linked invoice and preserves job evidence", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null,
    jobs: [
      { id: "job-1", title: "Oak drainage", status: "completed", value: 4_200, invoiced: 0, trackedCosts: 0, costCount: 0 },
      { id: "job-2", title: "Maple irrigation", status: "closed", value: 3_650, invoiced: 0, trackedCosts: 0, costCount: 0 },
      { id: "job-3", title: "Already billed", status: "completed", value: 2_000, invoiced: 2_000, trackedCosts: 0, costCount: 0 },
    ],
    invoices: [{ id: "invoice-3", number: "203", balance: 0, dueDate: null, jobId: "job-3", clientId: "client-3" }],
    confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [],
  });
  const signal = signals.find(candidate => candidate.signalKey === "contractor:completed-work-unbilled");
  assert.equal(signal?.currentValue, 7_850);
  assert.deepEqual(signal?.sourceIds, ["job-1", "job-2"]);
  assert.match(signal?.description ?? "", /potential unbilled work, not accounting revenue/i);
});

test("warns when explicit upcoming obligations exceed verified available cash", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null, now: new Date("2026-08-31T12:00:00Z"), jobs: [], invoices: [], confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [],
    availableCash: 20_000, upcomingObligations: [
      { id: "gmail:payroll", kind: "payroll", amount: 18_000, dueDate: "2026-09-05", confidence: "high" },
      { id: "gmail:vendor", kind: "vendor_bill", amount: 7_500, dueDate: "2026-09-08", confidence: "medium" },
    ] });
  const signal = signals.find(row => row.signalKey === "contractor:upcoming-cash-obligations");
  assert.equal(signal?.severity, "critical"); assert.equal(signal?.currentValue, 25_500); assert.equal(signal?.comparisonValue, 20_000);
  assert.match(signal?.description ?? "", /projected available cash is -\$5,500/); assert.deepEqual(signal?.sourceIds, ["gmail:payroll", "gmail:vendor"]);
});

test("Scenario 5 monitoring preserves a cross-source amount conflict without duplicating payment value", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null, jobs: [], invoices: [], confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [],
    economicEventEvidence: [
      { id: "qb-payment", source: "quickbooks", kind: "customer_payment", amount: 5_000, date: "2026-08-10", correlationKey: "INV-5000" },
      { id: "plaid-payment", source: "plaid", kind: "customer_payment", amount: 5_000, date: "2026-08-10", correlationKey: "INV-5000" },
      { id: "gmail-payment", source: "gmail", kind: "customer_payment", amount: 5_000, date: "2026-08-10", correlationKey: "INV-5000", evidenceOnly: true },
      { id: "statement-payment", source: "manual_statement", kind: "customer_payment", amount: 5_000, date: "2026-08-10", correlationKey: "INV-5000" },
      { id: "plaid-expense", source: "plaid", kind: "expense", amount: 420, date: "2026-08-11", correlationKey: "SUPPLY-811" },
      { id: "qb-expense", source: "quickbooks", kind: "expense", amount: 425, date: "2026-08-11", correlationKey: "SUPPLY-811" },
    ] });
  assert.equal(signals.length, 2, "payment evidence is shown as one deduplicated economic event plus the separate conflict");
  const payment = signals.find(row => row.signalKey.includes("deduplicated-economic-event"));
  assert.equal(payment?.currentValue, 5_000);
  assert.match(payment?.description ?? "", /counted once/i);
  const conflict = signals.find(row => row.signalKey.includes("economic-event-conflict"));
  assert.equal(conflict?.currentValue, 425);
  assert.equal(conflict?.comparisonValue, 420);
  assert.match(conflict?.description ?? "", /no source record was overwritten/i);
});

test("Scenario 15 monitoring presents one linked refund and net collected cash of $4,500", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null, jobs: [], invoices: [], confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [],
    economicEventEvidence: [
      { id: "qb-payment", source: "quickbooks", kind: "customer_payment", amount: 6_000, date: "2026-08-01", correlationKey: "INV-6000" },
      { id: "plaid-payment", source: "plaid", kind: "customer_payment", amount: 6_000, date: "2026-08-01", correlationKey: "INV-6000" },
      { id: "qb-credit", source: "quickbooks", kind: "refund", amount: 1_500, date: "2026-08-12", correlationKey: "CREDIT-1500", reverses: "INV-6000", evidenceOnly: true },
      { id: "plaid-refund", source: "plaid", kind: "refund", amount: 1_500, date: "2026-08-12", correlationKey: "CREDIT-1500", reverses: "INV-6000" },
    ] });
  assert.equal(signals.length, 1);
  assert.match(signals[0]!.signalKey, /refund-adjustment/);
  assert.equal(signals[0]!.currentValue, 4_500);
  assert.equal(signals[0]!.comparisonValue, 6_000);
  assert.match(signals[0]!.description, /not treated as an operating expense/i);
});

test("Scenario 9 explicit QuickBooks bills replace matching Gmail reminders without double counting", () => {
  const obligations = mergeUpcomingObligations([
    { id: "gmail-payroll", kind: "payroll", amount: 7_200, dueDate: "2026-09-03", confidence: "high", provider: "gmail" },
    { id: "gmail-vendor", kind: "vendor_bill", amount: 4_500, dueDate: "2026-09-05", confidence: "high", provider: "gmail" },
  ], [
    { id: "quickbooks:payroll", kind: "payroll", amount: 7_200, dueDate: "2026-09-03", confidence: "high", provider: "quickbooks" },
    { id: "quickbooks:vendor", kind: "vendor_bill", amount: 4_500, dueDate: "2026-09-05", confidence: "high", provider: "quickbooks" },
  ]);
  assert.equal(obligations.length, 2);
  assert.equal(obligations.reduce((sum, row) => sum + row.amount, 0), 11_700);
  assert.ok(obligations.every(row => row.provider === "quickbooks"));
  const signal = evaluateContractorSignals({ targetGrossMargin: null, jobs: [], invoices: [], confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [], availableCash: 9_000, upcomingObligations: obligations })[0]!;
  assert.equal(signal.currentValue, 11_700); assert.equal(signal.comparisonValue, 9_000); assert.equal(signal.severity, "critical");
  assert.match(signal.description, /projected available cash is -\$2,700/);
});

test("Scenario 11 concentration falls back to QuickBooks invoices when Jobber invoices are absent", () => {
  const invoices = [120_000, 20_000, 15_000, 10_000].map((total, index) => ({ id: `quickbooks:invoice-${index}`, number: String(index), total, balance: 0, dueDate: null, jobId: null, clientId: `customer-${index}`, provider: "quickbooks" as const }));
  const signal = evaluateContractorSignals({ targetGrossMargin: null, jobs: [], invoices, confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [] })
    .find(row => row.signalKey === "contractor:customer-concentration")!;
  assert.equal(signal.currentValue, 120_000); assert.equal(signal.comparisonValue, 165_000);
  assert.ok(Math.abs((signal.percentage ?? 0) - 72.7272727) < .0001);
  assert.match(signal.description, /explicit QuickBooks invoices/i);
});
