export type CostConfirmationInput = {
  receiptOrganizationId: number; transactionOrganizationId: number; jobOrganizationId: number;
  transactionAmount: number; transactionPending?: boolean | null;
};

export function validateCostConfirmation(input: CostConfirmationInput, expectedOrganizationId: number) {
  if ([input.receiptOrganizationId, input.transactionOrganizationId, input.jobOrganizationId].some(id => id !== expectedOrganizationId))
    return { ok: false as const, reason: "organization_mismatch" as const };
  if (input.transactionPending === true) return { ok: false as const, reason: "pending_transaction" as const };
  if (!Number.isFinite(input.transactionAmount) || input.transactionAmount >= 0)
    return { ok: false as const, reason: "not_an_expense" as const };
  return { ok: true as const, amount: Math.abs(input.transactionAmount) };
}

export function transactionProvider(transaction: { quickbooks_external_id?: string | null; plaid_transaction_id?: string | null }) {
  return transaction.quickbooks_external_id ? "quickbooks" as const : transaction.plaid_transaction_id ? "plaid" as const : "booksmart" as const;
}
