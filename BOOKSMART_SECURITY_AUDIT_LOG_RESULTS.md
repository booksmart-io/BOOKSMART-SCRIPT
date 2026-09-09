# Central security audit log — September 8, 2026

Implemented and applied to the hosted project.

## Recorded events

- Browser sign-in and sign-out, deduplicated by authenticated session.
- Customer account export success, denial or failure.
- Owner account deletion success, denial or failure.
- Plaid, QuickBooks, Jobber and Gmail connection, callback and disconnection outcomes.
- Owner CPA-access authorization and revocation, verified against the final order state.
- CPA engagement status changes.
- Admin token balance, plan, user deletion and CPA verification changes.

The request middleware uses the verified authentication subject populated by server authentication. OAuth callbacks can be recorded without an actor because the callback is intentionally not authenticated by a browser bearer token; provider and outcome remain recorded.

## Privacy and integrity controls

- Auth identities, organization IDs and targets are stored only as domain-separated HMAC-SHA-256 fingerprints. The log stores no email address, name, IP address or user agent.
- Event metadata uses a small scalar allowlist. Request bodies, URLs, provider responses, errors, tokens, OAuth codes, authorization headers, passwords, API keys and credentials are never copied into audit metadata.
- The client roles have no table access. Writes use only the service-role API.
- Event keys are fingerprinted and unique, providing idempotent session and retry recording without storing the underlying key.
- Rows are append-only. Updates and ordinary deletes fail at the database trigger.
- Each event has a two-year retention deadline. Only the server-only retention purge function can delete expired rows.
- Audit write errors are sent to the safe application logger without event payloads. User authentication remains available if audit transport is temporarily unavailable.

## Validation

- Four permanent service tests pass for fingerprinting/domain separation, metadata redaction, route classification, safe inserts and duplicate handling.
- A disposable PostgreSQL suite passes append-only enforcement, duplicate rejection, client-role isolation and deletion only after retention expiry.
- API and frontend TypeScript checks pass.
- Full API and frontend regression suites pass.
- Hosted acceptance passes for synthetic sign-in, sign-out and customer-export events.
- The hosted table denies authenticated-client reads and blocks service-role updates and ordinary deletes.
- Hosted event rows passed a credential scan for the access token, refresh token and service-role key used by the acceptance test.

## Deployment and acceptance

The migration `artifacts/booksmart/supabase/20260908_security_audit_log.sql` is applied and its hosted acceptance checks pass. Deploy the API and frontend to begin recording these events from the production application.

This closes the centralized application audit-log implementation. Provider-side audit histories, Supabase Auth platform logs and backup-provider logs remain separate systems.

## Retention automation

The migration `artifacts/booksmart/supabase/20260908_security_audit_retention_schedule.sql` prepares one named pg_cron job to call `purge_expired_security_audit_events()` every day at 03:17 UTC. Reapplying the migration updates the stable named job instead of intentionally creating a new name. The command runs inside PostgreSQL and contains no URL, API key or service credential. Successful and failed executions are recorded by pg_cron in `cron.job_run_details`.

Local checks confirm the daily schedule, stable job name, protected purge target and absence of embedded network destinations or credentials. The retention migration was applied to the hosted development project on September 9, 2026. A direct `cron.job` query returned exactly one job named `booksmart-security-audit-retention` with schedule `17 3 * * *`. Its first execution result in `cron.job_run_details` remains pending until the next scheduled run.
