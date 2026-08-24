# Jobber Release 1–2 Readiness Checklist

Audit date: August 14, 2026

Scope: connection foundation and read-only data synchronization only. This checklist does not authorize production monitoring, CPA escalation, webhooks, scheduled Jobber reconciliation, or accounting writes.

## Current decision

**Conditional go for test-account validation. No production enablement yet.**

The local implementation, automated tests, type checks, and API/web production builds pass. All five required Jobber tables were confirmed through the configured Supabase HTTPS endpoint on August 14, 2026. Direct database grants, GraphQL query compatibility, OAuth callback behavior, and imported record parity have not been verified from this workspace.

### Post-sync audit — August 14, 2026

The reusable read-only `audit:jobber-sync` check passed against the configured Supabase project:

- one active Jobber connection with a recorded successful synchronization;
- successful watermarked state for all six object types;
- no failed or resumable synchronization state;
- no duplicate `(connection, object type, external ID)` keys;
- every normalized record has a content hash;
- every normalized record and audit event matches its connection's organization;
- no forbidden secret or imported-private-data keys in audit metadata.

This audit proves internal projection health. Record-count parity with the Jobber test account, repeat-sync idempotency across an additional live run, and accounting before/after invariance still require their explicit checks below.

## Locally verified

- [x] All required Jobber configuration names are present in the local `.env`.
- [x] Tracked-code secret scan found no Jobber credentials; test-only placeholders are present in the OAuth tests.
- [x] Jobber tables are isolated from BookSmart accounting tables.
- [x] Anonymous and authenticated roles are denied direct access to Jobber credentials, sync state, records, and audit history.
- [x] OAuth state is signed, expiring, organization-scoped, database-backed, and one-use.
- [x] OAuth uses PKCE S256.
- [x] Access and refresh tokens are authenticated-encrypted at rest.
- [x] Organization ownership is checked before connection, status, record access, synchronization, audit reads, and disconnect.
- [x] One Jobber connection is allowed per BookSmart organization.
- [x] GraphQL requests carry the configured API-version header.
- [x] Token refresh has an in-process concurrency guard and refresh-generation check.
- [x] GraphQL errors, HTTP throttling, GraphQL throttling, authorization expiry, and API-version warnings have bounded handling.
- [x] Full synchronization is idempotent by external ID and content hash.
- [x] Incremental synchronization uses per-object watermarks with a five-minute overlap.
- [x] Failed page traversal retains a resumable cursor.
- [x] Full refresh archives records no longer returned by Jobber.
- [x] Initial non-client history is limited to twelve months.
- [x] Clients, jobs, scheduled items, quotes, invoices, and related payments are represented.
- [x] Settings provides connect, status, sync now, full refresh, record counts, diagnostics, records, and disconnect.
- [x] Jobber monitoring is disabled by default and forcibly disabled in production.
- [x] Jobber records do not enter `transactions` or canonical financial summaries.
- [x] API tests pass: 80/80.
- [x] Web tests pass: 52/52.
- [x] Workspace TypeScript checks pass.
- [x] API production build passes.
- [x] Web production build passes.
- [x] The configured Supabase project exposes all five required Jobber tables to the service role.
- [ ] Direct SQL verification that `anon` and `authenticated` retain no Jobber table grants (direct PostgreSQL port is unreachable from this environment).

## External checks required before test-account connection

- [ ] Confirm the Jobber Developer Center app still has read-only permissions for Clients, Quotes, Jobs, Scheduled Items, Invoices, and Jobber Payments.
- [ ] Confirm write permissions and webhooks remain disabled.
- [ ] Confirm refresh-token rotation remains enabled.
- [ ] Confirm `JOBBER_GRAPHQL_VERSION` is an active Jobber version.
- [ ] Run every checked-in GraphQL query in Jobber GraphiQL against the dedicated test account.
- [ ] Confirm the callback registered in Jobber exactly matches `JOBBER_REDIRECT_URI`.
- [ ] Confirm the deployed `APP_URL` points to the intended BookSmart environment.
- [ ] Confirm production secrets are stored in the deployment provider's secret store and are not copied into frontend variables.

## Migration gate

Do not assume the migrations are applied because the files exist. Verify the target Supabase database before applying anything.

Required order:

1. `20260817_jobber_oauth_foundation.sql`
2. `20260818_jobber_readonly_sync.sql`
3. `20260819_jobber_incremental_sync.sql`
4. `20260820_jobber_audit_history.sql`

Read-only verification query:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'jobber_connections',
    'jobber_oauth_states',
    'jobber_sync_state',
    'jobber_records',
    'jobber_audit_events'
  )
order by table_name;
```

Expected tables: all five. If any are missing, apply only the migrations not already recorded by the deployment process, in order, first in a non-production Supabase project.

After migration, verify that `anon` and `authenticated` have no direct privileges:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like 'jobber_%'
  and grantee in ('anon', 'authenticated');
```

Expected result: no rows.

## Dedicated test-account sequence

Use a non-production BookSmart organization and a dedicated Jobber account.

1. Record baseline BookSmart transaction count and canonical financial totals.
2. Connect Jobber from Settings.
3. Confirm the returned account ID/name matches the intended Jobber test account.
4. Confirm no token, authorization code, or client secret appears in the browser response or server log.
5. Run the first full synchronization.
6. Compare active counts for all six object types against Jobber.
7. Confirm no rows were added to `transactions`.
8. Confirm financial reports, tax calculations, and canonical totals equal the baseline.
9. Change one safe operational record in Jobber.
10. Run incremental synchronization twice.
11. Confirm the record changes once and the second sync creates no duplicate.
12. Interrupt a multi-page test sync, retry it, and confirm cursor resumption.
13. Run a full refresh after archiving a Jobber test record and confirm the local projection is archived rather than deleted.
14. Attempt record/status/sync access from a different BookSmart organization and confirm rejection.
15. Disconnect and confirm local credentials are removed while imported read-only records remain safe.

## Go/no-go requirements for Release 1–2

Release 1–2 may be enabled only when all of the following are true:

- [x] All five expected tables from the four migrations are present in the configured Supabase project.
- [ ] The migrations' column/constraint versions and direct grants are confirmed through SQL or deployment migration history.
- [ ] Developer Center scopes and callback are confirmed.
- [ ] All GraphQL queries work with the configured version.
- [ ] OAuth succeeds with the dedicated test account.
- [ ] Full and incremental sync counts match the test account.
- [ ] Repeated sync is idempotent.
- [ ] Cross-organization requests are rejected in an integration environment.
- [ ] Jobber connection leaves accounting totals unchanged.
- [ ] Disconnect and reconnect behavior are verified.
- [ ] Logs and responses contain no credentials or imported sensitive content.
- [ ] Existing automated tests, type checks, and API/web builds still pass from the release candidate.

## Explicitly deferred

- Production Jobber monitoring
- CPA-visible Jobber alerts
- Jobber webhooks
- Scheduled Jobber reconciliation
- Cross-source matching suggestions
- Customer concentration and collection intelligence
- Any Jobber-to-accounting write path

## Monitoring rollout progress

### Safe preview foundation

- [x] Replace the global/local-only switch with an explicit organization allowlist.
- [x] Require `JOBBER_MONITORING_ENABLED=true` and a matching ID in `JOBBER_MONITORING_ORGANIZATION_IDS`.
- [x] Separate preview access into `JOBBER_MONITORING_PREVIEW_ORGANIZATION_IDS` so preview cannot enable persistent signals or tasks.
- [x] Initially allowlist connected test organization `63` for preview only.
- [x] Keep an empty or malformed allowlist disabled by default.
- [x] Apply the organization gate to post-sync monitoring scheduling and the shared monitoring runner.
- [x] Add authenticated owner-only `GET /api/integrations/jobber/monitoring-preview`.
- [x] Scope preview records to the owner's organization and active Jobber connection.
- [x] Return `dry_run: true` and `persisted: false`.
- [x] Keep preview free of signal, task, notification, and audit writes.
- [x] Preserve owner-only candidates with `requiresCpaReview: false`.
- [x] Add allowlist, deterministic-preview, source-immutability, and owner-only candidate tests.
- [x] Add an on-demand Jobber monitoring preview to the connected Jobber card in Settings.
- [x] Clearly label preview results as a dry run that creates no signals, tasks, notifications, or accounting entries.
- [x] Handle preview loading, disabled/unavailable, empty, and candidate-result states without adding persistence controls.
- [x] Restrict external candidate links to HTTPS URLs.
- [x] Hide the Settings preview by default and require the explicit internal UI flag `VITE_JOBBER_MONITORING_PREVIEW_UI=true` to display it.
- [x] Retain server-side authentication, ownership, and preview-allowlist enforcement regardless of the UI flag.
- [x] Pass 89 API tests, 52 web tests, API typecheck, and web typecheck after the CPA escalation preview foundation.
- [x] Pass independent API and web production builds after the preview-screen change.

### Still unfinished

- [x] Document the first two pilot rules with explicit triggers, boundaries, resolution behavior, accounting separation, and approval gates.
- [x] Add exact severity-boundary tests for the proposed $5,000 uninvoiced and five-unscheduled-job thresholds.
- [x] Add an explicit resolution test for the requires-invoicing rule; retain the existing zero-unscheduled lifecycle test.
- [x] Restrict persistent Jobber evaluation and lifecycle management to the two approved pilot signal families.
- [x] Enable persistent owner-only monitoring for organization 63 only.
- [x] Add a read-only organization-63 pilot audit for approved keys, owner assignment, CPA isolation, accounting isolation, suppressed delivery, and duplicates.
- [x] Detect pre-restriction Jobber signals and keep legacy keys lifecycle-managed only for safe resolution and linked-task completion.
- [x] Verify the first post-restriction sync: legacy signals resolved, linked legacy tasks completed, and only the two approved pilot signals remain active.
- [x] Verify organization 63 has zero CPA-visible Jobber signals, zero non-owner Jobber tasks, zero deliverable notifications, and zero duplicate active keys/events.
- [x] Extend the pilot audit to compare every active signal with its synchronized Jobber source status and explicit value evidence.
- [x] Verify a stable pilot baseline: approved evidence still matches, no duplicates appeared, delivery remains suppressed, and CPA/accounting isolation remains intact.
- [x] Review and approve conservative thresholds and language for the two limited-pilot rules.
- [x] Require explicit `uninvoicedTotal` evidence and remove unsupported completed-work wording from the invoicing rule.
- [ ] Review and approve production thresholds and language for the remaining non-pilot Jobber rules before wider rollout.
- [ ] Separate completed-visit-not-invoiced evidence when Jobber exposes sufficient fields.
- [ ] Add quote-conversion, customer-inactivity, high-value-client, concentration, collection-slowdown, and sync-failure rules.
- [ ] Add positive, negative, duplicate-prevention, and lifecycle tests for each new rule.
- [x] Observe a stable owner-only pilot with source-evidence matching and no detected false positives before wider rollout.
- [x] Define and approve conservative preview thresholds before making any Jobber signal CPA-visible.
- [x] Add default-off organization-scoped Jobber CPA-sharing consent storage and owner-only APIs.
- [x] Add an owner-only CPA escalation preview requiring explicit `completedAt`, explicit `uninvoicedTotal >= $5,000`, and at least 14 days.
- [x] Require an active engagement with an approved CPA in addition to owner consent for future eligibility.
- [x] Keep the CPA escalation foundation preview-only with zero CPA visibility, persistence, notifications, or accounting writes.
- [ ] Apply migration `20260825_jobber_cpa_sharing_consent.sql` to the deployment database.
- [x] Add the owner consent control and preview presentation after the migration is deployed.
- [ ] Pilot CPA-visible persistence only after the owner reviews the preview.
- [x] Integrate incremental Jobber reconciliation into the locked daily monitoring run before organization evaluation.
- [x] Skip evaluation for an organization when its scheduled Jobber refresh fails, preserving the last complete dataset.
- [x] Recover stale reconciliation state and reject overlapping manual/scheduled synchronization.
- [x] Reuse the existing daily Render scheduler blueprint and authenticated endpoint for reconciliation followed by monitoring.
- [x] Promote the two approved owner-only Jobber rules from organization 63 to every connected organization through the explicit `JOBBER_MONITORING_ROLLOUT=all` control.
- [x] Preserve the organization allowlist as a rollback option and keep preview access separately controlled.
- [ ] Implement signed, deduplicated webhooks only after scheduled reconciliation is stable.
- [ ] Implement advanced analytics and cross-source suggestions last; never auto-merge accounting data.

## Build note

The aggregate root build also invokes the mobile deployment build. On this audit date it stopped because none of `REPLIT_INTERNAL_APP_DOMAIN`, `REPLIT_DEV_DOMAIN`, or `EXPO_PUBLIC_DOMAIN` was set. API and web production builds passed independently. Configure a mobile deployment domain before using the aggregate build as a release gate.
