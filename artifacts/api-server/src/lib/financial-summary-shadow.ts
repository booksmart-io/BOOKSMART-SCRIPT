export const SHADOW_METRICS = ["revenue", "accountingExpenses", "netIncome", "moneyIn", "moneyOut", "netCashMovement", "healthScore"] as const;
export type ShadowMetric = typeof SHADOW_METRICS[number];
export type ShadowValues = Partial<Record<ShadowMetric, number>>;
export type ShadowSources = { pnl?: string; balanceSheet?: string; cashFlow?: string };
export type ShadowDifference = { metric: ShadowMetric; legacy: number | null; canonical: number | null; delta: number | null; reason: "missing_value" | "value_mismatch" };

export function compareFinancialSummaries(input: {
  legacy: ShadowValues;
  canonical: ShadowValues;
  legacySources?: ShadowSources;
  canonicalSources?: ShadowSources;
  tolerance?: number;
}) {
  const tolerance = input.tolerance ?? 0.01;
  const differences: ShadowDifference[] = [];
  for (const metric of SHADOW_METRICS) {
    const legacy = input.legacy[metric]; const canonical = input.canonical[metric];
    if (!Number.isFinite(legacy) || !Number.isFinite(canonical)) {
      differences.push({ metric, legacy: legacy ?? null, canonical: canonical ?? null, delta: null, reason: "missing_value" });
      continue;
    }
    const delta = Math.round(((canonical as number) - (legacy as number)) * 100) / 100;
    if (Math.abs(delta) > tolerance) differences.push({ metric, legacy: legacy as number, canonical: canonical as number, delta, reason: "value_mismatch" });
  }
  const sourceKeys = ["pnl", "balanceSheet", "cashFlow"] as const;
  const sourceDifference = sourceKeys.some(key => input.legacySources?.[key] !== input.canonicalSources?.[key]);
  const methodologyDifference = differences.length > 0 && differences.every(item => item.metric === "healthScore");
  const classification = differences.length === 0
    ? "match" as const
    : sourceDifference || methodologyDifference
      ? "expected_source_difference" as const
      : "unexpected_mismatch" as const;
  return { differences, classification, sourceDifference, methodologyDifference };
}
