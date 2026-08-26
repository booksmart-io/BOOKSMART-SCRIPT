import assert from "node:assert/strict";
import test from "node:test";
import { buildJobberExpenseDraft, jobberExpenseWriteEnabled, parseJobberExpenseCreate } from "./jobber-expense-write";

test("write access requires both locks", () => {
  assert.equal(jobberExpenseWriteEnabled(63, {}), false);
  assert.equal(jobberExpenseWriteEnabled(63, { JOBBER_EXPENSE_WRITE_ENABLED: "true" }), false);
  assert.equal(jobberExpenseWriteEnabled(63, { JOBBER_EXPENSE_WRITE_ENABLED: "true", JOBBER_EXPENSE_WRITE_ORGANIZATION_IDS: "12,63" }), true);
  assert.equal(jobberExpenseWriteEnabled(64, { JOBBER_EXPENSE_WRITE_ENABLED: "true", JOBBER_EXPENSE_WRITE_ORGANIZATION_IDS: "12,63" }), false);
});

test("draft normalizes an expense", () => {
  assert.deepEqual(buildJobberExpenseDraft({ assignmentId: 9, transactionTitle: "  Materials  ", transactionDate: "2026-08-09T17:00:00Z", amount: -78.5, jobberJobId: "job-1", jobLabel: "1002 Touchstone" }), { title: "Materials", description: "Confirmed in BookSmart for 1002 Touchstone. Assignment 9.", date: "2026-08-09T17:00:00.000Z", total: 78.5, linkedJobId: "job-1" });
});

test("provider errors and missing IDs are rejected", () => {
  assert.throws(() => parseJobberExpenseCreate({ expenseCreate: { expense: null, userErrors: [{ message: "Not allowed" }] } }), /Not allowed/);
  assert.throws(() => parseJobberExpenseCreate({ expenseCreate: { expense: {}, userErrors: [] } }), /did not return/);
  assert.equal(parseJobberExpenseCreate({ expenseCreate: { expense: { id: "expense-1" }, userErrors: [] } }).id, "expense-1");
});
