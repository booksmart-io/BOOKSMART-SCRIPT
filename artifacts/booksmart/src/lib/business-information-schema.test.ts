import assert from "node:assert/strict";
import test from "node:test";
import { buildBusinessInformationPayload, businessAddressForReload, cpaInformationForReload } from "./business-information-payload";
import {
  normalizeBusinessInformation,
  cpaQuestionVisibility,
  validateBusinessInformation,
  type BusinessInformationFormData,
} from "./business-information-schema";

function validForm(overrides: Partial<BusinessInformationFormData> = {}): BusinessInformationFormData {
  return {
    legalName: " Acme LLC ", entityType: "Single Member LLC", industry: "Consulting",
    naics: "541611", description: "", status: "", yearEstablished: "2020",
    startDate: "2020-05-20", employees: "2", contractors: "1",
    website: "acme.example", businessEmail: "owner+books@acme.example", businessPhone: "",
    street: "1 Main St", suite: "", city: "Austin", state: "44", zip: "78701",
    country: "United States", mailingSame: true, locationType: "", ownerName: "",
    ownerTitle: "Owner", ownershipPercent: "100", additionalOwners: "", einTin: "12-3456789",
    federalTaxClass: "Single Member LLC", stateIncorporation: "Texas",
    stateRegistrationNumber: "", businessLicenseNumber: "", salesTaxPermit: "no",
    salesTaxNumber: "", payrollTaxNumber: "", taxYear: "Calendar", fiscalYearEnd: "",
    taxPreparer: "", currentCpa: "", currentCpaCompany: "", currentCpaPhone: "", connectBankNow: "later", primaryBank: "",
    bankAccountCount: "", businessCreditCards: "no", loans: "no", lineOfCredit: "no",
    paymentPlatforms: [], accountingSoftware: "", payrollProvider: "", operations: [],
    employeeType: "", annualRevenue: "", monthlyRevenue: "", monthlyExpenses: "",
    profitability: "", goals: [], applyingFunding: "maybe", fundingPurposes: [],
    desiredFundingAmount: "", fundingTimeline: "", operationsNotes: "", hasCpa: "",
    wantsCpaMatch: "", wantsBookkeeper: "no", certifyAccurate: true,
    authorizeAnalysis: true, acceptTerms: true, acceptPrivacy: true,
    ...overrides,
  };
}

test("the shared contract accepts a valid initial or additional business without hidden legal validation", () => {
  assert.deepEqual(validateBusinessInformation(validForm({
    certifyAccurate: false,
    authorizeAnalysis: false,
    acceptTerms: false,
    acceptPrivacy: false,
  })), {});
});

test("CPA conditional questions are mutually exclusive", () => {
  assert.deepEqual(cpaQuestionVisibility("yes"), { showCurrentCpa: true, showCpaMatch: false });
  assert.deepEqual(cpaQuestionVisibility("no"), { showCurrentCpa: false, showCpaMatch: true });
  assert.deepEqual(cpaQuestionVisibility(""), { showCurrentCpa: false, showCpaMatch: false });
});

test("required fields and malformed contact values use shared validation", () => {
  const errors = validateBusinessInformation(validForm({
    legalName: "", entityType: "", industry: "", state: "", einTin: "",
    federalTaxClass: "", businessEmail: "bad@", website: "javascript:alert(1)",
  }));
  assert.ok(errors.legalName);
  assert.ok(errors.entityType);
  assert.ok(errors.industry);
  assert.ok(errors.state);
  assert.ok(errors.einTin);
  assert.ok(errors.businessEmail);
  assert.ok(errors.website);
});

test("year, date, ownership, ZIP, and EIN/TIN are bounded", () => {
  assert.ok(validateBusinessInformation(validForm({ yearEstablished: "1799" })).yearEstablished);
  assert.ok(validateBusinessInformation(validForm({ yearEstablished: "20" })).yearEstablished);
  assert.ok(validateBusinessInformation(validForm({ yearEstablished: "2099" })).yearEstablished);
  assert.ok(validateBusinessInformation(validForm({ yearEstablished: "2030", startDate: "2030-01-01" }), { currentDate: new Date("2026-07-25") }).startDate);
  assert.equal(validateBusinessInformation(validForm({ employees: "-1", contractors: "1.5" })).employees, undefined);
  assert.ok(validateBusinessInformation(validForm({ ownershipPercent: "-1" })).ownershipPercent);
  assert.ok(validateBusinessInformation(validForm({ ownershipPercent: "101" })).ownershipPercent);
  assert.equal(validateBusinessInformation(validForm({ zip: "12345" })).zip, undefined);
  assert.equal(validateBusinessInformation(validForm({ zip: "12345-6789" })).zip, undefined);
  assert.ok(validateBusinessInformation(validForm({ zip: "12-345" })).zip);
  for (const einTin of ["12-3456789", "123 45 6789", "123456789"]) {
    assert.equal(validateBusinessInformation(validForm({ einTin })).einTin, undefined);
  }
  assert.ok(validateBusinessInformation(validForm({ einTin: "ABC-123-45" })).einTin);
  assert.ok(validateBusinessInformation(validForm({ startDate: "2020-02-31" })).startDate);
});

test("normalization trims email and safely adds HTTPS to bare domains", () => {
  const normalized = normalizeBusinessInformation(validForm({
    businessEmail: " owner+tag@acme.example ",
    website: "acme.example/path",
  }));
  assert.equal(normalized.businessEmail, "owner+tag@acme.example");
  assert.equal(normalized.website, "https://acme.example/path");
});

test("payload building preserves unrelated debts and nested historical onboarding keys", () => {
  const payload = buildBusinessInformationPayload({
    form: validForm(),
    stateName: "Texas",
    existingDebts: {
      credit_cards: 2000,
      custom_balance: { keep: true },
      onboarding_profile: {
        legacy_key: "keep",
        tax: { filings: ["Federal"], legacy_tax_key: true },
        banking: { legacy_banking_key: true },
        legal: {
          certified_accurate: true,
          authorized_analysis: true,
          accepted_terms: true,
          accepted_privacy: true,
          historical_version: "legacy",
        },
      },
    },
  });
  const debts = payload.debts as Record<string, unknown>;
  const onboarding = debts.onboarding_profile as Record<string, unknown>;
  const tax = onboarding.tax as Record<string, unknown>;
  assert.equal(debts.credit_cards, 2000);
  assert.deepEqual(debts.custom_balance, { keep: true });
  assert.equal(onboarding.legacy_key, "keep");
  assert.deepEqual(onboarding.legal, {
    certified_accurate: true,
    authorized_analysis: true,
    accepted_terms: true,
    accepted_privacy: true,
    historical_version: "legacy",
  });
  assert.deepEqual(tax.filings, ["Federal"]);
  assert.equal(tax.legacy_tax_key, true);
  assert.equal(Object.hasOwn(onboarding, "cpa_profile"), false);
});

test("new business payload does not create organization-level legal consent", () => {
  const payload = buildBusinessInformationPayload({
    form: validForm(),
    stateName: "Texas",
  });
  const onboarding = (payload.debts as Record<string, unknown>).onboarding_profile as Record<string, unknown>;
  assert.equal(Object.hasOwn(onboarding, "legal"), false);
});

test("a new business can persist an existing CPA in canonical cpa_profile", () => {
  const payload = buildBusinessInformationPayload({
    form: validForm({ hasCpa: "yes", currentCpa: "Jordan Smith, CPA" }),
    stateName: "Texas",
  });
  const onboarding = (payload.debts as Record<string, unknown>).onboarding_profile as Record<string, any>;
  assert.deepEqual(onboarding.cpa_profile, {
    has_cpa: true,
    current_cpa: "Jordan Smith, CPA",
    current_cpa_company: null,
    current_cpa_phone: null,
  });
  assert.equal(Object.hasOwn(onboarding.tax, "current_cpa"), false);
});

test("a new business without a CPA can request CPA matching", () => {
  const payload = buildBusinessInformationPayload({
    form: validForm({ hasCpa: "no", wantsCpaMatch: "yes" }),
    stateName: "Texas",
  });
  const onboarding = (payload.debts as Record<string, unknown>).onboarding_profile as Record<string, any>;
  assert.deepEqual(onboarding.cpa_profile, {
    has_cpa: false,
    wants_cpa_match: true,
  });
});

test("canonical CPA data hydrates, and legacy current CPA is a read-only fallback", () => {
  assert.deepEqual(cpaInformationForReload({
    cpa_profile: { has_cpa: false, wants_cpa_match: true, current_cpa: "Preserved custom value" },
    tax: { current_cpa: "Legacy CPA" },
  }), {
    hasCpa: "no",
    wantsCpaMatch: "yes",
    currentCpa: "Preserved custom value",
    currentCpaCompany: "",
    currentCpaPhone: "",
  });
  assert.deepEqual(cpaInformationForReload({ tax: { current_cpa: "Legacy CPA" } }), {
    hasCpa: "yes",
    wantsCpaMatch: "",
    currentCpa: "Legacy CPA",
    currentCpaCompany: "",
    currentCpaPhone: "",
  });

  const payload = buildBusinessInformationPayload({
    form: validForm({ legalName: "Renamed LLC", hasCpa: "yes", currentCpa: "Legacy CPA" }),
    stateName: "Texas",
    existingDebts: { onboarding_profile: { tax: { current_cpa: "Legacy CPA", filings: ["Federal"] } } },
  });
  const onboarding = (payload.debts as Record<string, unknown>).onboarding_profile as Record<string, any>;
  assert.equal(Object.hasOwn(onboarding, "cpa_profile"), false);
  assert.equal(onboarding.tax.current_cpa, "Legacy CPA");
  assert.deepEqual(onboarding.tax.filings, ["Federal"]);
});

test("editing CPA information preserves unrelated and unknown onboarding data", () => {
  const payload = buildBusinessInformationPayload({
    form: validForm({ hasCpa: "no", wantsCpaMatch: "no" }),
    stateName: "Texas",
    existingDebts: {
      survey_v2: { untouched: true },
      onboarding_profile: {
        custom: { keep: true },
        operations: ["Historical"],
        legal: { accepted_terms: true },
        cpa_profile: { has_cpa: true, current_cpa: "Old CPA", custom_cpa_key: "keep" },
      },
    },
  });
  const debts = payload.debts as Record<string, any>;
  assert.deepEqual(debts.survey_v2, { untouched: true });
  assert.deepEqual(debts.onboarding_profile.custom, { keep: true });
  assert.deepEqual(debts.onboarding_profile.operations, ["Historical"]);
  assert.deepEqual(debts.onboarding_profile.legal, { accepted_terms: true });
  assert.deepEqual(debts.onboarding_profile.cpa_profile, {
    has_cpa: false,
    current_cpa: "Old CPA",
    custom_cpa_key: "keep",
    wants_cpa_match: false,
  });
});

test("new organization payload does not introduce deprecated Operations keys", () => {
  const payload = buildBusinessInformationPayload({
    form: validForm({
      operations: ["Sell Products", "Have Employees", "Issue 1099s"],
      employeeType: "W-2 Employee",
      annualRevenue: "$100K to $250K",
      monthlyRevenue: "12000",
      monthlyExpenses: "8000",
      profitability: "Profitable",
      goals: ["Cash Flow"],
      applyingFunding: "yes",
      fundingPurposes: ["Equipment"],
      desiredFundingAmount: "50000",
      fundingTimeline: "3-6 months",
      operationsNotes: "Legacy note",
      accountingSoftware: "QuickBooks",
      payrollProvider: "Gusto",
      paymentPlatforms: ["Stripe"],
    }),
    stateName: "Texas",
  });
  const onboarding = (payload.debts as Record<string, unknown>).onboarding_profile as Record<string, unknown>;
  for (const key of ["operations", "employee_type", "financial_snapshot", "goals", "funding", "operations_notes"]) {
    assert.equal(Object.hasOwn(onboarding, key), false, `${key} should not be introduced`);
  }
  const banking = onboarding.banking as Record<string, unknown>;
  for (const key of ["accounting_software", "payroll_provider", "payment_platforms"]) {
    assert.equal(Object.hasOwn(banking, key), false, `banking.${key} should not be introduced`);
  }
  assert.equal(Object.hasOwn(onboarding.tax as Record<string, unknown>, "filings"), false);
  for (const key of ["business_status", "employee_count", "independent_contractor_count"]) {
    assert.equal(Object.hasOwn(onboarding, key), false, `${key} should not be introduced`);
  }
  const address = onboarding.address as Record<string, unknown>;
  assert.equal(Object.hasOwn(address, "location_type"), false);
  assert.equal(Object.hasOwn(address, "mailing_same_as_business"), false);
  const tax = onboarding.tax as Record<string, unknown>;
  for (const key of [
    "federal_tax_classification", "state_registration_number", "business_license_number",
    "sales_tax_permit", "sales_tax_number", "payroll_tax_number", "tax_year",
    "fiscal_year_end", "tax_preparer", "current_cpa",
  ]) {
    assert.equal(Object.hasOwn(tax, key), false, `tax.${key} should not be introduced`);
  }
  assert.equal(Object.hasOwn(onboarding, "cpa_profile"), false);
});

test("existing deprecated Operations values survive retained-field edits exactly", () => {
  const legacyValues = {
    business_status: "Startup",
    employee_count: "5",
    independent_contractor_count: "2",
    operations: ["Sell Services", "Have Employees", "Issue 1099s"],
    employee_type: "1099",
    financial_snapshot: {
      approximate_annual_revenue: "$50K to $100K",
      average_monthly_revenue: 7000,
      average_monthly_expenses: 4000,
      profitability: "Profitable",
      custom_snapshot_key: "keep",
    },
    goals: ["Cash Flow", "Tax Savings"],
    funding: {
      plans_to_apply: "maybe",
      purposes: ["Equipment"],
      desired_amount: 25000,
      timeline: "6 months",
      custom_funding_key: "keep",
    },
    operations_notes: "Historical notes",
    address: { location_type: "Home Office", mailing_same_as_business: false },
    banking: {
      accounting_software: "Wave",
      payroll_provider: "ADP",
      payment_platforms: ["Stripe", "Square"],
      custom_banking_key: "keep",
    },
    tax: {
      filings: ["Federal", "1099"],
      federal_tax_classification: "S Corporation",
      state_registration_number: "REG-123",
      payroll_tax_number: "PAY-123",
      tax_year: "Fiscal",
      fiscal_year_end: "2026-06-30",
      current_cpa: "Legacy CPA",
    },
    cpa_profile: { has_cpa: true, wants_cpa_match: false, wants_bookkeeper: true },
  };
  const payload = buildBusinessInformationPayload({
    form: validForm({
      legalName: "Updated Name LLC",
      operations: ["Sell Products"],
      goals: ["Budgeting"],
      accountingSoftware: "Xero",
    }),
    stateName: "Texas",
    existingDebts: { onboarding_profile: legacyValues, credit_cards: 300 },
  });
  const debts = payload.debts as Record<string, unknown>;
  const onboarding = debts.onboarding_profile as Record<string, unknown>;
  assert.equal(payload.name, "Updated Name LLC");
  assert.equal(debts.credit_cards, 300);
  for (const key of ["operations", "employee_type", "financial_snapshot", "goals", "funding", "operations_notes"]) {
    assert.deepEqual(onboarding[key], legacyValues[key as keyof typeof legacyValues]);
  }
  const banking = onboarding.banking as Record<string, unknown>;
  assert.equal(banking.accounting_software, "Wave");
  assert.equal(banking.payroll_provider, "ADP");
  assert.deepEqual(banking.payment_platforms, ["Stripe", "Square"]);
  assert.equal(banking.custom_banking_key, "keep");
  assert.deepEqual((onboarding.tax as Record<string, unknown>).filings, ["Federal", "1099"]);
  assert.equal(onboarding.business_status, "Startup");
  assert.equal(onboarding.employee_count, "5");
  assert.equal(onboarding.independent_contractor_count, "2");
  assert.deepEqual(onboarding.cpa_profile, legacyValues.cpa_profile);
  assert.equal((onboarding.address as Record<string, unknown>).location_type, "Home Office");
  assert.equal((onboarding.tax as Record<string, unknown>).federal_tax_classification, "S Corporation");
  assert.equal((onboarding.tax as Record<string, unknown>).state_registration_number, "REG-123");
});

test("document-extracted registration metadata remains storable without a visible required field", () => {
  const payload = buildBusinessInformationPayload({
    form: validForm({ stateRegistrationNumber: "DOC-2026-123" }),
    stateName: "Texas",
  });
  const onboarding = (payload.debts as Record<string, unknown>).onboarding_profile as Record<string, unknown>;
  assert.equal((onboarding.tax as Record<string, unknown>).state_registration_number, "DOC-2026-123");
});

test("street and suite survive save, reload, and save without duplication", () => {
  const first = buildBusinessInformationPayload({
    form: validForm({ street: "1 Main St", suite: "Suite 200" }),
    stateName: "Texas",
  });
  const firstDebts = first.debts as Record<string, unknown>;
  const onboarding = firstDebts.onboarding_profile as Record<string, unknown>;
  const reloaded = businessAddressForReload({
    coreStreet: first.street as string,
    onboardingProfile: onboarding,
  });
  assert.deepEqual(reloaded, { street: "1 Main St", suite: "Suite 200" });

  const second = buildBusinessInformationPayload({
    form: validForm(reloaded),
    stateName: "Texas",
    existingDebts: firstDebts,
  });
  assert.equal(second.street, "1 Main St, Suite 200");
  const secondAddress = ((second.debts as Record<string, unknown>).onboarding_profile as Record<string, any>).address;
  assert.equal(secondAddress.street, "1 Main St");
  assert.equal(secondAddress.suite, "Suite 200");
});

test("unrelated edits preserve nullable hidden banking values", () => {
  const payload = buildBusinessInformationPayload({
    form: validForm(),
    stateName: "Texas",
    existingDebts: {
      onboarding_profile: {
        banking: {
          connect_bank_now: null,
          business_credit_cards: null,
          loans: null,
          line_of_credit: null,
        },
      },
    },
  });
  const banking = ((payload.debts as Record<string, unknown>).onboarding_profile as Record<string, any>).banking;
  assert.equal(banking.connect_bank_now, null);
  assert.equal(banking.business_credit_cards, null);
  assert.equal(banking.loans, null);
  assert.equal(banking.line_of_credit, null);
});
