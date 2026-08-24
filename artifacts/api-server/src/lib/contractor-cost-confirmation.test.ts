import assert from "node:assert/strict";
import test from "node:test";
import { transactionProvider, validateCostConfirmation } from "./contractor-cost-confirmation";

test("confirmed cost uses the absolute amount of an existing expense", () => {
  const result = validateCostConfirmation({ receiptOrganizationId: 4, transactionOrganizationId: 4, jobOrganizationId: 4, transactionAmount: -1842.17, transactionPending: false }, 4);
  assert.deepEqual(result, { ok: true, amount: 1842.17 });
});

test("pending, income, and cross-organization records cannot become job costs", () => {
  assert.equal(validateCostConfirmation({ receiptOrganizationId: 4, transactionOrganizationId: 4, jobOrganizationId: 4, transactionAmount: -10, transactionPending: true }, 4).ok, false);
  assert.equal(validateCostConfirmation({ receiptOrganizationId: 4, transactionOrganizationId: 4, jobOrganizationId: 4, transactionAmount: 10 }, 4).ok, false);
  assert.equal(validateCostConfirmation({ receiptOrganizationId: 4, transactionOrganizationId: 5, jobOrganizationId: 4, transactionAmount: -10 }, 4).ok, false);
});

test("canonical transaction provenance is preserved", () => {
  assert.equal(transactionProvider({ quickbooks_external_id: "q-1", plaid_transaction_id: "p-1" }), "quickbooks");
  assert.equal(transactionProvider({ plaid_transaction_id: "p-1" }), "plaid");
  assert.equal(transactionProvider({}), "booksmart");
});
