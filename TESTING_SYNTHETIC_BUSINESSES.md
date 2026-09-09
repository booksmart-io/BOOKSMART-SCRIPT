# Testing synthetic businesses

## Purpose

The synthetic-business suite tests whether BookSmart reaches supported,
numerically correct conclusions from deterministic fake provider records. It
does not use customer records or live provider APIs.

## Current architecture inventory

- The web application is Vite/React and uses Supabase authentication.
- The API is Express and verifies Supabase bearer tokens.
- QuickBooks is normalized into staging records before approved records enter
  canonical accounting transactions.
- Jobber remains read-only in `jobber_records`; it contributes operational
  evidence but is never added directly to accounting revenue.
- Gmail scanning parses provider-shaped messages and attachments into bounded
  receipt metadata.
- Plaid transactions use BookSmart's accounting sign convention and Plaid
  balance snapshots provide verified cash only when fresh and healthy.
- Canonical accounting summaries are produced by `financial-summary-v2`.
- Contractor intelligence combines canonical totals with Jobber, Plaid,
  receipt, and matching evidence while retaining source and confidence data.
- Monitoring persists stable `contractor:*` signal keys for the Insights UI.
- Important source IDs are retained, but the current UI mainly routes users to
  the relevant source screen rather than presenting a dedicated provenance
  panel.

## Fixture layout

Each directory under `e2e/scenarios` contains one self-contained business.
Provider fixtures and the answer key are separate exports. Application runtime
code must never import an answer key.

Values, IDs, identities, and dates are fixed. Email addresses use reserved
`.test` domains. Runtime data generation and live LLM calls are prohibited.

## Validation

Run:

```powershell
pnpm test:scenarios:validate
pnpm test:scenarios
```

The validator checks unique IDs, references, date ordering, line arithmetic,
totals, safe email domains, and independently proves answer-key values.

## Playwright

Playwright retains screenshots, traces, and video on failure. Browser scenarios
require:

- `E2E_TARGET=test`
- `E2E_BASE_URL`

The full suite selects the matching stored authentication state for each of the
13 isolated synthetic tenants and runs serially for repeatability. To run one
scenario, also set `E2E_STORAGE_STATE` to that tenant's state and use
`pnpm test:e2e:scenario -- <SCENARIO_ID>`. The `E2E_TARGET=test` gate and seed
safety audit prevent accidental execution against a non-test tenant. Run the
full browser suite with `pnpm test:e2e` and view its report with
`pnpm exec playwright show-report`.

Before browser execution, reset and seed each scenario with the API scripts,
run its deterministic analysis/import steps, and create the stored auth state.
These operations require the test-only marker and reject non-synthetic tenant
identities.

## Synthetic E2E versus provider contracts

Synthetic E2E uses local/test provider representations and must remain
independent of provider availability. Provider contract tests are a smaller,
separate suite for existing QuickBooks sandbox or Jobber developer credentials.
They must never create production financial activity.

## Known limitations

- Upcoming payroll and vendor bills are forecast when retained Gmail metadata
  contains an explicit amount and due date. Amounts or dates found only in an
  unretained message body are intentionally not inferred yet.
- Recurring-cost and ATM-withdrawal patterns do not yet have dedicated insight
  types.
- Job-volume slowdown currently requires at least 10 jobs in the 60-day window,
  so smaller seasonal businesses may only receive the revenue-decline insight.
- The current development database has a notification-trigger ordering issue
  when deleting an organization with transactions. The E2E reset deletes child
  data explicitly before the synthetic organization to remain deterministic.
