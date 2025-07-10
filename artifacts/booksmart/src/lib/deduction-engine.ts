import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeductionRuleGroup = {
  id: number;
  state_id: number | null;
  valid_from: string;
  valid_to: string | null;
  description: string | null;
};

export type DeductionRule = {
  id: number;
  deduction_rule_group_id: number;
  sub_category_id: number;
  organization_column_name: string | null;
  calculation_type: "percentage" | "fixed";
  value: number;
  is_per_transaction: boolean;
  max_deduction_per_transaction: number | null;
};

export type DeductibleTx = {
  id: number;
  amount: number;
  deductible?: boolean;
  sub_category_id?: number | null;
};

export type OrgRow = Record<string, unknown> & { id?: number; state?: number | null };

// ─── Shared fetch hook (rules/groups rarely change; cache them) ───────────────

export function useDeductionRuleSet() {
  const groupsQ = useQuery<DeductionRuleGroup[]>({
    queryKey: ["deduction_rule_groups_all"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("deduction_rule_groups").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const rulesQ = useQuery<DeductionRule[]>({
    queryKey: ["deduction_rules_all"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("deduction_rules").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  return {
    groups: groupsQ.data ?? [],
    rules: rulesQ.data ?? [],
    isLoading: groupsQ.isLoading || rulesQ.isLoading,
  };
}

// ─── Core calculation ──────────────────────────────────────────────────────────

function isGroupActive(g: DeductionRuleGroup, asOf: Date): boolean {
  const from = new Date(g.valid_from);
  const to = g.valid_to ? new Date(g.valid_to) : null;
  return from <= asOf && (!to || to >= asOf);
}

/**
 * Finds the applicable rule for a sub-category under a given jurisdiction
 * (federal = groups with state_id null; state = groups matching the org's state).
 * When multiple valid groups exist for the same jurisdiction, the most recent
 * (by valid_from) group that actually has a rule for this sub-category wins.
 */
export function getApplicableRule(
  jurisdiction: "federal" | "state",
  subCategoryId: number,
  orgStateId: number | null,
  groups: DeductionRuleGroup[],
  rules: DeductionRule[],
  asOf: Date = new Date(),
): DeductionRule | null {
  const candidateGroups = groups
    .filter((g) => isGroupActive(g, asOf))
    .filter((g) => (jurisdiction === "federal" ? g.state_id === null : orgStateId != null && g.state_id === orgStateId))
    .sort((a, b) => new Date(b.valid_from).getTime() - new Date(a.valid_from).getTime());

  for (const g of candidateGroups) {
    const rule = rules.find((r) => r.deduction_rule_group_id === g.id && r.sub_category_id === subCategoryId);
    if (rule) return rule;
  }
  return null;
}

/**
 * Computes the deductible amount for a single transaction under one rule.
 * - percentage rules: value% of the transaction amount. If the rule references
 *   an organization_column_name (e.g. business_vehicle_percent), that org-specific
 *   business-use percentage is combined with the rule's percentage
 *   (e.g. 75% federally deductible x 80% business-use = 60% of the expense).
 * - fixed rules: the flat dollar value, applied per transaction if
 *   is_per_transaction is true (capped by max_deduction_per_transaction when set).
 */
function ruleAmountForTx(rule: DeductionRule, baseAmount: number, org: OrgRow | null): number {
  if (rule.calculation_type === "percentage") {
    let pct = rule.value;
    if (rule.organization_column_name && org) {
      const orgPct = org[rule.organization_column_name];
      if (typeof orgPct === "number") pct = rule.value * (orgPct / 100);
    }
    const amt = baseAmount * (pct / 100);
    return rule.max_deduction_per_transaction != null ? Math.min(amt, rule.max_deduction_per_transaction) : amt;
  }
  // fixed
  return rule.max_deduction_per_transaction != null
    ? Math.min(rule.value, rule.max_deduction_per_transaction)
    : rule.value;
}

export type DeductionBreakdown = {
  tx: DeductibleTx;
  federal: number;
  state: number;
  federalRule: DeductionRule | null;
  stateRule: DeductionRule | null;
};

export type DeductionSummary = {
  totalFederal: number;
  totalState: number;
  perTx: DeductionBreakdown[];
};

/**
 * Aggregates federal and state deductible amounts across a set of transactions.
 * Falls back to treating a transaction as 100% deductible when no federal rule
 * is configured for its sub-category (preserves the app's original behavior),
 * and mirrors the federal amount when no state-specific rule exists (assumes
 * state conformity unless an admin has configured an override).
 * Fixed, non-per-transaction rules (e.g. a one-time safe-harbor amount) are
 * only counted once per rule, no matter how many transactions match.
 */
export function summarizeDeductions(
  txs: DeductibleTx[],
  orgStateId: number | null,
  org: OrgRow | null,
  groups: DeductionRuleGroup[],
  rules: DeductionRule[],
  asOf: Date = new Date(),
): DeductionSummary {
  let totalFederal = 0;
  let totalState = 0;
  const appliedOnceFederal = new Set<number>();
  const appliedOnceState = new Set<number>();
  const perTx: DeductionBreakdown[] = [];

  for (const tx of txs) {
    if (!tx.deductible || tx.amount >= 0) {
      perTx.push({ tx, federal: 0, state: 0, federalRule: null, stateRule: null });
      continue;
    }
    const base = Math.abs(tx.amount);
    // Transactions without a sub-category can't be matched to any rule, so
    // (like an unconfigured sub-category) they fall back to the full raw
    // amount rather than silently dropping to $0.
    const federalRule = tx.sub_category_id == null
      ? null
      : getApplicableRule("federal", tx.sub_category_id, orgStateId, groups, rules, asOf);
    const stateRule = tx.sub_category_id == null
      ? null
      : getApplicableRule("state", tx.sub_category_id, orgStateId, groups, rules, asOf);

    let federalAmt: number;
    if (!federalRule) {
      federalAmt = base;
    } else if (!federalRule.is_per_transaction && federalRule.calculation_type === "fixed") {
      federalAmt = appliedOnceFederal.has(federalRule.id) ? 0 : ruleAmountForTx(federalRule, base, org);
      appliedOnceFederal.add(federalRule.id);
    } else {
      federalAmt = ruleAmountForTx(federalRule, base, org);
    }

    let stateAmt: number;
    if (!stateRule) {
      stateAmt = federalAmt;
    } else if (!stateRule.is_per_transaction && stateRule.calculation_type === "fixed") {
      stateAmt = appliedOnceState.has(stateRule.id) ? 0 : ruleAmountForTx(stateRule, base, org);
      appliedOnceState.add(stateRule.id);
    } else {
      stateAmt = ruleAmountForTx(stateRule, base, org);
    }

    totalFederal += federalAmt;
    totalState += stateAmt;
    perTx.push({ tx, federal: federalAmt, state: stateAmt, federalRule, stateRule });
  }

  return { totalFederal, totalState, perTx };
}
