export type BalanceSnapshot = { external_account_id: string; account_type: string | null; current_balance: number | string | null; available_balance: number | string | null; currency: string | null; balance_timestamp: string };

export function verifiedCashBalance(input: { snapshots: BalanceSnapshot[]; hasHealthyPlaidConnection: boolean; now?: Date; maxAgeHours?: number }) {
  const now = input.now ?? new Date(); const maxAgeMs = (input.maxAgeHours ?? 24) * 3_600_000;
  const latest = new Map<string, BalanceSnapshot>();
  for (const snapshot of input.snapshots) {
    if (String(snapshot.account_type ?? "").toLowerCase() !== "depository" || String(snapshot.currency ?? "USD").toUpperCase() !== "USD") continue;
    const timestamp = new Date(snapshot.balance_timestamp).getTime(); if (!Number.isFinite(timestamp) || timestamp > now.getTime()) continue;
    const existing = latest.get(snapshot.external_account_id);
    if (!existing || timestamp > new Date(existing.balance_timestamp).getTime()) latest.set(snapshot.external_account_id, snapshot);
  }
  const snapshots = [...latest.values()];
  const latestAt = snapshots.map(row => new Date(row.balance_timestamp).getTime()).sort((a, b) => b - a)[0] ?? null;
  const fresh = latestAt !== null && snapshots.every(row => now.getTime() - new Date(row.balance_timestamp).getTime() <= maxAgeMs);
  const balances = snapshots.map(row => Number(row.available_balance ?? row.current_balance)).filter(Number.isFinite);
  const available = input.hasHealthyPlaidConnection && fresh && balances.length === snapshots.length && snapshots.length > 0;
  return { available, cashAvailable: available ? balances.reduce((sum, value) => sum + value, 0) : undefined, balanceFresh: available, accountCount: snapshots.length, latestBalanceAt: latestAt === null ? null : new Date(latestAt).toISOString() };
}
