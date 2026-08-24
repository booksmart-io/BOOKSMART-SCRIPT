import type { ContractorFinancialRecord, ContractorJobCandidate } from "./contractor-job-matcher";
import { transactionProvider } from "./contractor-cost-confirmation";

export type MatchableContractorTransaction = {
  id: number; org_id: number; title?: string | null; description?: string | null;
  receipt_number?: string | null; amount: number; pending?: boolean | null;
  quickbooks_external_id?: string | null; plaid_transaction_id?: string | null;
};

export function isMatchableContractorExpense(transaction: MatchableContractorTransaction, organizationId: number) {
  return transaction.org_id === organizationId && transaction.pending !== true
    && Number.isFinite(Number(transaction.amount)) && Number(transaction.amount) < 0;
}

export function transactionToFinancialRecord(transaction: MatchableContractorTransaction): ContractorFinancialRecord {
  return {
    source: transactionProvider(transaction), sourceId: String(transaction.id),
    invoiceNumber: transaction.receipt_number ?? null,
    memo: [transaction.title, transaction.description, transaction.receipt_number].filter(Boolean).join(" · "),
    amount: Math.abs(Number(transaction.amount)),
  };
}

export function jobberRecordToCandidate(row: {
  external_id: string; record_number?: string | null; title?: string | null;
  amount?: number | string | null; payload?: Record<string, unknown> | null;
}): ContractorJobCandidate {
  const payload = row.payload ?? {};
  const client = payload.client && typeof payload.client === "object" ? payload.client as Record<string, unknown> : {};
  const property = payload.property && typeof payload.property === "object" ? payload.property as Record<string, unknown> : {};
  const address = property.address && typeof property.address === "object" ? property.address as Record<string, unknown> : {};
  const formattedAddress = [address.street, address.city, address.province, address.postalCode].filter(Boolean).join(", ");
  return {
    id: row.external_id, jobNumber: row.record_number ?? null, title: row.title ?? null,
    customerName: typeof client.name === "string" ? client.name : null,
    customerEmail: typeof client.email === "string" ? client.email : null,
    customerPhone: typeof client.phone === "string" ? client.phone : null,
    address: formattedAddress || null,
    amount: row.amount == null || !Number.isFinite(Number(row.amount)) ? null : Number(row.amount),
  };
}
