-- Append-only CPA collaboration for monitoring tasks.
-- This changes no task status, assignment, financial data, or accounting data.
BEGIN;

ALTER TABLE public.financial_task_events
  DROP CONSTRAINT IF EXISTS financial_task_events_event_type_check;
ALTER TABLE public.financial_task_events
  ADD CONSTRAINT financial_task_events_event_type_check
  CHECK (event_type IN (
    'created', 'started', 'waiting', 'completed', 'dismissed', 'reopened', 'updated',
    'cpa_acknowledged', 'cpa_note'
  ));

COMMIT;
