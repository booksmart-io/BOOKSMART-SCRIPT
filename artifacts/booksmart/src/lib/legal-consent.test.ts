import assert from "node:assert/strict";
import test from "node:test";
import {
  createLegalConsentMetadata,
  hasLegalConsent,
  LEGAL_CONSENT_VERSION,
} from "./legal-consent.ts";

test("legal consent is explicit and records timestamp and version", () => {
  const metadata = createLegalConsentMetadata(new Date("2026-07-25T12:00:00.000Z"));
  assert.deepEqual(metadata, {
    legal_consent_accepted: true,
    legal_consent_accepted_at: "2026-07-25T12:00:00.000Z",
    legal_consent_version: LEGAL_CONSENT_VERSION,
  });
  assert.equal(hasLegalConsent(metadata), true);
});

test("unchecked, incomplete, and legacy metadata do not imply account consent", () => {
  assert.equal(hasLegalConsent(undefined), false);
  assert.equal(hasLegalConsent({ legal_consent_accepted: false }), false);
  assert.equal(hasLegalConsent({ legal_consent_accepted: true }), false);
});
