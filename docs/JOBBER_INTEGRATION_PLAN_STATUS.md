# Jobber Integration Plan Status

Updated: August 14, 2026

## Progress summary

- **Core customer integration (Phases 0–7 and accounting isolation): 96%**
- **Complete Phase 0–13 roadmap, including webhooks, CPA escalation, and advanced intelligence: 81%**

The 96% figure represents the integration customers need to connect Jobber,
synchronize read-only operational data, view it in Settings, receive the two
approved owner-only monitoring rules, and participate in daily reconciliation.
The 81% figure includes optional later roadmap work that is intentionally not
part of the current release.

## Phase status

### Phase 0 — Approve the architecture: 95%

- [x] One Jobber account per BookSmart organization.
- [x] Read-only integration.
- [x] Jobber is operational data, not an accounting source of truth.
- [x] Twelve-month initial history policy.
- [x] Initial clients, jobs, scheduled items, quotes, invoices, and payments scope.
- [x] Owner-only visibility for the two released monitoring rules.
- [ ] Approve future CPA escalation and long-term retention policy beyond the current normalized projection.

### Phase 1 — Finalize Jobber configuration: 90%

- [x] Production callback implemented.
- [x] Read-only scopes configured and working with the connected account.
- [x] Refresh-token rotation supported.
- [x] Dedicated connected account synchronized successfully.
- [x] Server-side secret names and API-version configuration implemented.
- [ ] Reconfirm the current production Developer Center scopes, callback, API version, and secret-store values as a deployment release check.

### Phase 2 — Design and deploy the database: 95%

- [x] `jobber_connections` implemented.
- [x] `jobber_sync_state` implemented.
- [x] Minimal normalized `jobber_records` implemented.
- [x] Append-only `jobber_audit_events` implemented.
- [x] Organization scoping, idempotent external keys, content hashes, and service-role access implemented.
- [x] All required tables confirmed in the configured Supabase project.
- [ ] Confirm direct PostgreSQL grants and deployed migration versions from the deployment environment.
- [ ] `jobber_sync_runs` and webhook-event storage remain future additions.

### Phase 3 — Secure OAuth: 100%

- [x] Owner and organization validation.
- [x] Signed, expiring, one-use state.
- [x] PKCE S256.
- [x] Server-side authorization-code exchange.
- [x] Account verification.
- [x] AES-GCM authenticated token encryption.
- [x] One active connection per organization.
- [x] Disconnect and reconnect-safe connection states.

### Phase 4 — Jobber GraphQL client: 90%

- [x] Bearer token and API-version headers.
- [x] GraphQL and HTTP error handling.
- [x] Rotating refresh-token support and refresh-generation protection.
- [x] Cursor pagination.
- [x] Bounded throttling retries and authorization-expiry handling.
- [x] API-version warnings.
- [ ] Add durable cross-instance refresh locking if the API is horizontally scaled beyond one active instance.
- [ ] Add production query-cost telemetry.

### Phase 5 — Initial read-only import: 100%

- [x] Clients, jobs, scheduled items, quotes, invoices, and payments.
- [x] Twelve-month initial non-client history.
- [x] Minimal operational fields only.
- [x] Resumable and idempotent storage.
- [x] Live synchronized counts audited successfully.
- [x] No transaction or accounting-report writes.

### Phase 6 — Incremental synchronization: 100%

- [x] Per-object watermarks.
- [x] Five-minute overlap window.
- [x] Cursor pagination and failed-page resumption.
- [x] Content-hash change detection.
- [x] Correct external-ID upserts.
- [x] Safe watermark advancement.
- [x] Manual Sync now, Full refresh, status, counts, and errors.
- [x] Monitoring runs after successful normalization.

### Phase 7 — Jobber in Settings: 95%

- [x] Connected Jobber account and BookSmart organization.
- [x] Operational-integration label.
- [x] Connection and synchronization health.
- [x] Last successful synchronization and record counts.
- [x] Connect, Sync now, Full refresh, View records, and Disconnect.
- [x] Clear degraded and reconnect-required states.
- [ ] Add a distinct last scheduled-reconciliation label if product design requires it separately from last successful sync.

### Phase 8 — Initial monitoring rules: 45%

- [x] Released owner-only job-requires-invoicing rule.
- [x] Released owner-only active-unscheduled-jobs rule.
- [x] Approved thresholds, evidence requirements, deterministic keys, lifecycle handling, and duplicate prevention.
- [x] Rolled the two approved rules out to all connected organizations.
- [x] Preserved source IDs, calculation version, direct links, and accounting isolation.
- [ ] Approve and release outstanding-invoice and invoice-aging rules.
- [ ] Approve and release quote-follow-up and quote-conversion rules.
- [ ] Approve and release workload and job-volume rules.
- [ ] Add customer inactivity, high-value customer, concentration, collection-slowdown, and sync-failure rules.
- [ ] Add completed-visit-not-invoiced only when sufficient source evidence is available.

### Phase 9 — CPA Attention Needed: 60%

- [x] Current Jobber rules are explicitly owner-only.
- [x] CPA access remains blocked for Jobber signals and tasks.
- [x] Conservative $5,000 and 14-day preview thresholds are defined.
- [x] Explicit Jobber completion and uninvoiced-amount evidence is required.
- [x] Default-off organization consent storage and owner APIs are implemented.
- [x] Active approved CPA engagement is required for future eligibility.
- [x] Owner-only dry-run preview is implemented with no persistence.
- [x] Deploy the consent migration and add the owner-facing consent and preview controls.
- [ ] Review the preview and separately authorize one CPA-visible pilot.
- [ ] Implement and validate CPA-visible persistence, acknowledgement, revocation, and resolution.

### Phase 10 — Double-counting protection: 95%

- [x] Jobber invoices never enter accounting revenue.
- [x] Jobber payments never enter bank income.
- [x] Jobber records never enter transactions automatically.
- [x] Jobber metadata is labeled with `accounting_effect: none`.
- [x] Canonical financial calculations remain independent of Jobber.
- [ ] Future cross-source matches must remain suggestions and require a separate design and approval.

### Phase 11 — Webhooks: 0%

- [ ] Webhook subscriptions remain intentionally disabled.
- [ ] Signature verification, event storage, deduplication, asynchronous processing, and authoritative refetch are not implemented.

Webhooks are not required for the current daily-reconciliation release.

### Phase 12 — Scheduled reconciliation: 80%

- [x] Daily incremental reconciliation code is integrated before monitoring evaluation.
- [x] Scheduled runs use authenticated requests, database-backed locking, and idempotency keys.
- [x] Stale synchronization recovery and overlap detection.
- [x] Failed refreshes preserve the last complete dataset and skip stale evaluation.
- [x] Render cron blueprint and trigger script are included.
- [ ] Import the cron Blueprint into Render and configure `BOOKSMART_API_BASE_URL` and `MONITORING_CRON_SECRET`.
- [ ] Confirm one successful deployed daily run and rate-limit behavior.
- [ ] Add periodic extended-lookback reconciliation and repeated-failure connection tasks.

### Phase 13 — Security and QA: 85%

- [x] OAuth state, PKCE, encryption, authorization, refresh, throttling, idempotency, lifecycle, and accounting-isolation tests.
- [x] 89 API tests and 52 web tests pass.
- [x] API and web type checks pass.
- [x] API and web production builds pass independently.
- [x] Live read-only sync and monitoring audits pass.
- [x] Rollback controls and disconnect behavior are documented.
- [ ] Complete deployment-side secret, callback, scope, direct-grant, and scheduler verification.
- [ ] Add webhook security tests only if Phase 11 is implemented.

## Completed for the current release

- [x] Secure customer connection.
- [x] Read-only initial and incremental synchronization.
- [x] Settings management and record visibility.
- [x] Two approved monitoring rules for every connected organization.
- [x] Owner-only tasks and safe lifecycle reconciliation.
- [x] No CPA or accounting impact.
- [x] Scheduled reconciliation implementation and deployment blueprint.

## Remaining before declaring the deployed release fully operational

- [ ] Set `JOBBER_MONITORING_ENABLED=true` and `JOBBER_MONITORING_ROLLOUT=all` on the production API.
- [ ] Import/configure the Render cron Blueprint.
- [ ] Run the deployed cron once and confirm zero errors plus an updated Jobber synchronization timestamp.
- [ ] Reconfirm production Jobber scopes, callback, API version, secrets, and direct database grants.

## Optional future releases

- [ ] Additional owner monitoring rules.
- [ ] CPA escalation.
- [ ] Webhooks.
- [ ] Advanced customer, collection, and concentration analytics.
- [ ] Cross-source matching suggestions; never automatic accounting merges.
