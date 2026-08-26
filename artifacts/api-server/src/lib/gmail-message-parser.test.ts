import assert from "node:assert/strict";
import test from "node:test";
import { decodeGmailBase64Url, htmlToReceiptText, parseGmailPayload } from "./gmail-message-parser";

const encoded = (value: string) => Buffer.from(value).toString("base64url");

test("parses nested plain and HTML Gmail receipt bodies without markup", () => {
  const result = parseGmailPayload({ mimeType: "multipart/alternative", parts: [
    { mimeType: "text/plain", body: { data: encoded("Home Depot receipt $187.42") } },
    { mimeType: "text/html", body: { data: encoded("<html><head><style>.x{}</style></head><p>Home Depot<br>$187.42</p></html>") } },
  ] });
  assert.equal(result.plainText, "Home Depot receipt $187.42");
  assert.match(result.htmlText ?? "", /Home Depot\n\$187\.42/);
  assert.doesNotMatch(result.htmlText ?? "", /<|\.x/);
});

test("returns only supported receipt attachments and never downloads them", () => {
  const result = parseGmailPayload({ parts: [
    { mimeType: "application/pdf", filename: "receipt.pdf", body: { attachmentId: "att-1", size: 1200 } },
    { mimeType: "application/zip", filename: "archive.zip", body: { attachmentId: "att-2", size: 500 } },
    { mimeType: "image/jpeg", filename: "receipt.jpg", body: { attachmentId: "att-3" } },
  ] });
  assert.deepEqual(result.attachments.map(item => item.attachmentId), ["att-1", "att-3"]);
});

test("HTML cleanup removes active and hidden header content", () => {
  assert.equal(htmlToReceiptText("<script>steal()</script><p>Total &amp; tax</p>"), "Total & tax");
});

test("decodes Gmail base64url bodies with optional standard padding", () => {
  assert.equal(decodeGmailBase64Url("cmVjZWlwdA=="), "receipt");
  assert.throws(() => decodeGmailBase64Url("cmVj=ZWlwdA=="), /Invalid Gmail body encoding/);
});
