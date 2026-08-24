-- A Jobber disconnect is a permanent organization-scoped purge.
-- Canonical accounting transactions and non-Jobber documents are untouched.
BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_jobber_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('booksmart.jobber_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Jobber audit events are append-only';
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_jobber_organization_data(requested_organization_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_records INTEGER := 0;
  deleted_assignments INTEGER := 0;
  deleted_matches INTEGER := 0;
  deleted_signals INTEGER := 0;
  deleted_tasks INTEGER := 0;
  deleted_connections INTEGER := 0;
BEGIN
  PERFORM set_config('booksmart.jobber_purge', 'on', true);

  WITH jobber_signals AS (
    SELECT id FROM public.business_signals
    WHERE organization_id = requested_organization_id
      AND (signal_key LIKE 'jobber:%'
        OR signal_key LIKE 'contractor:job-margin:%'
        OR signal_key IN ('contractor:overdue-receivables','contractor:completed-jobs-outstanding',
          'contractor:receivable-concentration','contractor:matches-needing-confirmation'))
  ), removed AS (
    DELETE FROM public.financial_tasks
    WHERE organization_id = requested_organization_id
      AND source = 'signal'
      AND source_id IN (SELECT id::text FROM jobber_signals)
    RETURNING id
  ) SELECT count(*) INTO deleted_tasks FROM removed;

  WITH removed AS (
    DELETE FROM public.business_signals
    WHERE organization_id = requested_organization_id
      AND (signal_key LIKE 'jobber:%'
        OR signal_key LIKE 'contractor:job-margin:%'
        OR signal_key IN ('contractor:overdue-receivables','contractor:completed-jobs-outstanding',
          'contractor:receivable-concentration','contractor:matches-needing-confirmation'))
    RETURNING id
  ) SELECT count(*) INTO deleted_signals FROM removed;

  WITH removed AS (
    DELETE FROM public.contractor_job_cost_assignments
    WHERE organization_id = requested_organization_id RETURNING id
  ) SELECT count(*) INTO deleted_assignments FROM removed;

  WITH removed AS (
    DELETE FROM public.contractor_financial_matches
    WHERE organization_id = requested_organization_id RETURNING id
  ) SELECT count(*) INTO deleted_matches FROM removed;

  DELETE FROM public.contractor_source_links
  WHERE organization_id = requested_organization_id
    AND (left_provider = 'jobber' OR right_provider = 'jobber');
  DELETE FROM public.jobber_cpa_sharing_settings WHERE organization_id = requested_organization_id;
  DELETE FROM public.jobber_oauth_states WHERE organization_id = requested_organization_id;
  DELETE FROM public.jobber_audit_events WHERE organization_id = requested_organization_id;

  SELECT count(*) INTO deleted_records FROM public.jobber_records
  WHERE organization_id = requested_organization_id;
  WITH removed AS (
    DELETE FROM public.jobber_connections
    WHERE organization_id = requested_organization_id RETURNING id
  ) SELECT count(*) INTO deleted_connections FROM removed;

  RETURN jsonb_build_object(
    'deleted_records', deleted_records,
    'deleted_assignments', deleted_assignments,
    'deleted_matches', deleted_matches,
    'deleted_signals', deleted_signals,
    'deleted_tasks', deleted_tasks,
    'deleted_connections', deleted_connections
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_jobber_organization_data(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_jobber_organization_data(BIGINT) TO service_role;

COMMIT;
