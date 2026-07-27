import { normalizeBusinessInformation, type BusinessInformationFormData } from "./business-information-schema";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function mergeSection(existing: JsonRecord, key: string, next: JsonRecord) {
  return { ...record(existing[key]), ...next };
}

export function businessAddressForReload(input: {
  coreStreet?: string | null;
  onboardingProfile?: JsonRecord | null;
}) {
  const address = record(record(input.onboardingProfile).address);
  return {
    street: typeof address.street === "string" ? address.street : (input.coreStreet ?? ""),
    suite: typeof address.suite === "string" ? address.suite : "",
  };
}

export function cpaInformationForReload(onboardingProfile?: JsonRecord | null) {
  const onboarding = record(onboardingProfile);
  const canonical = record(onboarding.cpa_profile);
  const legacyTax = record(onboarding.tax);
  const canonicalHasCpa = canonical.has_cpa;
  const canonicalWantsMatch = canonical.wants_cpa_match;
  const canonicalCurrentCpa = canonical.current_cpa;
  const legacyCurrentCpa = legacyTax.current_cpa;
  const currentCpa = typeof canonicalCurrentCpa === "string"
    ? canonicalCurrentCpa
    : typeof legacyCurrentCpa === "string" ? legacyCurrentCpa : "";
  const currentCpaCompany = typeof canonical.current_cpa_company === "string" ? canonical.current_cpa_company : "";
  const currentCpaPhone = typeof canonical.current_cpa_phone === "string" ? canonical.current_cpa_phone : "";

  return {
    hasCpa: typeof canonicalHasCpa === "boolean"
      ? (canonicalHasCpa ? "yes" : "no")
      : currentCpa.trim() ? "yes" : "",
    wantsCpaMatch: typeof canonicalWantsMatch === "boolean"
      ? (canonicalWantsMatch ? "yes" : "no")
      : "",
    currentCpa,
    currentCpaCompany,
    currentCpaPhone,
  };
}

const DEPRECATED_OPERATIONS_KEYS = new Set([
  "operations", "employee_type", "financial_snapshot", "goals", "funding", "operations_notes",
]);

export function buildBusinessInformationPayload(input: {
  form: BusinessInformationFormData;
  stateName: string | null;
  existingDebts?: JsonRecord | null;
  ownerId?: number;
  completedFromProfile?: boolean;
  onboardingExtras?: JsonRecord;
}) {
  const value = normalizeBusinessInformation(input.form);
  const existingDebts = record(input.existingDebts);
  const existingOnboarding = record(existingDebts.onboarding_profile);
  const existingBanking = record(existingOnboarding.banking);
  const existingCpaProfile = record(existingOnboarding.cpa_profile);
  const existingTax = record(existingOnboarding.tax);
  const extras = input.onboardingExtras ?? {};
  const retainedExtras = Object.fromEntries(
    Object.entries(extras).filter(([key]) => !DEPRECATED_OPERATIONS_KEYS.has(key)),
  );
  const hasCanonicalCpaData = ["has_cpa", "wants_cpa_match", "current_cpa"]
    .some((key) => Object.hasOwn(existingCpaProfile, key));
  const legacyCurrentCpa = typeof existingTax.current_cpa === "string"
    ? existingTax.current_cpa.trim()
    : "";
  const unchangedLegacyCpaFallback = !hasCanonicalCpaData
    && legacyCurrentCpa.length > 0
    && value.hasCpa === "yes"
    && value.currentCpa === legacyCurrentCpa
    && !value.wantsCpaMatch;

  // Phase 4 write boundary: deprecated Operations fields are intentionally
  // absent below. Spreading existingOnboarding preserves historical values,
  // while new UI interactions do not create or overwrite them. Phase 5 removes
  // the transitional controls themselves.
  const onboardingProfile = {
    ...existingOnboarding,
    ...retainedExtras,
    business_description: value.description || null,
    naics_code: value.naics || null,
    year_established: value.yearEstablished === null ? null : String(value.yearEstablished),
    date_business_started: value.startDate || null,
    address: mergeSection(existingOnboarding, "address", {
      street: value.street || null, suite: value.suite || null, city: value.city || null,
      state: input.stateName, zip: value.zip || null, country: value.country || null,
    }),
    ownership: mergeSection(existingOnboarding, "ownership", {
      owner_name: value.ownerName || null, owner_title: value.ownerTitle || null,
      ownership_percent: value.ownershipPercent, additional_owners_notes: value.additionalOwners || null,
    }),
    tax: mergeSection(existingOnboarding, "tax", {
      state_of_incorporation: value.stateIncorporation || null,
      ...(value.stateRegistrationNumber ? { state_registration_number: value.stateRegistrationNumber } : {}),
    }),
    banking: mergeSection(existingOnboarding, "banking", {
      connect_bank_now: existingBanking.connect_bank_now === null ? null : value.connectBankNow === "yes",
      primary_bank: value.primaryBank || null,
      bank_account_count: value.bankAccountCount || null,
      business_credit_cards: existingBanking.business_credit_cards === null ? null : value.businessCreditCards === "yes",
      loans: existingBanking.loans === null ? null : value.loans === "yes",
      line_of_credit: existingBanking.line_of_credit === null ? null : value.lineOfCredit === "yes",
    }),
    ...((value.hasCpa === "yes" || value.hasCpa === "no") && !unchangedLegacyCpaFallback ? {
      cpa_profile: {
        ...existingCpaProfile,
        has_cpa: value.hasCpa === "yes",
        ...(value.hasCpa === "yes"
          ? {
              current_cpa: value.currentCpa || null,
              current_cpa_company: value.currentCpaCompany || null,
              current_cpa_phone: value.currentCpaPhone || null,
            }
          : value.wantsCpaMatch === "yes" || value.wantsCpaMatch === "no"
            ? { wants_cpa_match: value.wantsCpaMatch === "yes" }
            : {}),
      },
    } : {}),
    business_profile_completed: true,
    ...(input.completedFromProfile ? { completed_from_profile: true } : {}),
    completed_at: new Date().toISOString(),
  };

  return {
    ...(input.ownerId === undefined ? {} : { owner_id: input.ownerId }),
    name: value.legalName, org_type: value.entityType, industry: value.industry,
    ein_tin: value.einTin, state: Number(value.state),
    street: [value.street, value.suite].filter(Boolean).join(", "),
    city: value.city, zip: value.zip, phone: value.businessPhone || null,
    email: value.businessEmail || null, website: value.website,
    primary_state: input.stateName, industry_niche: value.industry,
    debts: {
      ...existingDebts,
      onboarding_profile: onboardingProfile,
      business_profile_completed: true,
    },
  };
}
