-- Allow an owner to remove a confirmed transaction-to-job projection without
-- deleting or changing the canonical accounting transaction or any receipt.
BEGIN;

ALTER TABLE public.contractor_financial_matches
  ADD COLUMN IF NOT EXISTS removed_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.remove_contractor_transaction_job_cost(
  requested_organization_id BIGINT,
  requested_auth_user_id UUID,
  requested_assignment_id BIGINT
)
RETURNS TABLE(removed_assignment_id BIGINT, transaction_id TEXT, jobber_job_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  owner_user_id BIGINT;
  assignment_row public.contractor_job_cost_assignments%ROWTYPE;
BEGIN
  SELECT u.id INTO owner_user_id
    FROM public.organizations o JOIN public.users u ON u.id = o.owner_id
   WHERE o.id = requested_organization_id AND u.auth_id = requested_auth_user_id;
  IF owner_user_id IS NULL THEN RAISE EXCEPTION 'Organization not found'; END IF;

  SELECT * INTO assignment_row FROM public.contractor_job_cost_assignments a
   WHERE a.id = requested_assignment_id AND a.organization_id = requested_organization_id
     AND a.source_record_type = 'transaction';
  IF assignment_row.id IS NULL THEN RAISE EXCEPTION 'Job cost assignment not found'; END IF;

  UPDATE public.contractor_financial_matches SET
    status = 'suggested', confidence = 'high', requires_confirmation = true,
    removed_by = owner_user_id, removed_at = now(), updated_at = now()
   WHERE id = assignment_row.match_id AND organization_id = requested_organization_id;

  DELETE FROM public.contractor_job_cost_assignments
   WHERE id = assignment_row.id AND organization_id = requested_organization_id;

  RETURN QUERY SELECT assignment_row.id, assignment_row.source_record_id, assignment_row.jobber_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_contractor_transaction_job_cost(BIGINT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_contractor_transaction_job_cost(BIGINT, UUID, BIGINT) TO service_role;

COMMIT;
