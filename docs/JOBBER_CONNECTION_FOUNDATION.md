# Jobber connection foundation

This integration provides a secure OAuth connection lifecycle plus an isolated,
manual, read-only operational synchronization. It does not create BookSmart
transactions, affect financial calculations, or trigger monitoring.

## Required server secrets

Configure these values in the approved deployment secret store. Never expose
them through Vite or any `VITE_*` variable.

- `JOBBER_CLIENT_ID`
- `JOBBER_CLIENT_SECRET`
- `JOBBER_REDIRECT_URI=https://booksmartv2.onrender.com/api/integrations/jobber/callback`
- `JOBBER_GRAPHQL_VERSION` (set to the active version verified in Jobber GraphiQL)
- `JOBBER_STATE_SECRET` (independent random secret recommended)
- `JOBBER_TOKEN_ENCRYPTION_KEY` (independent random secret recommended)
- `APP_URL=https://booksmartv2.onrender.com`

If the two Jobber-specific cryptographic secrets are omitted, the backend uses
the documented server-only fallbacks. Production should provide independent
values so key rotation can be isolated.

The Jobber Developer Center app must retain only these read permissions:

- Clients
- Quotes
- Jobs
- Scheduled Items
- Invoices
- Jobber Payments

Refresh-token rotation stays enabled and webhooks stay disabled for this
release.

## Database

Apply `artifacts/booksmart/supabase/20260817_jobber_oauth_foundation.sql` before
enabling the endpoints. Both tables deny `anon` and `authenticated`; only the
backend service role can access credentials and OAuth state.

Apply `artifacts/booksmart/supabase/20260818_jobber_readonly_sync.sql` for the
isolated `jobber_records` and `jobber_sync_state` tables. They have no foreign
keys, triggers, or application paths into accounting or monitoring data.

Apply `artifacts/booksmart/supabase/20260819_jobber_incremental_sync.sql` to add
resumable cursors, incremental watermarks, changed-record metrics, and archive
tracking. This migration only extends the isolated Jobber tables.

## Endpoints

- `GET /api/integrations/jobber/connect?organization_id=<id>`
- `GET /api/integrations/jobber/callback`
- `GET /api/integrations/jobber/status?organization_id=<id>`
- `GET /api/integrations/jobber/sync-status?organization_id=<id>`
- `GET /api/integrations/jobber/audit?organization_id=<id>`
- `POST /api/integrations/jobber/sync`
- `POST /api/integrations/jobber/disconnect`

Connect, status, and disconnect require a BookSmart access token and verify
that the authenticated user owns the requested organization. The callback uses
a signed ten-minute state, a database-backed one-use check, and PKCE S256.
Manual synchronization uses top-level and nested cursor pagination, bounded
throttling retries, rotating refresh tokens with concurrency protection, and
safe connection-health states. Temporary provider failures retry automatically;
expired or revoked authorization becomes a reconnect-required state without
deleting previously imported Jobber records. The settings screen distinguishes
healthy, degraded, and reconnect-required connections and displays API-version
warnings. The first run is a full snapshot; later **Sync now** runs
use per-object watermarks and resume a failed page safely. **Full refresh**
reconciles records no longer returned by Jobber as archived. The Settings page
shows active/archived totals and per-object run diagnostics. The initial
snapshot retains the latest twelve months of non-client operational records.
Incremental queries overlap each watermark by five minutes; content hashes make
the repeated boundary records idempotent while preventing timestamp-edge misses.

Jobber connection and synchronization activity is stored in the append-only
`jobber_audit_events` table. Events are isolated by BookSmart organization and
include only safe operational metadata such as event type, outcome, sync mode,
and record counts. OAuth credentials, imported client details, invoice content,
and financial values are never stored in the audit log. Apply migration
`20260820_jobber_audit_history.sql` before using audited Jobber operations.

## Verification and rollback

Use a dedicated Jobber test account. Verify `account { id name }` with the
configured API version in GraphiQL before testing the OAuth callback.

To disable the integration without affecting any other provider, remove the
Jobber secrets or stop exposing the Jobber routes. To remove stored credentials,
disconnect each test connection first, then drop only `jobber_oauth_states` and
`jobber_connections`. No Jobber table participates in transactions, financial
reports, tax calculations, QuickBooks, or Plaid. The optional local monitoring
preview reads only the isolated normalized projection.

## Local operational monitoring preview

Set `JOBBER_MONITORING_ENABLED=true` only in the local API environment to
preview three owner-facing rules after a successful Jobber sync:

- jobs explicitly marked by Jobber as `requires_invoicing` with a positive
  `uninvoicedTotal`;
- invoices with a positive Jobber `invoiceBalance` that are outstanding or
  past due;
- quotes that have remained `awaiting_response` for at least seven days.
- scheduled workload across the next seven and thirty days;
- active jobs explicitly marked `unscheduled` by Jobber;
- thirty-day job-volume changes only after at least sixty days and ten jobs of
  source history are available.

The flag is disabled by default and forcibly disabled when
`NODE_ENV=production`. These signals are labeled with provider `jobber`, retain
the supporting Jobber ID and direct URL, never request CPA review, and never
write to transactions or financial calculations. Removing the flag stops new
Jobber evaluations without removing synchronized read-only records.
