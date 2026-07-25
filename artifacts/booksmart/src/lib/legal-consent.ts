export const LEGAL_CONSENT_VERSION = "2026-07-25";
export const LEGAL_CONSENT_REQUIRED_MESSAGE =
  "You must agree to the Terms of Service and Privacy Policy to continue.";

export function createLegalConsentMetadata(now = new Date()) {
  return {
    legal_consent_accepted: true as const,
    legal_consent_accepted_at: now.toISOString(),
    legal_consent_version: LEGAL_CONSENT_VERSION,
  };
}

export function hasLegalConsent(metadata: Record<string, unknown> | null | undefined) {
  return metadata?.legal_consent_accepted === true
    && typeof metadata.legal_consent_accepted_at === "string"
    && metadata.legal_consent_accepted_at.length > 0;
}
