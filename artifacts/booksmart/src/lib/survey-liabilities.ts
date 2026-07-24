export const LIABILITY_BALANCE_KEYS = [
  "credit_cards",
  "sba_loans",
  "vehicle_loans",
  "equipment_loans",
  "taxes_owed",
  "payroll_liabilities",
  "other",
] as const;

export function liabilityBalanceEntries(debts: Record<string, unknown>) {
  const allowed = new Set<string>(LIABILITY_BALANCE_KEYS);
  return Object.entries(debts).reduce<Array<[string, number]>>((entries, [key, value]) => {
    if (allowed.has(key) && typeof value === "number" && value > 0) entries.push([key, value]);
    return entries;
  }, []);
}
