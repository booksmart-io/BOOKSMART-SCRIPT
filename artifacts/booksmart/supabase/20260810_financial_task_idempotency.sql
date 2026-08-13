BEGIN;

WITH ranked_signal_tasks AS (
  SELECT
    id,
    organization_id,
    status,
    row_number() OVER (
      PARTITION BY organization_id, source, source_id
      ORDER BY created_at ASC, id ASC
    ) AS duplicate_rank
  FROM public.financial_tasks
  WHERE source = 'signal'
    AND source_id IS NOT NULL
)
INSERT INTO public.financial_task_events (
  organization_id,
  task_id,
  actor_user_id,
  event_type,
  from_status,
  to_status,
  note,
  metadata
)
SELECT
  organization_id,
  id,
  NULL,
  'dismissed',
  status,
  'dismissed',
  'Duplicate signal task dismissed by the task-idempotency migration.',
  jsonb_build_object('source', 'migration', 'resolution', 'duplicate_signal_task')
FROM ranked_signal_tasks
WHERE duplicate_rank > 1
  AND status IN ('open', 'in_progress', 'waiting');

WITH ranked_signal_tasks AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY organization_id, source, source_id
      ORDER BY created_at ASC, id ASC
    ) AS duplicate_rank
  FROM public.financial_tasks
  WHERE source = 'signal'
    AND source_id IS NOT NULL
), duplicates AS (
  SELECT id
  FROM ranked_signal_tasks
  WHERE duplicate_rank > 1
)
UPDATE public.financial_tasks AS task
SET
  status = CASE
    WHEN task.status IN ('open', 'in_progress', 'waiting') THEN 'dismissed'
    ELSE task.status
  END,
  dismissed_at = CASE
    WHEN task.status IN ('open', 'in_progress', 'waiting') THEN COALESCE(task.dismissed_at, now())
    ELSE task.dismissed_at
  END,
  updated_at = now(),
  metadata = COALESCE(task.metadata, '{}'::jsonb) || jsonb_build_object(
    'resolution', 'duplicate_signal_task',
    'resolved_by', '20260810_financial_task_idempotency'
  )
FROM duplicates
WHERE task.id = duplicates.id;

CREATE UNIQUE INDEX IF NOT EXISTS financial_tasks_signal_source_unique_idx
  ON public.financial_tasks (organization_id, source, source_id)
  WHERE source = 'signal'
    AND source_id IS NOT NULL
    AND status IN ('open', 'in_progress', 'waiting');

COMMIT;
