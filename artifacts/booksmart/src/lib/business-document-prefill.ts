import type { ExtractedBusinessDocument } from "@/components/business-document-upload";

export type BusinessState = { id: number; name: string; code: string };

export type BusinessDocumentPrefill = {
  businessName?: string;
  orgType?: string;
  stateId?: string;
  stateIncorporation?: string;
  yearEstablished?: string;
  startDate?: string;
  street?: string;
  suite?: string;
  city?: string;
  zip?: string;
  country?: string;
  stateRegistrationNumber?: string;
};

export function preserveEnteredBusinessDocumentFields(
  current: BusinessDocumentPrefill,
  extracted: BusinessDocumentPrefill,
) {
  const result = { ...current };
  for (const [key, value] of Object.entries(extracted) as Array<
    [keyof BusinessDocumentPrefill, string | undefined]
  >) {
    if (!result[key]?.trim() && value?.trim()) result[key] = value;
  }
  return result;
}

export function safelyMapEntityType(value: string | null) {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
  const aliases: Array<[string[], string]> = [
    [["single member limited liability company", "single-member limited liability company", "single member llc", "single-member llc"], "Single Member LLC"],
    [["c corporation", "c-corporation"], "C Corporation"],
    [["s corporation", "s-corporation"], "S Corporation"],
    [["nonprofit corporation", "non-profit corporation"], "Nonprofit"],
    [["limited partnership", "lp"], "Partnership"],
    [["general partnership", "partnership"], "Partnership"],
    [["sole proprietorship"], "Sole Proprietorship"],
  ];
  return aliases.find(([names]) => names.includes(normalized))?.[1] ?? null;
}

function matchState(value: string | null, states: BusinessState[]) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return states.find((state) =>
    state.name.toLowerCase() === normalized || state.code.toLowerCase() === normalized
  ) ?? null;
}

export function buildBusinessDocumentPrefill(
  extracted: ExtractedBusinessDocument,
  states: BusinessState[],
): BusinessDocumentPrefill {
  const prefill: BusinessDocumentPrefill = {};
  if (extracted.businessName) prefill.businessName = extracted.businessName;

  const entityType = safelyMapEntityType(extracted.entityType);
  if (entityType) prefill.orgType = entityType;

  const formationState = matchState(extracted.formationState, states);
  if (formationState) {
    prefill.stateIncorporation = formationState.name;
    prefill.stateId = String(formationState.id);
  }

  if (extracted.formationDate && /^\d{4}-\d{2}-\d{2}$/.test(extracted.formationDate)) {
    prefill.yearEstablished = extracted.formationDate.slice(0, 4);
    prefill.startDate = extracted.formationDate;
  }

  const address = extracted.principalAddress;
  if (address) {
    if (address.street) prefill.street = address.street;
    if (address.suite) prefill.suite = address.suite;
    if (address.city) prefill.city = address.city;
    if (address.postalCode) prefill.zip = address.postalCode;
    if (address.country) prefill.country = address.country;
    const addressState = matchState(address.state, states);
    if (addressState) prefill.stateId = String(addressState.id);
  }

  if (extracted.registrationNumber) {
    prefill.stateRegistrationNumber = extracted.registrationNumber;
  }
  return prefill;
}
