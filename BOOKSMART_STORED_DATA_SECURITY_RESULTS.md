# BookSmart stored-data security results

Run date: September 3, 2026

**Gate: FAIL — confirmed cross-tenant transaction access through Supabase.**

## Confirmed finding

Company A's authenticated Supabase token received HTTP 200 and a count of six
Company B transaction rows from the direct REST endpoint. A separate minimal
GET requesting only `id,org_id` confirmed foreign-row access in both directions.
Both accounts have distinct user and organization IDs. The organization names
and owners were verified against the existing synthetic fixtures.

Reproduction: use Company A's ordinary access token and the public application
key to request `/rest/v1/transactions?select=id,org_id&org_id=eq.<company-b-org>&limit=1`.
Expected: no foreign rows. Actual: a foreign row was returned. Reverse the
accounts to reproduce the opposite direction. No financial amounts or customer
details were needed for confirmation.

Treat this as a P0 tenant-isolation issue under the supplied checklist. Review
the deployed transactions RLS policies and grants, including all permissive
SELECT policies. Application API authorization does not protect direct database
access. No policy or production application changes were applied in this run.

## Automated results

21 tests: **15 passed, 2 failed, 4 skipped**. One failure is the confirmed
security issue; the other is an unavailable test target.

| Check | Result |
| --- | --- |
| Seven existing API/browser tenant-isolation tests | PASS |
| Invalid bearer token | PASS |
| Cross-user document signing, both directions, synthetic nonexistent path | PASS |
| Direct database reads: transactions | FAIL — foreign rows visible |
| Direct reads: jobber_records, quickbooks_staged_entities, business_signals, contractor_financial_matches, contractor_job_cost_assignments | PASS for populated synthetic fixtures |
| Direct reads: monitoring_tasks | INCOMPLETE — privileged fixture HEAD returned 404; table unavailable at this endpoint |
| Direct reads: plaid_items, account_balance_snapshots, contractor_receipt_extractions, contractor_source_links | SKIPPED — no rows for either synthetic organization |

Database checks used HEAD/count requests to avoid collecting financial rows.
Denial or zero visible foreign rows passes the read check; this alone does not
prove the full deployed RLS policy configuration or write protection. Directions
with no fixture rows were not assessed. The document test verifies the signing
route's folder guard; it does not establish actual stored-object isolation.

## Evidence handling

An initial sandbox-blocked request caused Playwright to include a service
credential in its transport error output. The database checks now use a request
helper that suppresses transport details, and the HTML report was regenerated.
Rotate the exposed Supabase service credential; the earlier tool-output history
cannot be cleaned by replacing report files. Traces, screenshots, and video are
disabled in the dedicated configuration.
The regenerated report and result files, including embedded report ZIP content,
were scanned against configured secret values and the two current session
tokens: zero matches. This does not remove the earlier tool-output exposure.

The initial browser attempt was blocked before the attack step by restricted
network access. With network access enabled, the unchanged browser test passed.
The initial database transport failures were environment failures, not evidence
of tenant denial.

## Remaining coverage

The full document is not certified. Outstanding work includes deployed RLS
inspection; cross-tenant INSERT/UPDATE/DELETE on disposable records; actual file
downloads, public access, revocation and signed-link expiry; disabled accounts
and expired tokens; object-ID attacks across all listed resource types; search,
exports and filters; rate-limit thresholds and bursts; n8n successful/failed
execution retention and configuration; and a broader application/log secret audit.
These need additional fixtures, a verified disposable write-test environment,
and n8n administrative access/configuration. No destructive database tests,
workflow triggers, or rate-limit bursts were run.

## Run again

Start the frontend on 5173 and API on 8080. Refresh the two synthetic auth states
when expired. With configured environment and network access, run:

```powershell
node --env-file=.env node_modules/@playwright/test/cli.js test -c playwright.stored-data.config.ts
```

Configuration: `playwright.stored-data.config.ts`.
Added checks: `e2e/security/stored-data.spec.ts`.
HTML evidence: `stored-data-report/index.html`.
