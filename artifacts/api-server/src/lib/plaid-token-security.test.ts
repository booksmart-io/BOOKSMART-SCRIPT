import assert from "node:assert/strict";
import test from "node:test";
import { decryptPlaidToken, encryptPlaidToken, plaidTokenNeedsEncryption } from "./plaid-token-security";

process.env.PLAID_TOKEN_ENCRYPTION_KEY = "test-only-plaid-encryption-key";

test("Plaid access tokens use authenticated encryption", () => {
  const token = "access-development-secret";
  const encrypted = encryptPlaidToken(token);
  assert.notEqual(encrypted, token);
  assert.equal(plaidTokenNeedsEncryption(encrypted), false);
  assert.equal(decryptPlaidToken(encrypted), token);
  const middle = Math.floor(encrypted.length / 2);
  const replacement = encrypted[middle] === "x" ? "y" : "x";
  assert.throws(() => decryptPlaidToken(`${encrypted.slice(0, middle)}${replacement}${encrypted.slice(middle + 1)}`));
});

test("legacy Plaid tokens remain readable and are marked for upgrade", () => {
  assert.equal(plaidTokenNeedsEncryption("legacy-sandbox-token"), true);
  assert.equal(decryptPlaidToken("legacy-sandbox-token"), "legacy-sandbox-token");
  assert.throws(() => encryptPlaidToken(""));
});
