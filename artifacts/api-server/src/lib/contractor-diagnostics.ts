export function contractorDiagnosticQuality(input: { connected: string[]; stale: string[]; approvedTransactions: number; jobs: number }) {
  const missing = [!input.connected.includes("plaid") && "plaid", !input.connected.includes("quickbooks") && "quickbooks", !input.connected.includes("jobber") && "jobber"].filter(Boolean) as string[];
  const confidence = input.approvedTransactions > 0 && input.jobs > 0 && input.connected.includes("jobber")
    && (input.connected.includes("plaid") || input.connected.includes("quickbooks")) ? "high"
    : input.approvedTransactions > 0 || input.jobs > 0 ? "medium" : "low";
  return { confidence: input.stale.length ? (confidence === "high" ? "medium" : confidence) : confidence, missingSources: missing, staleProviders: input.stale };
}
