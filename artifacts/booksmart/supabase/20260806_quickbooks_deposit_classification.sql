-- Require a truthful classification before a QuickBooks Deposit can be approved.
ALTER TABLE public.quickbooks_staged_entities
  ADD COLUMN IF NOT EXISTS deposit_classification TEXT
  CHECK (deposit_classification IS NULL OR deposit_classification IN (
    'business_income', 'bank_transfer', 'loan_proceeds', 'owner_contribution',
    'customer_payment', 'refund', 'non_business'
  ));

-- Deposits approved under the earlier review-only behavior were not imported.
-- Return them to review so "approved" consistently means an outcome was applied.
UPDATE public.quickbooks_staged_entities
   SET import_status = 'staged'
 WHERE entity_type = 'Deposit'
   AND import_status = 'approved'
   AND imported_transaction_id IS NULL;

CREATE OR REPLACE FUNCTION public.import_approved_quickbooks_transactions(
  requested_organization_id BIGINT,
  requested_auth_user_id UUID,
  requested_staged_ids BIGINT[]
)
RETURNS TABLE(imported_count INTEGER, skipped_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_user_id INTEGER;
  staged_record public.quickbooks_staged_entities%ROWTYPE;
  transaction_id BIGINT;
  transaction_title TEXT;
  transaction_description TEXT;
  transaction_amount NUMERIC;
  did_insert BOOLEAN;
BEGIN
  IF requested_staged_ids IS NULL
     OR cardinality(requested_staged_ids) < 1
     OR cardinality(requested_staged_ids) > 100 THEN
    RAISE EXCEPTION 'Select between 1 and 100 approved records';
  END IF;

  SELECT u.id INTO owner_user_id
    FROM public.organizations o
    JOIN public.users u ON u.id = o.owner_id
   WHERE o.id = requested_organization_id
     AND u.auth_id = requested_auth_user_id;
  IF owner_user_id IS NULL THEN RAISE EXCEPTION 'Organization not found'; END IF;

  imported_count := 0;
  skipped_count := 0;

  FOR staged_record IN
    SELECT q.* FROM public.quickbooks_staged_entities q
     WHERE q.organization_id = requested_organization_id
       AND q.id = ANY(requested_staged_ids)
     FOR UPDATE
  LOOP
    IF staged_record.import_status <> 'approved'
       OR staged_record.transaction_date IS NULL
       OR staged_record.total_amount IS NULL
       OR staged_record.total_amount <= 0 THEN
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    IF staged_record.entity_type = 'Purchase' THEN
      transaction_amount := -ABS(staged_record.total_amount);
      transaction_title := COALESCE(NULLIF(staged_record.display_name, ''), 'QuickBooks purchase ' || staged_record.external_id);
      transaction_description := 'Imported from QuickBooks Purchase ' || staged_record.external_id;
    ELSIF staged_record.entity_type = 'Deposit' AND staged_record.deposit_classification = 'business_income' THEN
      transaction_amount := ABS(staged_record.total_amount);
      transaction_title := '[Revenue] ' || COALESCE(NULLIF(staged_record.display_name, ''), 'QuickBooks deposit ' || staged_record.external_id);
      transaction_description := 'Business income imported from QuickBooks Deposit ' || staged_record.external_id;
    ELSIF staged_record.entity_type = 'Deposit' AND staged_record.deposit_classification = 'bank_transfer' THEN
      transaction_amount := ABS(staged_record.total_amount);
      transaction_title := 'Internal transfer - QuickBooks deposit ' || staged_record.external_id;
      transaction_description := 'Bank transfer imported from QuickBooks; excluded from profit';
    ELSIF staged_record.entity_type = 'Deposit' AND staged_record.deposit_classification = 'loan_proceeds' THEN
      transaction_amount := ABS(staged_record.total_amount);
      transaction_title := '[Liability:Long-Term] [CF:Financing] Loan proceeds';
      transaction_description := 'Loan proceeds imported from QuickBooks Deposit ' || staged_record.external_id;
    ELSIF staged_record.entity_type = 'Deposit' AND staged_record.deposit_classification = 'owner_contribution' THEN
      transaction_amount := ABS(staged_record.total_amount);
      transaction_title := '[Equity] Owner contribution [CF:Financing]';
      transaction_description := 'Owner contribution imported from QuickBooks Deposit ' || staged_record.external_id;
    ELSE
      -- Customer payments and refunds require matching; non-business records are rejected.
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    transaction_id := NULL;
    INSERT INTO public.transactions (
      user_id, org_id, title, amount, type, deductible, description, date_time,
      quickbooks_entity_type, quickbooks_external_id
    ) VALUES (
      owner_user_id, requested_organization_id, transaction_title, transaction_amount,
      'Business', staged_record.entity_type = 'Purchase', transaction_description,
      staged_record.transaction_date::TIMESTAMPTZ, staged_record.entity_type, staged_record.external_id
    )
    ON CONFLICT (org_id, quickbooks_entity_type, quickbooks_external_id)
      WHERE quickbooks_entity_type IS NOT NULL AND quickbooks_external_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO transaction_id;

    did_insert := transaction_id IS NOT NULL;
    IF NOT did_insert THEN
      SELECT t.id INTO transaction_id FROM public.transactions t
       WHERE t.org_id = requested_organization_id
         AND t.quickbooks_entity_type = staged_record.entity_type
         AND t.quickbooks_external_id = staged_record.external_id;
    END IF;
    IF transaction_id IS NULL THEN RAISE EXCEPTION 'Could not resolve imported transaction'; END IF;

    UPDATE public.quickbooks_staged_entities
       SET import_status = 'imported', imported_at = COALESCE(imported_at, now()),
           imported_transaction_id = transaction_id
     WHERE id = staged_record.id AND organization_id = requested_organization_id;

    IF did_insert THEN imported_count := imported_count + 1;
    ELSE skipped_count := skipped_count + 1;
    END IF;
  END LOOP;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.import_approved_quickbooks_transactions(BIGINT, UUID, BIGINT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_approved_quickbooks_transactions(BIGINT, UUID, BIGINT[]) TO service_role;
