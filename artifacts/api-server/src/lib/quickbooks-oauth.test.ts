import assert from "node:assert/strict";
import test from "node:test";
import { createOAuthState, decryptToken, encryptToken, hashOAuthState, verifyOAuthState } from "./quickbooks-oauth";
import {
  extractQuickBooksQueryEntities,
  hasAnotherQuickBooksPage,
  normalizeQuickBooksStagedEntity,
  quickBooksPageQuery,
  shouldRefreshQuickBooksToken,
} from "./quickbooks-client";

test("QuickBooks OAuth state is signed, scoped, and rejects tampering", () => {
  process.env.QUICKBOOKS_STATE_SECRET = "test-state-secret";
  const state = createOAuthState("user-123", 42);
  assert.deepEqual(
    { ...verifyOAuthState(state), nonce: "ignored", expiresAt: 0 },
    { userId: "user-123", organizationId: 42, nonce: "ignored", expiresAt: 0 },
  );
  assert.throws(() => verifyOAuthState(`${state.slice(0, -1)}x`), /state signature/);
  assert.equal(hashOAuthState(state).length, 64);
});

test("QuickBooks OAuth state rejects missing, expired, and invalid organization context", () => {
  process.env.QUICKBOOKS_STATE_SECRET = "test-state-secret";
  assert.throws(() => verifyOAuthState(""), /Invalid OAuth state/);
  assert.throws(() => verifyOAuthState(createOAuthState("user-123", 42, -1)), /expired/);
  assert.throws(() => verifyOAuthState(createOAuthState("user-123", 0)), /payload/);
});

test("QuickBooks tokens are authenticated-encrypted", () => {
  process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY = "test-encryption-secret";
  const encrypted = encryptToken("sensitive-token");
  assert.notEqual(encrypted, "sensitive-token");
  assert.equal(encrypted.includes("sensitive-token"), false);
  assert.equal(decryptToken(encrypted), "sensitive-token");
  const replacement = encrypted.endsWith("x") ? "y" : "x";
  assert.throws(() => decryptToken(`${encrypted.slice(0, -1)}${replacement}`));
});

test("QuickBooks access tokens refresh only near expiry", () => {
  const now = Date.parse("2026-08-06T12:00:00Z");
  assert.equal(shouldRefreshQuickBooksToken("2026-08-06T12:10:00Z", now), false);
  assert.equal(shouldRefreshQuickBooksToken("2026-08-06T12:04:59Z", now), true);
  assert.equal(shouldRefreshQuickBooksToken(null, now), true);
});

test("QuickBooks query responses and staged entities normalize without touching transactions", () => {
  const entities = extractQuickBooksQueryEntities({ QueryResponse: { Purchase: [{ Id: "17", TxnDate: "2026-08-01", TotalAmt: 42.5 }] } }, "Purchase");
  assert.equal(entities.length, 1);
  const normalized = normalizeQuickBooksStagedEntity(63, "Purchase", entities[0]);
  assert.match(normalized.staged_at, /^2026-|^20\d{2}-/);
  assert.deepEqual({ ...normalized, staged_at: "ignored" }, {
    organization_id: 63,
    entity_type: "Purchase",
    external_id: "17",
    display_name: null,
    transaction_date: "2026-08-01",
    total_amount: 42.5,
    payload: entities[0],
    source_updated_at: null,
    staged_at: "ignored",
  });
});

test("QuickBooks pagination requests every page at the 1,000-record boundary", () => {
  assert.equal(quickBooksPageQuery("Invoice", 1), "select * from Invoice startposition 1 maxresults 1000");
  assert.equal(quickBooksPageQuery("Invoice", 1001), "select * from Invoice startposition 1001 maxresults 1000");
  assert.equal(hasAnotherQuickBooksPage(1000, 1000), true);
  assert.equal(hasAnotherQuickBooksPage(999, 1000), false);
  assert.throws(() => quickBooksPageQuery("Invoice; delete", 1), /Invalid/);
});
