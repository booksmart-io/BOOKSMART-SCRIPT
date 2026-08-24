-- Confirm an existing approved expense directly against a Jobber job. A
-- receipt is optional. This never creates or changes an accounting transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.confirm_contractor_transaction_job_cost(
  requested_organization_id BIGINT,
  requested_auth_user_id UUID,
  requested_transaction_id BIGINT,
  requested_jobber_job_id TEXT
)
RETURNS TABLE(assignment_id BIGINT, assigned_amount NUMERIC, source_provider TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  owner_user_id BIGINT;
  transaction_row public.transactions%ROWTYPE;
  provider TEXT;
  suggested_match public.contractor_financial_matches%ROWTYPE;
  new_assignment_id BIGINT;
BEGIN
  SELECT u.id INTO owner_user_id
    FROM public.organizations o JOIN public.users u ON u.id = o.owner_id
   WHERE o.id = requested_organization_id AND u.auth_id = requested_auth_user_id;
  IF owner_user_id IS NULL THEN RAISE EXCEPTION 'Organization not found'; END IF;

  SELECT * INTO transaction_row FROM public.transactions t
   WHERE t.id = requested_transaction_id AND t.org_id = requested_organization_id;
  IF transaction_row.id IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF transaction_row.pending IS TRUE THEN RAISE EXCEPTION 'Pending transactions cannot be assigned'; END IF;
  IF transaction_row.amount >= 0 THEN RAISE EXCEPTION 'Only expense transactions can be assigned'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.jobber_records j
     WHERE j.organization_id = requested_organization_id AND j.object_type = 'jobs'
       AND j.external_id = requested_jobber_job_id AND j.is_archived = false
  ) THEN RAISE EXCEPTION 'Jobber job not found'; END IF;

  provider := CASE WHEN transaction_row.quickbooks_external_id IS NOT NULL THEN 'quickbooks'
                   WHEN transaction_row.plaid_transaction_id IS NOT NULL THEN 'plaid' ELSE 'booksmart' END;
  SELECT * INTO suggested_match FROM public.contractor_financial_matches m
   WHERE m.organization_id = requested_organization_id AND m.source_provider = provider
     AND m.source_record_type = 'transaction' AND m.source_record_id = requested_transaction_id::text
     AND m.jobber_job_id = requested_jobber_job_id AND m.status = 'suggested';
  IF suggested_match.id IS NULL THEN RAISE EXCEPTION 'Transaction job-cost suggestion not found'; END IF;

  UPDATE public.contractor_financial_matches SET
    confidence = 'confirmed', requires_confirmation = false, status = 'confirmed',
    confirmed_by = owner_user_id, confirmed_at = now(), updated_at = now(),
    match_reasons = match_reasons || '["owner_confirmed"]'::jsonb
   WHERE id = suggested_match.id AND organization_id = requested_organization_id;

  INSERT INTO public.contractor_job_cost_assignments (
    organization_id, match_id, jobber_job_id, source_provider, source_record_type,
    source_record_id, amount, confidence
  ) VALUES (
    requested_organization_id, suggested_match.id, requested_jobber_job_id, provider,
    'transaction', requested_transaction_id::text, abs(transaction_row.amount), 'confirmed'
  ) ON CONFLICT (organization_id, source_provider, source_record_type, source_record_id)
  DO UPDATE SET match_id = EXCLUDED.match_id, jobber_job_id = EXCLUDED.jobber_job_id,
    amount = EXCLUDED.amount, confidence = 'confirmed'
  RETURNING id INTO new_assignment_id;

  RETURN QUERY SELECT new_assignment_id, abs(transaction_row.amount), provider;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_contractor_transaction_job_cost(BIGINT, UUID, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_contractor_transaction_job_cost(BIGINT, UUID, BIGINT, TEXT) TO service_role;

COMMIT;
