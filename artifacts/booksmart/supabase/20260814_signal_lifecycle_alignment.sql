-- Align persisted signal lifecycle terminology with the BookSmart monitoring
-- directive. Existing open signals remain active; no signal history is lost.

BEGIN;

ALTER TABLE public.business_signals
  DROP CONSTRAINT IF EXISTS business_signals_status_check;

UPDATE public.business_signals SET status = 'active' WHERE status = 'open';

ALTER TABLE public.business_signals
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.business_signals
  ADD CONSTRAINT business_signals_status_check
  CHECK (status IN ('active', 'resolved', 'dismissed', 'expired'));

DROP INDEX IF EXISTS public.business_signals_expiry_idx;
CREATE INDEX business_signals_expiry_idx
  ON public.business_signals (organization_id, expires_at)
  WHERE status = 'active';

ALTER TABLE public.monitoring_runs
  DROP CONSTRAINT IF EXISTS monitoring_runs_trigger_type_check;
ALTER TABLE public.monitoring_runs
  ADD CONSTRAINT monitoring_runs_trigger_type_check
  CHECK (trigger_type IN ('manual', 'scheduled', 'event'));

COMMIT;
