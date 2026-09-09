# BookSmart synthetic intelligence integrity audit

## Result

The current suite is valid deterministic regression coverage for BookSmart's
monitoring calculations, customer-facing insights, and selected visual evidence
connections. The final browser run passed all 13 scenarios.

## Confirmed safeguards

- Production monitoring and UI code contains no scenario IDs or synthetic
  company names.
- Expected insights are not inserted directly into `business_signals`.
- Monitoring signals are generated and persisted by the normal monitoring
  runner.
- Answer keys remain outside application runtime imports.
- The analysis command now fails when an expected insight is missing as well as
  when a prohibited insight appears.
- Every tenant reset is gated by `E2E_TARGET=test` and exact synthetic
  organization/owner identity checks.

## Defects fixed during this audit

1. Removed the seed-time copy of QuickBooks invoice totals into Jobber job
   payloads. The monitoring runner now matches QuickBooks project references to
   Jobber job numbers at runtime and calculates invoiced totals from actual
   invoice records.
2. Added structured runtime provenance and calculation operands to monitoring
   signal metadata.
3. Added a customer-visible evidence map showing provider records, match
   reasons, states, calculation inputs, confidence, exclusions, and source
   links.
4. Added Playwright evidence-map coverage for unbilled work, conflicting
   QuickBooks/Jobber invoice status, and Plaid cash combined with Gmail
   obligations.
5. Corrected a boundary-date fixture that caused a false revenue-decline warning
   for the healthy HVAC business.

## What the passing suite proves

- BookSmart's normal monitoring runner generates the tested insights from
  normalized and canonical test records.
- QuickBooks project references can be matched to Jobber job numbers without a
  fixture-provided prejoin.
- The UI can visibly explain selected cross-system conclusions using persisted
  runtime provenance.
- The tested amounts, prohibited warnings, tenant isolation, and customer UI
  behavior remain deterministic.

## Remaining limitation

The margin scenarios still use a guarded E2E helper to persist confirmed
job-cost assignments after accounting import. The production matcher is tested
separately, but the browser suite does not yet prove the complete suggestion,
human confirmation, and assignment workflow. Until that path is exercised in
Playwright, margin tests should be described as using confirmed job-cost
evidence, not fully autonomous job-cost matching.

Provider OAuth, live sync, raw-payload normalization, and Gmail content
extraction remain provider-contract responsibilities. The deterministic E2E
suite intentionally does not depend on live third-party services.

## Final checks

- Scenario validation: 13 passed
- Validator regression tests: 2 passed
- Focused monitoring/API tests: 22 passed
- API typecheck: passed
- Web typecheck: passed
- E2E typecheck: passed
- Playwright: 13 passed
- Video recording: enabled for every scenario
