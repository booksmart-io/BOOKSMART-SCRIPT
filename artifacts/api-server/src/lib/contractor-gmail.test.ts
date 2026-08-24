import test from "node:test";
import assert from "node:assert/strict";
import { classifyGmailFinancialMetadata, normalizeGmailMessageMetadata } from "./contractor-gmail";

test("classifies targeted receipt metadata without creating accounting effect", () => {
  const result = classifyGmailFinancialMetadata({ messageId: "msg-1", sender: "orders@homedepot.com", subject: "Receipt for PO 48291", attachmentNames: ["receipt.pdf"] });
  assert.equal(result.relevant, true);
  assert.equal(result.documentType, "receipt");
  assert.equal(result.confidence, "high");
  assert.deepEqual(result.extractedReferenceNumbers, ["48291"]);
  assert.equal(result.accountingEffect, "none");
});

test("tax correspondence is classified for review but not treated as accounting truth", () => {
  const result = classifyGmailFinancialMetadata({ messageId: "msg-2", subject: "IRS tax notice", snippet: "A notice is available." });
  assert.equal(result.documentType, "tax_notice");
  assert.equal(result.accountingEffect, "none");
});

test("unrelated mail remains irrelevant and metadata is bounded", () => {
  const result = classifyGmailFinancialMetadata({ messageId: "msg-3", subject: "Team lunch Friday" });
  assert.equal(result.relevant, false);
  assert.equal(result.requiresContentFetch, false);
  assert.throws(() => normalizeGmailMessageMetadata({ messageId: "", messageDate: "not-a-date" }));
});
