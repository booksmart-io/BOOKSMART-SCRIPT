
import { isValidUsPhone } from "@/lib/phone-validation";

export type BusinessInformationFormData = {
  legalName: string;
  entityType: string;
  industry: string;
  naics: string;
  description: string;
  status: string;
  yearEstablished: string;
  startDate: string;
  employees: string;
  contractors: string;
  website: string;
  businessEmail: string;
  businessPhone: string;
  street: string;
  suite: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  mailingSame: boolean;
  locationType: string;
  ownerName: string;
  ownerTitle: string;
  ownershipPercent: string;
  additionalOwners: string;
  einTin: string;
  federalTaxClass: string;
  stateIncorporation: string;
  stateRegistrationNumber: string;
  businessLicenseNumber: string;
  salesTaxPermit: string;
  salesTaxNumber: string;
  payrollTaxNumber: string;
  taxYear: string;
  fiscalYearEnd: string;
  taxPreparer: string;
  currentCpa: string;
  currentCpaCompany: string;
  currentCpaPhone: string;
  connectBankNow: string;
  primaryBank: string;
  bankAccountCount: string;
  businessCreditCards: string;
  loans: string;
  lineOfCredit: string;
  paymentPlatforms: string[];
  accountingSoftware: string;
  payrollProvider: string;
  operations: string[];
  employeeType: string;
  annualRevenue: string;
  monthlyRevenue: string;
  monthlyExpenses: string;
  profitability: string;
  goals: string[];
  applyingFunding: string;
  fundingPurposes: string[];
  desiredFundingAmount: string;
  fundingTimeline: string;
  operationsNotes: string;
  hasCpa: string;
  wantsCpaMatch: string;
  wantsBookkeeper: string;
  certifyAccurate: boolean;
  authorizeAnalysis: boolean;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
};

export type NormalizedBusinessInformation = Omit<BusinessInformationFormData,
  "yearEstablished" | "employees" | "contractors" | "ownershipPercent" | "website"
> & {
  yearEstablished: number | null;
  employees: number | null;
  contractors: number | null;
  ownershipPercent: number;
  website: string | null;
};

export const REQUIRED_BUSINESS_INFORMATION_FIELDS = [
  "legalName", "entityType", "industry", "state", "einTin",
] as const;

export function cpaQuestionVisibility(hasCpa: string) {
  return {
    showCurrentCpa: hasCpa === "yes",
    showCpaMatch: hasCpa === "no",
  };
}

export type BusinessInformationErrors = Partial<Record<keyof BusinessInformationFormData, string>>;

const trim = (value: string) => value.trim();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usZipPattern = /^\d{5}(?:-\d{4})?$/;
const einTinPattern = /^\d[\d -]{2,24}$/;

function parseNonNegativeInteger(value: string) {
  if (!value.trim()) return null;
  if (!/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function validateBusinessInformation(
  form: BusinessInformationFormData,
  options: { currentDate?: Date } = {},
): BusinessInformationErrors {
  const errors: BusinessInformationErrors = {};
  const currentDate = options.currentDate ?? new Date();
  const currentYear = currentDate.getFullYear();

  if (!trim(form.legalName)) errors.legalName = "Legal business name is required.";
  if (!form.entityType) errors.entityType = "Business entity type is required.";
  if (!form.industry) errors.industry = "Industry is required.";
  if (!form.state) errors.state = "Primary business state is required.";
  if (!trim(form.einTin)) errors.einTin = "EIN / Tax ID is required.";
  else if (!einTinPattern.test(trim(form.einTin))) errors.einTin = "Enter a valid EIN / Tax ID using letters, numbers, spaces, or hyphens.";

  const year = trim(form.yearEstablished);
  if (year && (!/^\d{4}$/.test(year) || Number(year) < 1800 || Number(year) > currentYear)) {
    errors.yearEstablished = `Year established must be a four-digit year from 1800 to ${currentYear}.`;
  }

  const date = trim(form.startDate);
  if (date) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date(NaN);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) errors.startDate = "Date business started must be a real date.";
    else if (parsed.getTime() > currentDate.getTime()) errors.startDate = "Date business started cannot be in the future.";
    else if (year && !errors.yearEstablished && parsed.getFullYear() !== Number(year)) {
      errors.startDate = "Date business started must be in the same year as Year established.";
    }
  }


  if (trim(form.businessEmail) && !emailPattern.test(trim(form.businessEmail))) {
    errors.businessEmail = "Enter a valid business email address.";
  }
  if (trim(form.businessPhone) && !isValidUsPhone(form.businessPhone)) {
    errors.businessPhone = "Enter a valid 10-digit U.S. phone number.";
  }
  if (form.hasCpa === "yes" && trim(form.currentCpaPhone) && !isValidUsPhone(form.currentCpaPhone)) {
    errors.currentCpaPhone = "Enter a valid 10-digit U.S. CPA phone number.";
  }
  if (trim(form.website) && normalizeWebsite(form.website) === null) {
    errors.website = "Enter a valid HTTP or HTTPS website.";
  }
  if ((form.country.trim().toLowerCase() === "united states" || form.country.trim().toLowerCase() === "us" || form.country.trim().toLowerCase() === "usa")
    && trim(form.zip) && !usZipPattern.test(trim(form.zip))) {
    errors.zip = "Enter a valid ZIP code (12345 or 12345-6789).";
  }

  const ownership = Number(trim(form.ownershipPercent));
  if (trim(form.ownershipPercent) && (!Number.isFinite(ownership) || ownership < 0 || ownership > 100)) {
    errors.ownershipPercent = "Ownership percentage must be between 0 and 100.";
  }
  return errors;
}

export function firstBusinessInformationError(errors: BusinessInformationErrors) {
  return Object.values(errors).find(Boolean) ?? null;
}

export function normalizeBusinessInformation(form: BusinessInformationFormData): NormalizedBusinessInformation {
  const normalizedWebsite = normalizeWebsite(form.website);
  const employeeCount = parseNonNegativeInteger(form.employees);
  const contractorCount = parseNonNegativeInteger(form.contractors);
  return {
    ...form,
    legalName: trim(form.legalName),
    naics: trim(form.naics),
    description: trim(form.description),
    yearEstablished: form.yearEstablished.trim() ? Number(form.yearEstablished.trim()) : null,
    startDate: trim(form.startDate),
    employees: employeeCount === undefined ? null : employeeCount,
    contractors: contractorCount === undefined ? null : contractorCount,
    website: normalizedWebsite,
    businessEmail: trim(form.businessEmail),
    businessPhone: trim(form.businessPhone),
    street: trim(form.street),
    suite: trim(form.suite),
    city: trim(form.city),
    zip: trim(form.zip),
    country: trim(form.country),
    ownerName: trim(form.ownerName),
    ownerTitle: trim(form.ownerTitle),
    ownershipPercent: trim(form.ownershipPercent) ? Number(trim(form.ownershipPercent)) : 100,
    additionalOwners: trim(form.additionalOwners),
    einTin: trim(form.einTin),
    stateRegistrationNumber: trim(form.stateRegistrationNumber),
    businessLicenseNumber: trim(form.businessLicenseNumber),
    salesTaxNumber: trim(form.salesTaxNumber),
    payrollTaxNumber: trim(form.payrollTaxNumber),
    currentCpa: trim(form.currentCpa),
    currentCpaCompany: trim(form.currentCpaCompany),
    currentCpaPhone: trim(form.currentCpaPhone),
    primaryBank: trim(form.primaryBank),
    bankAccountCount: trim(form.bankAccountCount),
    fundingTimeline: trim(form.fundingTimeline),
    operationsNotes: trim(form.operationsNotes),
  };
}
