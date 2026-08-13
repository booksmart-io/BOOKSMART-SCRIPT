-- Hardening metadata for resumable, incremental, read-only Jobber synchronization.
ALTER TABLE public.jobber_connections
  ADD COLUMN IF NOT EXISTS last_full_sync_at TIMESTAMPTZ;

ALTER TABLE public.jobber_sync_state
  ADD COLUMN IF NOT EXISTS sync_mode TEXT NOT NULL DEFAULT 'full'
    CHECK (sync_mode IN ('full','incremental')),
  ADD COLUMN IF NOT EXISTS run_id UUID,
  ADD COLUMN IF NOT EXISTS window_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pages_processed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_changed INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.jobber_records
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_run_id UUID;

CREATE INDEX IF NOT EXISTS jobber_records_reconciliation_idx
  ON public.jobber_records(connection_id, object_type, last_seen_run_id)
  WHERE is_archived = false;
