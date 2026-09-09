import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createJobberOAuthState,
  createJobberPkce,
  decryptJobberSecret,
  encryptJobberSecret,
  hashJobberOAuthState,
  verifyJobberOAuthState,
} from "./jobber-oauth";

process.env.JOBBER_STATE_SECRET = "test-jobber-state-secret";
process.env.JOBBER_TOKEN_ENCRYPTION_KEY = "test-jobber-token-key";

test("Jobber OAuth state is signed, scoped, and rejects tampering", () => {
  const state = createJobberOAuthState("user-123", 42);
  assert.deepEqual(
    { ...verifyJobberOAuthState(state), nonce: "ignored", expiresAt: 0 },
    { userId: "user-123", organizationId: 42, nonce: "ignored", expiresAt: 0 },
  );
  assert.throws(() => verifyJobberOAuthState(`${state.slice(0, -1)}x`), /state signature/);
  assert.equal(hashJobberOAuthState(state).length, 64);
});

test("Jobber OAuth state rejects expired and cross-shape payloads", () => {
  const expired = createJobberOAuthState("user-123", 42, -1);
  assert.throws(() => verifyJobberOAuthState(expired), /expired/);
  assert.throws(() => verifyJobberOAuthState(createJobberOAuthState("user-123", 0)), /payload/);
});

test("Jobber PKCE uses an S256-compatible verifier and challenge", () => {
  const { verifier, challenge } = createJobberPkce();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
});

test("Jobber secrets are authenticated and encrypted", () => {
  const encrypted = encryptJobberSecret("sensitive-token");
  assert.notEqual(encrypted, "sensitive-token");
  assert.equal(encrypted.includes("sensitive-token"), false);
  assert.equal(decryptJobberSecret(encrypted), "sensitive-token");
  const tamperAt = Math.floor(encrypted.length / 2);
  const replacement = encrypted[tamperAt] === "x" ? "y" : "x";
  const tampered = `${encrypted.slice(0, tamperAt)}${replacement}${encrypted.slice(tamperAt + 1)}`;
  assert.throws(() => decryptJobberSecret(tampered));
});
