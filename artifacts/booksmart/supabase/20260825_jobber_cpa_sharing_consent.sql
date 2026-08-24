-- Owner-controlled consent for future CPA-visible Jobber escalation.
-- Default is disabled. This table does not create signals, tasks, notifications,
-- accounting records, or Jobber writes.
BEGIN;

CREATE TABLE IF NOT EXISTS public.jobber_cpa_sharing_settings (
  organization_id BIGINT PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  consented_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  consented_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((enabled = false) OR (consented_by_user_id IS NOT NULL AND consented_at IS NOT NULL))
);

ALTER TABLE public.jobber_cpa_sharing_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jobber_cpa_sharing_settings FROM anon, authenticated;

COMMIT;
