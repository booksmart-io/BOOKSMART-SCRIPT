export type BusinessFactSource = "actual_financial" | "survey" | "legacy_onboarding" | "unknown";

export type ResolvedBusinessFact = {
  id: string;
  label: string;
  value: string | number | string[] | null;
  source: BusinessFactSource;
};

export type FinancialActuals = {
  revenue: number;
  expenses: number;
  netIncome: number;
  periodLabel?: string;
};

export type ProfileTransaction = {
  amount: number;
  date_time: string;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function list(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item.trim()).map((item) => item.trim())
    : [];
}

function choose(id: string, label: string, primary: unknown, legacy: unknown): ResolvedBusinessFact {
  const primaryList = list(primary);
  if (primaryList.length) return { id, label, value: primaryList, source: "survey" };
  const primaryText = text(primary);
  if (primaryText) return { id, label, value: primaryText, source: "survey" };
  const legacyList = list(legacy);
  if (legacyList.length) return { id, label, value: legacyList, source: "legacy_onboarding" };
  const legacyText = text(legacy);
  if (legacyText) return { id, label, value: legacyText, source: "legacy_onboarding" };
  return { id, label, value: null, source: "unknown" };
}

function normalizeActivity(operations: string[]) {
  const products = operations.includes("Sell Products");
  const services = operations.includes("Sell Services");
  if (products && services) return "Both products and services";
  if (products) return "Products";
  if (services) return "Services";
  return null;
}

function normalizeWorkforce(values: string[]) {
  const aliases: Record<string, string> = {
    "W2 Employees": "W-2 Employees",
    "W-2 Employees": "W-2 Employees",
    "Hire 1099 Contractors": "1099 Contractors",
    "1099 Contractors": "1099 Contractors",
    "Employ Spouse": "Employ Spouse",
    "Employ Children (under 18)": "Employ Children",
    "Employ Children": "Employ Children",
    "Solo Operator": "Solo Operator",
    "No Help": "No Help",
  };
  return [...new Set(values.map((value) => aliases[value] ?? value).filter(Boolean))];
}

function normalizeFundingInterest(value: unknown) {
  const normalized = text(value)?.toLowerCase();
  if (normalized === "yes") return "Yes";
  if (normalized === "no") return "No";
  if (normalized === "maybe" || normalized === "maybe / exploring options") return "Maybe / exploring options";
  return text(value);
}

function legacyFinancial(snapshot: JsonRecord, key: string) {
  const value = snapshot[key];
  return typeof value === "number" && Number.isFinite(value) ? value : text(value);
}

export function resolveBusinessProfileSources(input: {
  organization?: JsonRecord | null;
  transactions?: ProfileTransaction[];
  statementActuals?: FinancialActuals | null;
}): ResolvedBusinessFact[] {
  const org = input.organization ?? {};
  const debts = record(org.debts);
  const onboarding = record(debts.onboarding_profile);
  const banking = record(onboarding.banking);
  const funding = record(onboarding.funding);
  const ownership = record(onboarding.ownership);
  const snapshot = record(onboarding.financial_snapshot);
  const operations = list(onboarding.operations);

  const facts: ResolvedBusinessFact[] = [];
  facts.push(choose("PROFILE-ACTIVITY", "Business activity", org.business_activity_model, normalizeActivity(operations)));

  const surveyWorkforce = normalizeWorkforce(list(org.team_structure));
  const legacyWorkforce = normalizeWorkforce([
    ...(operations.includes("Have Employees") ? ["W-2 Employees"] : []),
    ...(text(onboarding.employee_type) === "1099" ? ["1099 Contractors"] : []),
  ]);
  facts.push(choose("PROFILE-WORKFORCE", "Workforce", surveyWorkforce, legacyWorkforce));
  facts.push(choose(
    "PROFILE-1099",
    "Potential Forms 1099 reporting",
    org.issues_1099s,
    operations.includes("Issue 1099s") ? "Yes" : null,
  ));
  facts.push(choose("PROFILE-ACCOUNTING-SOFTWARE", "Accounting software", org.accounting_software, banking.accounting_software));
  facts.push(choose("PROFILE-PAYROLL-PROVIDER", "Payroll provider", null, banking.payroll_provider));
  facts.push(choose("PROFILE-BUSINESS-GOALS", "Business goals", org.business_goals, onboarding.goals));
  facts.push(choose("PROFILE-TAX-GOAL", "Tax goal", org.tax_goal, null));
  facts.push(choose(
    "PROFILE-FUNDING-INTEREST",
    "Funding interest",
    normalizeFundingInterest(org.funding_interest),
    normalizeFundingInterest(funding.plans_to_apply),
  ));
  const surveyFundingInterest = normalizeFundingInterest(org.funding_interest);
  facts.push(surveyFundingInterest === "No"
    ? { id: "PROFILE-FUNDING-PURPOSES", label: "Funding purposes", value: null, source: "unknown" }
    : choose("PROFILE-FUNDING-PURPOSES", "Funding purposes", org.funding_purposes, funding.purposes));
  facts.push(choose("PROFILE-BUSINESS-STATUS", "Business status", null, onboarding.business_status));

  const currentFormation = text(org.formation_date) ?? text(org.date_business_started) ?? text(org.year_established);
  const legacyFormation = text(onboarding.date_business_started) ?? text(onboarding.year_established);
  facts.push(choose("PROFILE-FORMATION", "Formation date or year", currentFormation, legacyFormation));

  const currentOwnership = typeof org.ownership_percent === "number" ? org.ownership_percent : null;
  const legacyOwnership = typeof ownership.ownership_percent === "number"
    ? ownership.ownership_percent
    : text(ownership.ownership_percent);
  const ownershipValue = currentOwnership ?? legacyOwnership;
  facts.push({
    id: "PROFILE-OWNERSHIP",
    label: "Ownership percentage",
    value: ownershipValue,
    source: currentOwnership !== null ? "survey" : ownershipValue !== null ? "legacy_onboarding" : "unknown",
  });

  const transactions = input.transactions ?? [];
  const transactionRevenue = transactions.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
  const transactionExpenses = Math.abs(transactions.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + tx.amount, 0));
  const hasTransactions = transactions.length > 0;
  const financial = input.statementActuals ?? (hasTransactions ? {
    revenue: transactionRevenue,
    expenses: transactionExpenses,
    netIncome: transactionRevenue - transactionExpenses,
    periodLabel: transactionPeriodLabel(transactions),
  } : null);

  const financialFact = (
    id: string,
    label: string,
    actualKey: keyof Pick<FinancialActuals, "revenue" | "expenses" | "netIncome">,
    legacy: unknown,
  ): ResolvedBusinessFact => {
    if (financial) {
      const period = financial.periodLabel ? ` (${financial.periodLabel})` : "";
      return { id, label: `${label}${period}`, value: financial[actualKey], source: "actual_financial" };
    }
    if (legacy !== null && legacy !== undefined && legacy !== "") {
      return { id, label, value: legacy as string | number, source: "legacy_onboarding" };
    }
    return { id, label, value: null, source: "unknown" };
  };

  facts.push(financialFact("FIN-1", "Revenue", "revenue", legacyFinancial(snapshot, "approximate_annual_revenue")));
  facts.push(financialFact("FIN-2", "Expenses", "expenses", legacyFinancial(snapshot, "average_monthly_expenses")));
  facts.push(financialFact("FIN-3", "Net income / profitability", "netIncome", legacyFinancial(snapshot, "profitability")));
  facts.push({
    id: "FIN-5",
    label: "Total transactions analyzed",
    value: hasTransactions ? transactions.length : null,
    source: hasTransactions ? "actual_financial" : "unknown",
  });
  return facts;
}

function transactionPeriodLabel(transactions: ProfileTransaction[]) {
  const times = transactions
    .map((tx) => new Date(tx.date_time).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!times.length) return "recorded transactions";
  const format = (time: number) => new Date(time).toISOString().slice(0, 10);
  return `${format(times[0])} to ${format(times[times.length - 1])}`;
}

export function resolvedFactsForPrompt(facts: ResolvedBusinessFact[]) {
  return facts.filter((fact) => fact.source !== "unknown" && fact.value !== null).map((fact) => {
    const value = Array.isArray(fact.value) ? fact.value.join(", ") : fact.value;
    const formatted = typeof value === "number" && fact.id.startsWith("FIN-")
      ? `$${value.toFixed(2)}`
      : String(value);
    return { id: fact.id, fact: `${fact.label}: ${formatted}`, source: fact.source };
  });
}
