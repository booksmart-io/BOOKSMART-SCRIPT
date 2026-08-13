-- Make monitoring recurrence safe without altering accounting records or
-- deleting signal/task history. Only one active occurrence of a signal key is
-- allowed, while any number of historical resolved/dismissed occurrences may
-- be retained.

BEGIN;

ALTER TABLE public.business_signals
  ADD COLUMN IF NOT EXISTS condition_cleared_at TIMESTAMPTZ;

-- Existing resolved records predate explicit recurrence tracking. Treat their
-- resolved timestamp as evidence that the prior occurrence was closed.
UPDATE public.business_signals
SET condition_cleared_at = COALESCE(resolved_at, updated_at, now())
WHERE status = 'resolved' AND condition_cleared_at IS NULL;

ALTER TABLE public.business_signals
  DROP CONSTRAINT IF EXISTS business_signals_organization_id_signal_key_status_key;

-- Defensive normalization for environments whose monitoring table predates
-- the source-controlled uniqueness rule. Keep the newest active occurrence
-- and close older duplicates without deleting their history.
WITH ranked_active AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY organization_id, signal_key
      ORDER BY detected_at DESC, id DESC
    ) AS occurrence_rank
  FROM public.business_signals
  WHERE status = 'active'
)
UPDATE public.business_signals signal
SET status = 'resolved',
    resolved_at = COALESCE(signal.resolved_at, now()),
    condition_cleared_at = COALESCE(signal.condition_cleared_at, now()),
    updated_at = now()
FROM ranked_active ranked
WHERE signal.id = ranked.id AND ranked.occurrence_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS business_signals_one_active_key_idx
  ON public.business_signals (organization_id, signal_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS business_signals_recurrence_idx
  ON public.business_signals (organization_id, signal_key, condition_cleared_at)
  WHERE status = 'resolved';

COMMIT;
