import assert from "node:assert/strict";
import test from "node:test";
import { createGmailScanClient, GmailConnectionError, refreshGmailAccessToken } from "./gmail-client";

test("refreshes Gmail access without exposing refresh credentials in the URL", async () => {
  let seenUrl = ""; let seenBody = "";
  const fetchImpl: typeof fetch = async (url, init) => { seenUrl = String(url); seenBody = String(init?.body); return new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }), { status: 200 }); };
  const result = await refreshGmailAccessToken("refresh-secret", { clientId: "client", clientSecret: "secret", fetchImpl });
  assert.equal(result.accessToken, "new-access");
  assert.doesNotMatch(seenUrl, /refresh-secret/);
  assert.match(seenBody, /refresh_token=refresh-secret/);
});

test("expired Gmail grant requires reconnection", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
  await assert.rejects(() => refreshGmailAccessToken("expired", { clientId: "client", clientSecret: "secret", fetchImpl }), (error: unknown) => error instanceof GmailConnectionError && error.code === "reauthorization_required");
});

test("Gmail API client performs bounded search, message, and attachment reads", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async url => { urls.push(String(url)); const value = String(url); if (value.includes("/attachments/")) return new Response(JSON.stringify({ data: "cGRm" })); if (value.includes("?format=full")) return new Response(JSON.stringify({ id: "m1" })); return new Response(JSON.stringify({ messages: [{ id: "m1" }] })); };
  const client = createGmailScanClient("access", fetchImpl);
  assert.deepEqual(await client.listMessageIds("receipt", 500), ["m1"]);
  assert.equal((await client.getMessage("m1")).id, "m1");
  assert.equal(await client.getAttachment("m1", "a1"), "cGRm");
  assert.match(urls[0], /maxResults=100/);
});
