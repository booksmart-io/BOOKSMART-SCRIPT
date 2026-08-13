-- BookSmart monitoring foundation hardening.
-- Additive and backward-compatible: no accounting, document, Plaid,
-- QuickBooks, report, or CPA-access records are changed by this migration.

BEGIN;

ALTER TABLE public.business_signals
  ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comparison_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comparison_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cpa_review_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- `open` is retained for compatibility with the existing monitoring API.
-- `active` is accepted so future workers can adopt the directive terminology
-- without requiring another destructive constraint replacement.
ALTER TABLE public.business_signals
  DROP CONSTRAINT IF EXISTS business_signals_status_check;
ALTER TABLE public.business_signals
  ADD CONSTRAINT business_signals_status_check
  CHECK (status IN ('open', 'active', 'resolved', 'dismissed', 'expired'));

ALTER TABLE public.financial_tasks
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

ALTER TABLE public.financial_tasks
  DROP CONSTRAINT IF EXISTS financial_tasks_source_check;
ALTER TABLE public.financial_tasks
  ADD CONSTRAINT financial_tasks_source_check
  CHECK (source IN (
    'signal', 'bookkeeping', 'document', 'tax_calendar',
    'user', 'cpa', 'system'
  ));

CREATE INDEX IF NOT EXISTS business_signals_org_category_status_idx
  ON public.business_signals (organization_id, category, status, severity);

CREATE INDEX IF NOT EXISTS business_signals_cpa_review_idx
  ON public.business_signals (organization_id, cpa_review_level, status)
  WHERE requires_cpa_review = true;

CREATE INDEX IF NOT EXISTS business_signals_last_evaluated_idx
  ON public.business_signals (organization_id, last_evaluated_at DESC);

ALTER TABLE public.business_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_signals FROM anon, authenticated;
REVOKE ALL ON public.financial_tasks FROM anon, authenticated;

COMMIT;
