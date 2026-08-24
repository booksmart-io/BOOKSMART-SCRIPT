export type HomeCompleteness = {
  approvedTransactionCount: number;
  confirmedStatementCount?: number;
};

export function hasCanonicalFinancialHistory(current: HomeCompleteness, previous: HomeCompleteness) {
  return current.approvedTransactionCount > 0 || previous.approvedTransactionCount > 0
    || (current.confirmedStatementCount ?? 0) > 0 || (previous.confirmedStatementCount ?? 0) > 0;
}

const inputLabels: Record<string, string> = {
  fresh_verified_cash_balance: "connect a supported bank with a fresh verified cash balance",
  known_obligations: "add upcoming obligations",
  payroll_requirement: "add payroll amount and schedule",
  tax_reserve_requirement: "configure your tax reserve",
  operating_buffer: "set an operating cash buffer",
  tax_strategy: "add a filing schedule or tax strategy",
  effective_tax_rate: "enter an effective tax rate",
  projected_taxable_income: "enter projected taxable income",
  amount_set_aside: "enter the tax amount already reserved",
  opening_cash: "connect a supported bank with a fresh verified cash balance",
  payroll_schedule: "add payroll amount and schedule",
  forecast_items: "add upcoming obligations or receivables",
};

export function planningSetupMessage(missingInputs?: string[]) {
  if (!missingInputs?.length) return "Complete your planning setup";
  const labels = [...new Set(missingInputs.map(input => inputLabels[input] ?? input.replaceAll("_", " ")))];
  if (labels.length === 1) return `Next: ${labels[0]}`;
  return `Next: ${labels.slice(0, 2).join(" and ")}`;
}

export function forecastShortfallDate(forecast?: { shortfall?: number; lowestBalanceDate?: string; shortfallDate?: string | null }) {
  if (!forecast?.shortfall) return null;
  return forecast.lowestBalanceDate ?? forecast.shortfallDate ?? null;
}
