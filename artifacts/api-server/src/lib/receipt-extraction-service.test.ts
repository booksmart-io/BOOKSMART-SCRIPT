import assert from "node:assert/strict";
import test from "node:test";
import { extractReceiptFile, extractReceiptText, ReceiptExtractionUpstreamError } from "./receipt-extraction-service";

const extraction = { vendor: "Home Depot", date: "2026-08-25", subtotal: 180, tax: 7.42, total: 187.42, paymentMethod: "Visa", paymentLastFour: "4832", poNumber: null, jobNumber: null, customerOrProject: null, receiptNumber: "R-1", lineItems: [], warnings: [] };
const okFetch = async (_url: unknown, init?: RequestInit) => {
  const request = JSON.parse(String(init?.body));
  return new Response(JSON.stringify({ output_text: JSON.stringify(extraction), request }), { status: 200, headers: { "Content-Type": "application/json" } });
};

test("shared file extraction preserves the strict receipt contract", async () => {
  let requestBody = "";
  const fetchImpl: typeof fetch = async (_url, init) => { requestBody = String(init?.body); return okFetch(_url, init); };
  const result = await extractReceiptFile({ filename: "receipt.pdf", mimeType: "application/pdf", base64Data: "cGRm" }, { apiKey: "test", fetchImpl });
  assert.equal(result.total, 187.42);
  const payload = JSON.parse(requestBody);
  assert.equal(payload.input[1].content[0].type, "input_file");
  assert.equal(payload.text.format.type, "json_schema");
});

test("email-body extraction uses the same schema and does not invent missing values", async () => {
  const result = await extractReceiptText("Home Depot total $187.42", { apiKey: "test", fetchImpl: okFetch as typeof fetch });
  assert.equal(result.paymentLastFour, "4832");
});

test("upstream failures are distinguishable from configuration errors", async () => {
  const fetchImpl: typeof fetch = async () => new Response("unavailable", { status: 503 });
  await assert.rejects(() => extractReceiptText("receipt", { apiKey: "test", fetchImpl }), ReceiptExtractionUpstreamError);
});
