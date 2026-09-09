import assert from "node:assert/strict";
import test from "node:test";
import { createGmailOAuthState, decryptGmailToken, encryptGmailToken, GMAIL_READONLY_SCOPE, verifyGmailOAuthState } from "./gmail-oauth";

test("Gmail OAuth state is signed, expiring, and organization scoped", () => {
  process.env.GMAIL_STATE_SECRET = "gmail-state-test-secret";
  const state = createGmailOAuthState("auth-user", 42);
  assert.equal(verifyGmailOAuthState(state).organizationId, 42);
  assert.throws(() => verifyGmailOAuthState(`${state}x`));
  assert.throws(() => verifyGmailOAuthState(createGmailOAuthState("auth-user", 42, -1)), /expired/);
  assert.throws(() => verifyGmailOAuthState(""), /Invalid OAuth state/);
  assert.throws(() => verifyGmailOAuthState(createGmailOAuthState("auth-user", 0)), /payload/);
});
test("Gmail tokens use authenticated encryption and scope remains read only", () => {
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "gmail-token-test-secret";
  const encrypted = encryptGmailToken("refresh-token");
  assert.equal(encrypted.includes("refresh-token"), false);
  assert.equal(decryptGmailToken(encrypted), "refresh-token");
  assert.throws(() => decryptGmailToken(`${encrypted}x`));
  assert.equal(GMAIL_READONLY_SCOPE, "https://www.googleapis.com/auth/gmail.readonly");
});
