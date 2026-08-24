# Contractor Financial Intelligence Completion Tracker

Updated: August 21, 2026

This is the execution checklist for the contractor financial intelligence instruction. A checked item means the implementation exists and has automated verification; it does not imply that an unapplied migration or external provider has been validated in production.

## Foundation

- [x] Canonical BookSmart/QuickBooks accounting totals remain authoritative.
- [x] Jobber records are operational context and do not create accounting entries.
- [x] Plaid cash balances require supported, fresh balance data.
- [x] Normalized contractor intelligence response exists.
- [x] Major derived values expose confidence, sources, or missing inputs.
- [x] Organization-specific or industry target margin storage exists.
- [x] Add owner APIs for target-margin configuration.
- [x] Add owner UI for target-margin configuration.
- [x] Verify all five required non-Gmail contractor tables are exposed by the configured Supabase project through HTTPS.
- [x] Add same-organization database enforcement and match traceability for confirmed job-cost assignments (`20260829_contractor_assignment_integrity.sql`).
- [ ] Verify contractor migration versions, RLS, direct grants, duplicates, and organization isolation through direct SQL in the deployment environment.

## Matching and receipts

- [x] Job matching returns confidence, reasons, source IDs, and confirmation requirements.
- [x] Low-confidence and ambiguous matches are not silently assigned.
- [x] Contractor receipt fields include PO/job/customer references and line items.
- [x] Receipt-to-transaction matching avoids duplicate expenses.
- [x] Owner confirmation creates a tracked job cost from an existing approved expense.
- [x] Validate receipt, transaction, and Jobber matching with real provider data for organization 63: confirmed receipt-to-transaction link, confirmed Jobber match, and traceable job-cost assignment.
- [x] Validate the existing real Jobber pilot: one healthy connection, all six required record types synchronized, no duplicate keys or organization-scope mismatches, and signal/task lifecycle checks passing (August 21, 2026).
- [x] Refresh the real Jobber pilot within the three-day financial-intelligence freshness threshold.
- [x] Apply `20260830_contractor_assignment_traceability_backfill.sql` and verify the legacy confirmed assignment receives its uniquely supported match reference.

## Gmail

Gmail is explicitly deferred from the first production release. The metadata foundation remains dormant and has no accounting effect. Gmail connectivity, mailbox access, and Gmail-specific acceptance scenarios are not release gates.

- [x] Targeted metadata-first Gmail query plan exists.
- [x] Financial metadata classification and bounded normalization exist.
- [x] Gmail provenance storage is additive, organization-scoped, idempotent, and has no accounting effect.
- [x] Owner-authorized metadata import exists for a future connector.
- [ ] Deferred: implement or install an authorized Gmail connector and OAuth lifecycle.
- [ ] Deferred: fetch full content/attachments only for targeted candidates.
- [ ] Deferred: link Gmail evidence to receipts, transactions, Jobber jobs, and review tasks.
- [ ] Deferred: add tax-correspondence CPA review signal generation.

## Metrics, signals, and product

- [x] Business totals, comparisons, receivables, tracked costs, and current tracked margin are implemented where supported.
- [x] Contractor signals use persistent monitoring infrastructure.
- [x] Actionable tasks use deterministic keys and lifecycle rules.
- [x] Home, Money, Tasks, Insights, and diagnostics have contractor views.
- [ ] Complete supplier trends, customer payment behavior, and historical job-type analytics where data supports them.
- [x] Finish non-Gmail source drill-down and confirmation presentation.
- [ ] Deferred: Gmail review presentation.

## Verification and release

- [x] API unit/regression suite passes (128 tests on August 21, 2026).
- [x] Web unit/regression suite passes (52 tests on August 21, 2026).
- [x] Workspace typecheck passes before the Gmail foundation; API typecheck passes after it.
- [x] API production build passes.
- [x] Web production build passes with documented `PORT=24254` and `BASE_PATH=/` values.
- [x] Admin contractor diagnostics render real organization data without requiring the deferred Gmail table.
- [x] Document the current lint gate: the workspace has no ESLint/Biome configuration; `git diff --check`, TypeScript typechecking, tests, and production builds are the release gates until a repository-wide formatter/linter baseline is adopted.
- [ ] Configure `REPLIT_INTERNAL_APP_DOMAIN`, `REPLIT_DEV_DOMAIN`, or `EXPO_PUBLIC_DOMAIN` when the separate mobile deployment is included; the API and web builds do not require it.
- [ ] Complete all five provider-mode integration scenarios.
- [ ] Verify RLS and organization isolation against deployed migrations.
- [x] Add a read-only database audit for contractor table presence, RLS, direct grants, duplicates, and cross-organization contamination.
- [ ] Complete non-production real-organization acceptance test.
- [ ] Complete deployment scheduler, secrets, callback, scopes, and rollback checks.
