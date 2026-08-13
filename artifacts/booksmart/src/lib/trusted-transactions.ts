export type CanonicalTransactionSource = "transactions";

export function trustedTransactions<T extends { id: number; amount: number; date_time: string }>(source: CanonicalTransactionSource, rows: T[]): T[] {
  if (source !== "transactions") return [];
  return rows.filter(row => Number.isSafeInteger(Number(row.id)) && Number(row.id) > 0 && Number.isFinite(Number(row.amount)) &&
    typeof row.date_time === "string" && Number.isFinite(new Date(row.date_time).getTime()));
}
