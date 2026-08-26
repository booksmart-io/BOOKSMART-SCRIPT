import assert from "node:assert/strict";
import test from "node:test";
import { scanGmailCandidates, type GmailApiMessage } from "./gmail-scan";

const encoded = (value: string) => Buffer.from(value).toString("base64url");
test("targeted Gmail scan deduplicates queries, ignores unrelated mail, and continues after one failure", async () => {
  const messages: Record<string, GmailApiMessage> = {
    receipt: { id: "receipt", threadId: "t1", internalDate: String(Date.parse("2026-08-25T12:00:00Z")), snippet: "Payment confirmation", payload: { mimeType: "multipart/mixed", headers: [{ name: "From", value: "orders@homedepot.com" }, { name: "Subject", value: "Your receipt" }], parts: [{ mimeType: "text/html", body: { data: encoded("<p>Total $187.42</p>") } }, { mimeType: "application/pdf", filename: "receipt.pdf", body: { attachmentId: "a1" } }] } },
    personal: { id: "personal", payload: { headers: [{ name: "Subject", value: "Lunch Friday" }] } },
  };
  const result = await scanGmailCandidates({
    listMessageIds: async () => ["receipt", "receipt", "personal", "broken"],
    getMessage: async id => { if (id === "broken") throw new Error("malformed message"); return messages[id]; },
  }, { queries: ["receipt", "invoice"], limit: 10 });
  assert.equal(result.reviewed, 3);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].attachments[0].attachmentId, "a1");
  assert.equal(result.ignored, 1);
  assert.deepEqual(result.failures, [{ messageId: "broken", error: "malformed message" }]);
  assert.equal(result.accountingEffect, "none");
});

test("scan limit bounds mailbox inspection", async () => {
  let fetched = 0;
  const result = await scanGmailCandidates({ listMessageIds: async () => ["1", "2", "3"], getMessage: async id => { fetched += 1; return { id, payload: { headers: [{ name: "Subject", value: "Receipt" }] } }; } }, { queries: ["receipt"], limit: 2 });
  assert.equal(result.reviewed, 2); assert.equal(fetched, 2);
});
