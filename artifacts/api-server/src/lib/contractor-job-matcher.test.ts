import assert from "node:assert/strict";
import test from "node:test";
import { matchContractorFinancialRecord } from "./contractor-job-matcher";

const jobs = [
  { id: "job-1", jobNumber: "1042", title: "Johnson Remodel", customerName: "Alex Johnson", amount: 1_842.17 },
  { id: "job-2", jobNumber: "2048", title: "Smith Roof", customerName: "Jamie Smith", amount: 18_000 },
];

test("exact Jobber IDs are confirmed without user confirmation", () => {
  const result = matchContractorFinancialRecord({ source: "receipt", sourceId: "receipt-1", explicitJobId: "job-1" }, jobs);
  assert.equal(result.matchedJobId, "job-1");
  assert.equal(result.confidence, "confirmed");
  assert.equal(result.requiresConfirmation, false);
});

test("receipt PO to Jobber number is a high-confidence suggestion", () => {
  const result = matchContractorFinancialRecord({ source: "receipt", sourceId: "receipt-2", poNumber: "PO-1042" }, jobs);
  assert.equal(result.matchedJobId, "job-1");
  assert.equal(result.confidence, "high");
  assert.equal(result.requiresConfirmation, false);
});

test("weak customer-only matches require confirmation", () => {
  const result = matchContractorFinancialRecord({ source: "plaid", sourceId: "tx-1", customerName: "Alex Johnson" }, jobs);
  assert.equal(result.confidence, "low");
  assert.equal(result.requiresConfirmation, true);
});

test("equal candidates remain unmatched instead of being silently assigned", () => {
  const result = matchContractorFinancialRecord({ source: "plaid", sourceId: "tx-2", amount: 500 }, [
    { id: "a", amount: 500 }, { id: "b", amount: 500 },
  ]);
  assert.equal(result.matchedJobId, null);
  assert.equal(result.confidence, "unmatched");
});
