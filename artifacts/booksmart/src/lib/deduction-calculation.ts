export type DeductionRuleGroup = { id: number; state_id: number | null; valid_from: string; valid_to: string | null; description: string | null };
export type DeductionRule = { id: number; deduction_rule_group_id: number; sub_category_id: number; organization_column_name: string | null; calculation_type: "percentage" | "fixed"; value: number; is_per_transaction: boolean; max_deduction_per_transaction: number | null };
export type DeductibleTx = { id: number; amount: number; deductible?: boolean; sub_category_id?: number | null; date_time?: string };
export type OrgRow = Record<string, unknown> & { id?: number; state?: number | null };

function isGroupActive(group: DeductionRuleGroup, asOf: Date) {
  const from = new Date(group.valid_from);
  const to = group.valid_to ? new Date(group.valid_to) : null;
  return from <= asOf && (!to || to >= asOf);
}

export function getApplicableRule(jurisdiction: "federal" | "state", subCategoryId: number, orgStateId: number | null, groups: DeductionRuleGroup[], rules: DeductionRule[], asOf = new Date()): DeductionRule | null {
  const candidates = groups.filter(group => isGroupActive(group, asOf))
    .filter(group => jurisdiction === "federal" ? group.state_id === null : orgStateId != null && group.state_id === orgStateId)
    .sort((a, b) => new Date(b.valid_from).getTime() - new Date(a.valid_from).getTime());
  for (const group of candidates) {
    const rule = rules.find(item => item.deduction_rule_group_id === group.id && item.sub_category_id === subCategoryId);
    if (rule) return rule;
  }
  return null;
}

function ruleAmountForTx(rule: DeductionRule, baseAmount: number, org: OrgRow | null) {
  if (rule.calculation_type === "percentage") {
    let percentage = rule.value;
    const organizationPercentage = rule.organization_column_name && org ? org[rule.organization_column_name] : null;
    if (typeof organizationPercentage === "number") percentage = rule.value * (organizationPercentage / 100);
    const amount = baseAmount * (percentage / 100);
    return rule.max_deduction_per_transaction == null ? amount : Math.min(amount, rule.max_deduction_per_transaction);
  }
  return rule.max_deduction_per_transaction == null ? rule.value : Math.min(rule.value, rule.max_deduction_per_transaction);
}

export function summarizeDeductions(txs: DeductibleTx[], orgStateId: number | null, org: OrgRow | null, groups: DeductionRuleGroup[], rules: DeductionRule[], asOf = new Date()) {
  let totalFederal = 0; let totalState = 0;
  const appliedOnceFederal = new Set<number>(); const appliedOnceState = new Set<number>();
  const perTx: Array<{ tx: DeductibleTx; federal: number; state: number; federalRule: DeductionRule | null; stateRule: DeductionRule | null }> = [];
  for (const tx of txs) {
    if (!tx.deductible || tx.amount >= 0) { perTx.push({ tx, federal: 0, state: 0, federalRule: null, stateRule: null }); continue; }
    const base = Math.abs(tx.amount);
    const parsedDate = tx.date_time ? new Date(tx.date_time) : asOf;
    const effectiveDate = Number.isNaN(parsedDate.getTime()) ? asOf : parsedDate;
    const federalRule = tx.sub_category_id == null ? null : getApplicableRule("federal", tx.sub_category_id, orgStateId, groups, rules, effectiveDate);
    const stateRule = tx.sub_category_id == null ? null : getApplicableRule("state", tx.sub_category_id, orgStateId, groups, rules, effectiveDate);
    const calculate = (rule: DeductionRule | null, applied: Set<number>, fallback: number) => {
      if (!rule) return fallback;
      if (!rule.is_per_transaction && rule.calculation_type === "fixed") {
        if (applied.has(rule.id)) return 0;
        applied.add(rule.id);
      }
      return ruleAmountForTx(rule, base, org);
    };
    const federal = calculate(federalRule, appliedOnceFederal, base);
    const state = calculate(stateRule, appliedOnceState, federal);
    totalFederal += federal; totalState += state;
    perTx.push({ tx, federal, state, federalRule, stateRule });
  }
  return { totalFederal, totalState, perTx };
}
