-- Ensure every confirmed contractor job-cost assignment is traceable to a
-- same-organization match. Existing null match IDs remain readable; all new
-- confirmations save the authorizing match ID.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contractor_financial_matches_org_id_id_key'
      AND conrelid = 'public.contractor_financial_matches'::regclass
  ) THEN
    ALTER TABLE public.contractor_financial_matches
      ADD CONSTRAINT contractor_financial_matches_org_id_id_key UNIQUE (organization_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contractor_job_cost_assignments_org_match_fkey'
      AND conrelid = 'public.contractor_job_cost_assignments'::regclass
  ) THEN
    ALTER TABLE public.contractor_job_cost_assignments
      ADD CONSTRAINT contractor_job_cost_assignments_org_match_fkey
      FOREIGN KEY (organization_id, match_id)
      REFERENCES public.contractor_financial_matches (organization_id, id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_contractor_receipt_job_cost(
  requested_organization_id BIGINT,
  requested_auth_user_id UUID,
  requested_receipt_source_id TEXT,
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
  confirmed_match_id BIGINT;
  new_assignment_id BIGINT;
BEGIN
  SELECT u.id INTO owner_user_id
    FROM public.organizations o JOIN public.users u ON u.id = o.owner_id
   WHERE o.id = requested_organization_id AND u.auth_id = requested_auth_user_id;
  IF owner_user_id IS NULL THEN RAISE EXCEPTION 'Organization not found'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contractor_receipt_extractions r WHERE r.organization_id = requested_organization_id AND r.source_id = requested_receipt_source_id) THEN
    RAISE EXCEPTION 'Receipt extraction not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jobber_records j WHERE j.organization_id = requested_organization_id AND j.object_type = 'jobs' AND j.external_id = requested_jobber_job_id AND j.is_archived = false) THEN
    RAISE EXCEPTION 'Jobber job not found';
  END IF;
  SELECT * INTO transaction_row FROM public.transactions t
   WHERE t.id = requested_transaction_id AND t.org_id = requested_organization_id;
  IF transaction_row.id IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF transaction_row.pending IS TRUE THEN RAISE EXCEPTION 'Pending transactions cannot be assigned'; END IF;
  IF transaction_row.amount >= 0 THEN RAISE EXCEPTION 'Only expense transactions can be assigned'; END IF;
  provider := CASE WHEN transaction_row.quickbooks_external_id IS NOT NULL THEN 'quickbooks'
                   WHEN transaction_row.plaid_transaction_id IS NOT NULL THEN 'plaid' ELSE 'booksmart' END;

  INSERT INTO public.contractor_financial_matches (
    organization_id, source_provider, source_record_type, source_record_id, jobber_job_id,
    confidence, score, match_reasons, source_ids, requires_confirmation, status,
    calculation_version, confirmed_by, confirmed_at, updated_at
  ) VALUES (
    requested_organization_id, 'receipt', 'contractor_receipt_extraction', requested_receipt_source_id, requested_jobber_job_id,
    'confirmed', 100, '["owner_confirmed"]'::jsonb,
    jsonb_build_array(requested_receipt_source_id, requested_jobber_job_id), false, 'confirmed',
    'contractor-job-match-v1', owner_user_id, now(), now()
  ) ON CONFLICT (organization_id, source_provider, source_record_type, source_record_id)
  DO UPDATE SET jobber_job_id = EXCLUDED.jobber_job_id, confidence = 'confirmed', score = 100,
    match_reasons = EXCLUDED.match_reasons, source_ids = EXCLUDED.source_ids, requires_confirmation = false,
    status = 'confirmed', confirmed_by = owner_user_id, confirmed_at = now(), updated_at = now()
  RETURNING id INTO confirmed_match_id;

  INSERT INTO public.contractor_source_links (
    organization_id, left_provider, left_record_type, left_record_id, right_provider,
    right_record_type, right_record_id, confidence, score, match_reasons,
    requires_confirmation, status, calculation_version, confirmed_by, confirmed_at, updated_at
  ) VALUES (
    requested_organization_id, 'receipt', 'contractor_receipt_extraction', requested_receipt_source_id, provider,
    'transaction', requested_transaction_id::text, 'high', 100, '["owner_confirmed"]'::jsonb,
    false, 'confirmed', 'receipt-transaction-match-v1', owner_user_id, now(), now()
  ) ON CONFLICT (organization_id, left_provider, left_record_type, left_record_id, right_provider, right_record_type, right_record_id)
  DO UPDATE SET confidence = 'high', score = 100, match_reasons = EXCLUDED.match_reasons,
    requires_confirmation = false, status = 'confirmed', confirmed_by = owner_user_id,
    confirmed_at = now(), updated_at = now();

  INSERT INTO public.contractor_job_cost_assignments (
    organization_id, match_id, jobber_job_id, source_provider, source_record_type,
    source_record_id, amount, confidence
  ) VALUES (
    requested_organization_id, confirmed_match_id, requested_jobber_job_id, provider, 'transaction',
    requested_transaction_id::text, abs(transaction_row.amount), 'confirmed'
  ) ON CONFLICT (organization_id, source_provider, source_record_type, source_record_id)
  DO UPDATE SET match_id = EXCLUDED.match_id, jobber_job_id = EXCLUDED.jobber_job_id,
    amount = EXCLUDED.amount, confidence = 'confirmed'
  RETURNING id INTO new_assignment_id;

  RETURN QUERY SELECT new_assignment_id, abs(transaction_row.amount), provider;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_contractor_receipt_job_cost(BIGINT, UUID, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_contractor_receipt_job_cost(BIGINT, UUID, TEXT, BIGINT, TEXT) TO service_role;

COMMIT;
