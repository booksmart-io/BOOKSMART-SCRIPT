import { verifiedCashBalance, type BalanceSnapshot } from "./verified-cash-balance";

export function verifiedContractorCashPosition(input: { snapshots: BalanceSnapshot[]; hasHealthyPlaidConnection: boolean; now?: Date }) {
  const verified = verifiedCashBalance(input);
  if (!verified.available) return { current: null, available: null, confidence: "unavailable" as const, latestBalanceAt: verified.latestBalanceAt, accountCount: verified.accountCount };
  const latestByAccount = new Map<string, BalanceSnapshot>();
  for (const row of input.snapshots) {
    if (String(row.account_type ?? "").toLowerCase() !== "depository" || String(row.currency ?? "USD").toUpperCase() !== "USD") continue;
    const existing = latestByAccount.get(row.external_account_id);
    if (!existing || new Date(row.balance_timestamp) > new Date(existing.balance_timestamp)) latestByAccount.set(row.external_account_id, row);
  }
  const rows = [...latestByAccount.values()];
  const currentValues = rows.map(row => Number(row.current_balance)).filter(Number.isFinite);
  return { current: currentValues.length === rows.length ? currentValues.reduce((sum, value) => sum + value, 0) : null,
    available: verified.cashAvailable ?? null, confidence: "high" as const, latestBalanceAt: verified.latestBalanceAt, accountCount: verified.accountCount };
}
