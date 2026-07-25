import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveBusinessProfileSources,
  resolvedFactsForPrompt,
  type ResolvedBusinessFact,
} from "./business-profile-source-resolver";

function byId(facts: ResolvedBusinessFact[], id: string) {
  return facts.find((fact) => fact.id === id)!;
}

function legacy(overrides: Record<string, unknown> = {}) {
  return {
    debts: {
      onboarding_profile: {
        operations: ["Sell Services", "Have Employees"],
        goals: ["Cash Flow"],
        business_status: "Startup",
        year_established: "2020",
        employee_type: "1099",
        ownership: { ownership_percent: 75 },
        banking: { accounting_software: "Wave", payroll_provider: "Gusto", payment_platforms: ["Stripe"] },
        funding: { plans_to_apply: "maybe", purposes: ["Equipment"] },
        financial_snapshot: {
          approximate_annual_revenue: "$100K to $250K",
          average_monthly_expenses: 5000,
          profitability: "Profitable",
        },
        ...overrides,
      },
    },
  };
}

test("business activity resolves survey, legacy, precedence, and unknown branches", () => {
  assert.equal(byId(resolveBusinessProfileSources({ organization: { business_activity_model: "Products" } }), "PROFILE-ACTIVITY").source, "survey");
  assert.equal(byId(resolveBusinessProfileSources({ organization: legacy() }), "PROFILE-ACTIVITY").value, "Services");
  const both = byId(resolveBusinessProfileSources({ organization: { ...legacy(), business_activity_model: "Products" } }), "PROFILE-ACTIVITY");
  assert.equal(both.value, "Products");
  assert.equal(both.source, "survey");
  assert.equal(byId(resolveBusinessProfileSources({}), "PROFILE-ACTIVITY").source, "unknown");
});

test("workforce normalizes current and compatibility strings without inferring 1099 reporting", () => {
  const facts = resolveBusinessProfileSources({ organization: {
    ...legacy(),
    team_structure: ["W2 Employees", "Hire 1099 Contractors", "Employ Children (under 18)"],
    issues_1099s: "Not sure",
  } });
  assert.deepEqual(byId(facts, "PROFILE-WORKFORCE").value, ["W-2 Employees", "1099 Contractors", "Employ Children"]);
  assert.equal(byId(facts, "PROFILE-1099").value, "Not sure");
  assert.equal(byId(facts, "PROFILE-1099").source, "survey");

  for (const answer of ["Yes", "No", "Not sure"]) {
    assert.equal(byId(resolveBusinessProfileSources({ organization: { issues_1099s: answer } }), "PROFILE-1099").value, answer);
  }
});

test("accounting software uses survey then legacy and payroll remains compatibility-only", () => {
  const survey = resolveBusinessProfileSources({ organization: { ...legacy(), accounting_software: "QuickBooks" } });
  assert.equal(byId(survey, "PROFILE-ACCOUNTING-SOFTWARE").value, "QuickBooks");
  assert.equal(byId(survey, "PROFILE-ACCOUNTING-SOFTWARE").source, "survey");
  const fallback = resolveBusinessProfileSources({ organization: legacy() });
  assert.equal(byId(fallback, "PROFILE-ACCOUNTING-SOFTWARE").value, "Wave");
  assert.equal(byId(fallback, "PROFILE-PAYROLL-PROVIDER").value, "Gusto");
  assert.equal(byId(resolveBusinessProfileSources({}), "PROFILE-ACCOUNTING-SOFTWARE").source, "unknown");
});

test("business goals prefer survey while tax goal remains an independent fact", () => {
  const facts = resolveBusinessProfileSources({ organization: {
    ...legacy(),
    business_goals: ["Build a budget"],
    tax_goal: "Audit Protection",
  } });
  assert.deepEqual(byId(facts, "PROFILE-BUSINESS-GOALS").value, ["Build a budget"]);
  assert.equal(byId(facts, "PROFILE-TAX-GOAL").value, "Audit Protection");
});

test("funding normalizes legacy vocabulary and survey wins independently", () => {
  const legacyFacts = resolveBusinessProfileSources({ organization: legacy() });
  assert.equal(byId(legacyFacts, "PROFILE-FUNDING-INTEREST").value, "Maybe / exploring options");
  assert.deepEqual(byId(legacyFacts, "PROFILE-FUNDING-PURPOSES").value, ["Equipment"]);

  const surveyFacts = resolveBusinessProfileSources({ organization: {
    ...legacy(), funding_interest: "No", funding_purposes: ["Working capital"],
  } });
  assert.equal(byId(surveyFacts, "PROFILE-FUNDING-INTEREST").value, "No");
  assert.equal(byId(surveyFacts, "PROFILE-FUNDING-PURPOSES").source, "unknown");
  assert.equal(byId(resolveBusinessProfileSources({}), "PROFILE-FUNDING-INTEREST").source, "unknown");
});

test("statement actuals win over transactions and legacy estimates", () => {
  const facts = resolveBusinessProfileSources({
    organization: legacy(),
    transactions: [{ amount: 10, date_time: "2026-01-01" }],
    statementActuals: { revenue: 90000, expenses: 55000, netIncome: 35000, periodLabel: "2025" },
  });
  assert.equal(byId(facts, "FIN-1").value, 90000);
  assert.equal(byId(facts, "FIN-2").value, 55000);
  assert.equal(byId(facts, "FIN-3").value, 35000);
  assert.equal(byId(facts, "FIN-1").source, "actual_financial");
});

test("transactions beat legacy estimates without blindly annualizing a month", () => {
  const facts = resolveBusinessProfileSources({
    organization: legacy(),
    transactions: [
      { amount: 1000, date_time: "2026-07-01" },
      { amount: -400, date_time: "2026-07-20" },
    ],
  });
  assert.equal(byId(facts, "FIN-1").value, 1000);
  assert.equal(byId(facts, "FIN-2").value, 400);
  assert.equal(byId(facts, "FIN-3").value, 600);
  assert.equal(facts.some((fact) => fact.id === "FIN-4"), false);
});

test("legacy financial values are last-resort fallbacks and unknowns are omitted", () => {
  const legacyFacts = resolveBusinessProfileSources({ organization: legacy() });
  assert.equal(byId(legacyFacts, "FIN-1").source, "legacy_onboarding");
  assert.equal(byId(legacyFacts, "FIN-3").value, "Profitable");
  const empty = resolveBusinessProfileSources({});
  assert.equal(byId(empty, "FIN-1").source, "unknown");
  assert.equal(resolvedFactsForPrompt(empty).some((entry) => entry.id === "FIN-1"), false);
});

test("formation and ownership retain current/legacy compatibility", () => {
  const current = resolveBusinessProfileSources({ organization: {
    ...legacy(), formation_date: "2021-06-10", ownership_percent: 60,
  } });
  assert.equal(byId(current, "PROFILE-FORMATION").value, "2021-06-10");
  assert.equal(byId(current, "PROFILE-OWNERSHIP").value, 60);
  const fallback = resolveBusinessProfileSources({ organization: legacy() });
  assert.equal(byId(fallback, "PROFILE-FORMATION").value, "2020");
  assert.equal(byId(fallback, "PROFILE-OWNERSHIP").value, 75);
  assert.equal(byId(resolveBusinessProfileSources({}), "PROFILE-FORMATION").source, "unknown");
});

test("resolved prompt facts contain no duplicate IDs or legacy/survey conflicts", () => {
  const entries = resolvedFactsForPrompt(resolveBusinessProfileSources({
    organization: {
      ...legacy(),
      business_activity_model: "Products",
      accounting_software: "Xero",
      business_goals: ["Improve cash flow"],
    },
  }));
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  assert.equal(entries.filter((entry) => entry.id === "PROFILE-ACTIVITY").length, 1);
  assert.equal(entries.find((entry) => entry.id === "PROFILE-ACTIVITY")?.fact.includes("Products"), true);
  assert.equal(entries.some((entry) => entry.fact.includes("Sell Services")), false);
  assert.equal(entries.some((entry) => entry.fact.includes("Stripe")), false);
});
