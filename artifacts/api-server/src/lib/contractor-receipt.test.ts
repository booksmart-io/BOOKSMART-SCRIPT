import assert from "node:assert/strict";
import test from "node:test";
import { normalizeContractorReceipt, receiptToFinancialRecord } from "./contractor-receipt";

test("normalizes explicit contractor receipt fields without inventing missing values", () => {
  const receipt = normalizeContractorReceipt({ vendor: " Home Depot ", date: "08/20/26", total: 1842.17, paymentLastFour: "12345", poNumber: "PO-1042", lineItems: [] });
  assert.equal(receipt.vendor, "Home Depot");
  assert.equal(receipt.date, null);
  assert.equal(receipt.paymentLastFour, null);
  assert.equal(receipt.total, 1842.17);
});

test("maps receipt references into matcher input without accounting classification", () => {
  const receipt = normalizeContractorReceipt({ vendor: "Lowe's", total: 500, jobNumber: "2048", customerOrProject: "Smith Roof", lineItems: [] });
  const record = receiptToFinancialRecord("doc-9", receipt);
  assert.equal(record.source, "receipt");
  assert.equal(record.poNumber, "2048");
  assert.equal(record.amount, 500);
  assert.equal((record as any).transaction_type, undefined);
});
