BEGIN;

ALTER TABLE public.plaid_items
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plaid_items_last_sync_status_check'
      AND conrelid = 'public.plaid_items'::regclass
  ) THEN
    ALTER TABLE public.plaid_items
      ADD CONSTRAINT plaid_items_last_sync_status_check
      CHECK (last_sync_status IS NULL OR last_sync_status IN ('running', 'completed', 'failed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS plaid_items_org_connection_health_idx
  ON public.plaid_items (org_id, status, last_sync_status, last_synced_at DESC);

COMMIT;
