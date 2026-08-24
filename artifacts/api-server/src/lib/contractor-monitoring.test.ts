import assert from "node:assert/strict";
import test from "node:test";
import { contractorMonitoringEnabled, evaluateContractorSignals } from "./contractor-monitoring";

test("contractor monitoring is default-off", () => { assert.equal(contractorMonitoringEnabled({}), false); });

test("creates deterministic margin, overdue, confirmation, and receipt-review signals", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: 0.3, now: new Date("2026-08-20T12:00:00Z"),
    jobs: [{ id: "job-1", title: "Johnson Remodel", status: "active", invoiced: 10_000, trackedCosts: 8_000, costCount: 2 }],
    invoices: [{ id: "invoice-1", number: "101", balance: 12_000, dueDate: "2026-08-01", jobId: "job-1", clientId: null }],
    confirmationMatches: [{ id: "match-1", sourceId: "receipt-1" }], receiptReviewTransactionIds: ["tx-2"], unassignedExpenseTransactionIds: [],
  });
  assert.deepEqual(signals.map(signal => signal.signalKey), ["contractor:job-margin:job-1", "contractor:overdue-receivables", "contractor:matches-needing-confirmation", "contractor:expenses-needing-receipt-review"]);
  assert.equal(signals[0].severity, "high"); assert.equal(signals[1].severity, "high");
});

test("does not invent margin without both invoicing and tracked costs", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: 0.3, jobs: [{ id: "job-1", title: null, status: "active", invoiced: 10_000, trackedCosts: 0, costCount: 0 }], invoices: [], confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [] });
  assert.equal(signals.length, 0);
});

test("creates supported completed-work, concentration, and unassigned-expense signals", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null,
    jobs: [{ id: "job-1", title: "Finished Roof", status: "completed", invoiced: 5_000, trackedCosts: 0, costCount: 0 }],
    invoices: [{ id: "invoice-1", number: "201", balance: 4_000, dueDate: null, jobId: "job-1", clientId: "client-1" },
      { id: "invoice-2", number: "202", balance: 1_000, dueDate: null, jobId: null, clientId: "client-2" }],
    confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: ["tx-1", "tx-2"],
  });
  assert.deepEqual(signals.map(signal => signal.signalKey), ["contractor:completed-jobs-outstanding", "contractor:receivable-concentration", "contractor:unassigned-job-expenses"]);
  assert.equal(signals[1]?.percentage, 80); assert.equal(signals[2]?.currentValue, 2);
});

test("warns when confirmed tracked costs approach break-even without inventing a target", () => {
  const signals = evaluateContractorSignals({ targetGrossMargin: null,
    jobs: [{ id: "job-9", title: "Tight Margin Remodel", status: "active", invoiced: 10_000, trackedCosts: 9_500, costCount: 3 }],
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
    jobs: [{ id: "job-loss", title: "Loss Job", status: "active", invoiced: 8_000, trackedCosts: 8_500, costCount: 2 }],
    invoices: [], confirmationMatches: [], receiptReviewTransactionIds: [], unassignedExpenseTransactionIds: [],
  });
  assert.equal(signals[0].severity, "critical");
  assert.match(signals[0].title, /tracked loss/i);
  assert.match(signals[0].description, /not a final profit forecast/i);
});
