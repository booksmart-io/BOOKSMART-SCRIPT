# BookSmart daily monitoring scheduler

The monitoring API exposes `POST /api/monitoring/scheduled-run`. The endpoint
requires `x-monitoring-secret` and records an idempotent, auditable monitoring
run. It does not write accounting transactions and notification delivery is
disabled.

For organizations with an active Jobber connection, the same locked run now
performs incremental Jobber reconciliation before monitoring evaluation. A
failed or overlapping Jobber refresh prevents that organization from being
evaluated against stale operational data while preserving its last complete
normalized dataset.

## Render configuration

The separate `render.monitoring.yaml` Blueprint defines one cron job that runs
daily at 12:00 UTC. It intentionally does not manage or replace the existing
BookSmart web or API services.

Before importing the Blueprint:

1. Generate a strong random `MONITORING_CRON_SECRET`.
2. Add the same secret to the existing BookSmart API service.
3. In the cron job, set `BOOKSMART_API_BASE_URL` to the public HTTPS base URL
   that routes `/api` to the BookSmart API.
4. Set the cron job's `MONITORING_CRON_SECRET` to the same value.
5. Trigger one manual cron run and confirm a completed row appears in Monitoring
   Operations with zero errors and a refreshed Jobber synchronization timestamp.

The launcher intentionally omits a custom run ID. The API derives one stable
idempotency key per configured interval, so provider retries in the same window
return the existing run instead of evaluating every organization twice.

Monitoring Operations reports whether scheduling is healthy, running, stalled,
failed, partial, overdue, never run, or not configured. A scheduled run is
overdue after the configured interval plus the 30-minute execution lease.

Do not commit either environment-variable value. Render schedules use UTC.
