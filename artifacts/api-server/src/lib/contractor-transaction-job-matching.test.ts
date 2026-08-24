import assert from "node:assert/strict";
import test from "node:test";
import { isMatchableContractorExpense, transactionToFinancialRecord } from "./contractor-transaction-job-matching";
import { matchContractorFinancialRecord } from "./contractor-job-matcher";

test("approved expense notes can suggest a Jobber job without a receipt", () => {
  const transaction = { id: 91, org_id: 7, title: "Home Depot materials", description: "Johnson Remodel - Job #1001 - PO 1001", receipt_number: "1001", amount: -500, pending: false };
  assert.equal(isMatchableContractorExpense(transaction, 7), true);
  const match = matchContractorFinancialRecord(transactionToFinancialRecord(transaction), [
    { id: "job-1", jobNumber: "1001", title: "Johnson Remodel", amount: 15_000 },
  ]);
  assert.equal(match.matchedJobId, "job-1");
  assert.equal(match.confidence, "high");
  assert.ok(match.matchReasons.includes("invoice_reference_to_job_number"));
  assert.ok(match.matchReasons.includes("memo_contains_job_number"));
});

test("pending, income, and cross-organization transactions are never scanned", () => {
  assert.equal(isMatchableContractorExpense({ id: 1, org_id: 7, amount: -10, pending: true }, 7), false);
  assert.equal(isMatchableContractorExpense({ id: 1, org_id: 7, amount: 10, pending: false }, 7), false);
  assert.equal(isMatchableContractorExpense({ id: 1, org_id: 8, amount: -10, pending: false }, 7), false);
});

test("transaction provider provenance is retained", () => {
  assert.equal(transactionToFinancialRecord({ id: 1, org_id: 7, amount: -10, plaid_transaction_id: "p1" }).source, "plaid");
  assert.equal(transactionToFinancialRecord({ id: 2, org_id: 7, amount: -10, quickbooks_external_id: "q1" }).source, "quickbooks");
  assert.equal(transactionToFinancialRecord({ id: 3, org_id: 7, amount: -10 }).source, "booksmart");
});
