---
name: Deduction rule engine
description: How admin-configured deduction_rules/deduction_rule_groups now drive user-facing deduction totals.
---

`artifacts/booksmart/src/lib/deduction-engine.ts` is the single source of truth for turning a raw `deductible=true` transaction into an actual federal/state deductible dollar amount.

- `useDeductionRuleSet()` fetches all `deduction_rule_groups` + `deduction_rules` rows (cached 10min) — small tables, fetched in full rather than filtered per-call.
- `getApplicableRule(jurisdiction, subCategoryId, orgStateId, groups, rules, asOf)` picks the most-recently-valid group (federal = `state_id IS NULL`, state = `state_id = org.state`) that has a rule for that sub-category.
- `summarizeDeductions(txs, orgStateId, org, groups, rules)` aggregates per-transaction amounts: percentage rules scale by `organization_column_name` org overrides (e.g. `business_vehicle_percent`) when present; fixed rules with `is_per_transaction=false` are counted once per rule (deduped), not once per matching transaction.
- **Why:** previously any `deductible=true` transaction just counted its full raw amount everywhere (ai-strategy.tsx, reports.tsx), completely ignoring the admin tax-deduction config UI — the config had no effect on user numbers.
- **Fallback behavior (intentional):** if no federal rule matches a sub-category, falls back to 100% of the raw amount (preserves old behavior for unconfigured categories). If no state-specific rule exists, state amount mirrors the federal amount (assumes state conformity by default).
- **How to apply:** any new page/feature that sums deductible transaction amounts must go through `summarizeDeductions`, not `Math.abs(tx.amount)` directly, or it will silently ignore admin-configured rules again. Both pages need `sub_category_id` in their transaction `select()` and the full `organizations` row (not just `id`) for `org.state` + override columns.
- **Bug caught in review:** an early version zeroed out federal/state amounts entirely when `tx.sub_category_id` was null (treating "no category" like "explicitly excluded"). Fixed to fall back to the full raw amount instead — null sub-category must behave the same as "no rule configured for this sub-category," not "$0 deductible."
- **Most real transactions have no sub_category_id set** (categorization is manual/AI-assisted per-transaction, no bulk backfill exists) — so on unmigrated data, rule effects are invisible until transactions are actually categorized. When verifying this feature, check `sub_category_id` is populated before concluding the engine is broken.
