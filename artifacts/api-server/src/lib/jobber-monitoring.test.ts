import assert from "node:assert/strict";
import test from "node:test";
import { evaluateJobberOperationalPlanning, evaluateJobberOperationalRecords, jobberMonitoringEnabled, type JobberMonitoringRecord } from "./jobber-monitoring";

const record = (values: Partial<JobberMonitoringRecord>): JobberMonitoringRecord => ({
  external_id: "jobber-1", object_type: "jobs", record_number: "101", status: null, title: "Test record",
  amount: null, starts_at: null, ends_at: null, source_created_at: "2026-08-01T00:00:00.000Z", source_updated_at: "2026-08-01T00:00:00.000Z", direct_url: "https://secure.getjobber.com/example",
  is_archived: false, payload: {}, ...values,
});
const now = new Date("2026-08-11T12:00:00.000Z");

test("Jobber monitoring is local-only and disabled by default", () => {
  assert.equal(jobberMonitoringEnabled({ NODE_ENV: "development" }), false);
  assert.equal(jobberMonitoringEnabled({ NODE_ENV: "development", JOBBER_MONITORING_ENABLED: "true" }), true);
  assert.equal(jobberMonitoringEnabled({ NODE_ENV: "production", JOBBER_MONITORING_ENABLED: "true" }), false);
});

test("explicit requires-invoicing jobs create traceable operational signals", () => {
  const signals = evaluateJobberOperationalRecords([record({ status: "requires_invoicing", payload: { uninvoicedTotal: 750 } })], now);
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.signalKey, "jobber:completed-uninvoiced:jobber-1");
  assert.equal(signals[0]?.currentValue, 750);
  assert.equal(signals[0]?.provider, "jobber");
  assert.equal(signals[0]?.requiresCpaReview, false);
  assert.deepEqual(signals[0]?.sourceIds, ["jobber-1"]);
  assert.match(signals[0]?.description ?? "", /not counted as BookSmart revenue/i);
});

test("invoice rules use Jobber invoiceBalance and due status without recognizing revenue", () => {
  const signals = evaluateJobberOperationalRecords([record({
    object_type: "invoices", status: "past_due", record_number: "900", amount: 125,
    payload: { amounts: { invoiceBalance: 125, total: 200 }, dueDate: "2026-08-01T00:00:00.000Z" },
  })], now);
  assert.equal(signals[0]?.currentValue, 125);
  assert.equal(signals[0]?.severity, "high");
  assert.equal(signals[0]?.category, "cash_flow");
  assert.match(signals[0]?.description ?? "", /not added to BookSmart accounting revenue/i);
});

test("quote follow-up starts at seven days and remains owner-only", () => {
  const young = record({ object_type: "quotes", status: "awaiting_response", payload: { transitionedAt: "2026-08-06T12:00:00.000Z" } });
  const stale = record({ external_id: "quote-2", object_type: "quotes", status: "awaiting_response", payload: { transitionedAt: "2026-07-25T12:00:00.000Z" } });
  const signals = evaluateJobberOperationalRecords([young, stale], now);
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.signalKey, "jobber:quote-follow-up:quote-2");
  assert.equal(signals[0]?.requiresCpaReview, false);
});

test("archived, paid, converted, and zero-balance records produce no signals", () => {
  const signals = evaluateJobberOperationalRecords([
    record({ is_archived: true, status: "requires_invoicing", payload: { uninvoicedTotal: 500 } }),
    record({ object_type: "invoices", status: "paid", payload: { amounts: { invoiceBalance: 500 } } }),
    record({ object_type: "invoices", status: "awaiting_payment", payload: { amounts: { invoiceBalance: 0 } } }),
    record({ object_type: "quotes", status: "converted", payload: { transitionedAt: "2026-07-01T00:00:00.000Z" } }),
  ], now);
  assert.deepEqual(signals, []);
});

test("upcoming workload reports seven-day and thirty-day visit counts without creating accounting value", () => {
  const signals = evaluateJobberOperationalPlanning([
    record({ external_id: "visit-1", object_type: "scheduled_items", status: "scheduled", starts_at: "2026-08-13T12:00:00.000Z" }),
    record({ external_id: "visit-2", object_type: "scheduled_items", status: "scheduled", starts_at: "2026-08-25T12:00:00.000Z" }),
    record({ external_id: "visit-old", object_type: "scheduled_items", status: "completed", starts_at: "2026-08-12T12:00:00.000Z" }),
  ], now);
  const workload = signals.find(signal => signal.signalKey === "jobber:upcoming-workload");
  assert.equal(workload?.currentValue, 1);
  assert.equal(workload?.comparisonValue, 2);
  assert.equal(workload?.severity, "info");
  assert.equal(workload?.requiresCpaReview, false);
  assert.deepEqual(workload?.sourceIds, ["visit-1", "visit-2"]);
  assert.match(workload?.description ?? "", /not recognized revenue/i);
});

test("unscheduled jobs create one deterministic owner signal with traceable sources", () => {
  const signals = evaluateJobberOperationalPlanning([
    record({ external_id: "job-a", status: "unscheduled" }),
    record({ external_id: "job-b", status: "unscheduled" }),
    record({ external_id: "job-c", status: "active" }),
  ], now);
  const gap = signals.find(signal => signal.signalKey === "jobber:unscheduled-active-jobs");
  assert.equal(gap?.currentValue, 2);
  assert.equal(gap?.signalType, "bookkeeping");
  assert.deepEqual(gap?.sourceIds, ["job-a", "job-b"]);
});

test("job-volume trends require sixty days and ten jobs of history", () => {
  const recentOnly = Array.from({ length: 12 }, (_, index) => record({ external_id: `recent-${index}`, source_created_at: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z` }));
  assert.equal(evaluateJobberOperationalPlanning(recentOnly, now).some(signal => signal.signalKey === "jobber:job-volume-trend"), false);
  const history = [
    ...Array.from({ length: 8 }, (_, index) => record({ external_id: `current-${index}`, source_created_at: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z` })),
    ...Array.from({ length: 4 }, (_, index) => record({ external_id: `prior-${index}`, source_created_at: `2026-07-${String(index + 5).padStart(2, "0")}T00:00:00.000Z` })),
    record({ external_id: "baseline", source_created_at: "2026-06-01T00:00:00.000Z" }),
  ];
  const trend = evaluateJobberOperationalPlanning(history, now).find(signal => signal.signalKey === "jobber:job-volume-trend");
  assert.equal(trend?.currentValue, 8);
  assert.equal(trend?.comparisonValue, 4);
  assert.equal(trend?.percentage, 100);
  assert.equal(trend?.requiresCpaReview, false);
});

test("resolved planning conditions produce no candidate for lifecycle reconciliation", () => {
  const signals = evaluateJobberOperationalPlanning([
    record({ status: "active" }),
    record({ object_type: "scheduled_items", status: "completed", starts_at: "2026-08-13T00:00:00.000Z" }),
  ], now);
  assert.deepEqual(signals, []);
});
