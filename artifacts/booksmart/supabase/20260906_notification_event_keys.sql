-- Idempotency key for notifications produced by repeatable detection scans.
BEGIN;
ALTER TABLE public.account_activity_notifications
  ADD COLUMN IF NOT EXISTS event_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS account_activity_notifications_event_key_idx
  ON public.account_activity_notifications (event_key);
COMMIT;
