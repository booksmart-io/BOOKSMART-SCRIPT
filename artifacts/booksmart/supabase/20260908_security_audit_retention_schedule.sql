-- Run the security audit retention purge once per day at 03:17 UTC.
-- pg_cron records successful and failed executions in cron.job_run_details.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'booksmart-security-audit-retention',
  '17 3 * * *',
  $schedule$SELECT public.purge_expired_security_audit_events();$schedule$
);

COMMIT;
