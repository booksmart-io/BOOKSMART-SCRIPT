export const ECONOMIC_EVENT_RECONCILIATION_VERSION = "economic-event-reconciliation-v1" as const;

export type EconomicEventSource = "quickbooks" | "plaid" | "gmail" | "manual_statement";
export type EconomicEventKind = "customer_payment" | "expense" | "refund";

export type EconomicEventEvidence = {
  id: string;
  source: EconomicEventSource;
  kind: EconomicEventKind;
  amount: number;
  date: string;
  counterparty?: string | null;
  /** A provider reference, invoice number, or externally established match key. */
  correlationKey?: string | null;
  /** Refund/credit records should identify the payment or its correlation key. */
  reverses?: string | null;
  evidenceOnly?: boolean;
};

export type EconomicEventConflict = {
  type: "amount_mismatch";
  evidenceIds: string[];
  observedAmounts: number[];
};

export type ReconciledEconomicEvent = {
  id: string;
  kind: EconomicEventKind;
  amount: number;
  netAmount: number;
  evidence: EconomicEventEvidence[];
  conflicts: EconomicEventConflict[];
  refundIds: string[];
  confidence: "high" | "needs_review";
  calculationVersion: typeof ECONOMIC_EVENT_RECONCILIATION_VERSION;
};

const normalized = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const cents = (value: number) => Math.round(Math.abs(value) * 100);
const sourcePriority: Record<EconomicEventSource, number> = { quickbooks: 4, plaid: 3, manual_statement: 2, gmail: 1 };

function groupKey(row: EconomicEventEvidence) {
  const correlation = normalized(row.correlationKey);
  if (correlation) return `${row.kind}|ref:${correlation}`;
  // Cross-provider consolidation is never inferred from amount, date, or counterparty alone.
  return `${row.kind}|unlinked:${row.source}:${row.id}`;
}

function authoritative(rows: EconomicEventEvidence[]) {
  return [...rows].filter(row => !row.evidenceOnly).sort((left, right) => sourcePriority[right.source] - sourcePriority[left.source])[0]
    ?? [...rows].sort((left, right) => sourcePriority[right.source] - sourcePriority[left.source])[0]!;
}

/**
 * Consolidates evidence into economic events without changing source records.
 * Conflicting values remain attached and are surfaced for review; Gmail never creates value by itself
 * when transactional evidence for the same event exists.
 */
export function reconcileEconomicEvents(input: EconomicEventEvidence[]): ReconciledEconomicEvent[] {
  const nonRefunds = input.filter(row => row.kind !== "refund");
  const refunds = input.filter(row => row.kind === "refund");
  const groups = new Map<string, EconomicEventEvidence[]>();
  for (const row of nonRefunds) groups.set(groupKey(row), [...(groups.get(groupKey(row)) ?? []), row]);

  const events: ReconciledEconomicEvent[] = [...groups.entries()].map(([key, evidence]) => {
    const primary = authoritative(evidence);
    const transactional = evidence.filter(row => !row.evidenceOnly);
    const observedAmounts = [...new Set(transactional.map(row => cents(row.amount)))];
    const conflicts: EconomicEventConflict[] = observedAmounts.length > 1 ? [{
      type: "amount_mismatch", evidenceIds: transactional.map(row => row.id), observedAmounts: observedAmounts.map(value => value / 100),
    }] : [];
    return { id: key, kind: primary.kind, amount: Math.abs(primary.amount), netAmount: Math.abs(primary.amount), evidence, conflicts,
      refundIds: [], confidence: conflicts.length ? "needs_review" as const : "high" as const,
      calculationVersion: ECONOMIC_EVENT_RECONCILIATION_VERSION };
  });

  const refundGroups = new Map<string, EconomicEventEvidence[]>();
  for (const refund of refunds) {
    const key = `${normalized(refund.reverses)}|${groupKey(refund)}`;
    refundGroups.set(key, [...(refundGroups.get(key) ?? []), refund]);
  }
  for (const refundEvidence of refundGroups.values()) {
    const refund = authoritative(refundEvidence);
    const target = events.find(event => event.evidence.some(row => row.id === refund.reverses || normalized(row.correlationKey) === normalized(refund.reverses)));
    if (!target) {
      events.push({ id: groupKey(refund), kind: "refund", amount: Math.abs(refund.amount), netAmount: -Math.abs(refund.amount), evidence: refundEvidence,
        conflicts: [], refundIds: [], confidence: "needs_review", calculationVersion: ECONOMIC_EVENT_RECONCILIATION_VERSION });
      continue;
    }
    target.evidence.push(...refundEvidence);
    target.refundIds.push(...refundEvidence.map(row => row.id));
    target.netAmount = Math.round((target.netAmount - Math.abs(refund.amount)) * 100) / 100;
  }
  return events;
}
