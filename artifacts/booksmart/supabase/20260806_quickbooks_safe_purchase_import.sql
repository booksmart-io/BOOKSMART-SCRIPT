-- Safe, idempotent promotion of reviewed QuickBooks purchases.
-- The database function is the only importer: it verifies ownership, locks staged
-- rows, and inserts each QuickBooks source record at most once.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS quickbooks_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS quickbooks_external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_quickbooks_source_key
  ON public.transactions (org_id, quickbooks_entity_type, quickbooks_external_id)
  WHERE quickbooks_entity_type IS NOT NULL AND quickbooks_external_id IS NOT NULL;

ALTER TABLE public.quickbooks_staged_entities
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_transaction_id BIGINT;

ALTER TABLE public.quickbooks_staged_entities
  DROP CONSTRAINT IF EXISTS quickbooks_staged_entities_import_status_check;

ALTER TABLE public.quickbooks_staged_entities
  ADD CONSTRAINT quickbooks_staged_entities_import_status_check
  CHECK (import_status IN ('staged', 'approved', 'rejected', 'imported'));

CREATE OR REPLACE FUNCTION public.import_approved_quickbooks_purchases(
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
  did_insert BOOLEAN;
BEGIN
  IF requested_staged_ids IS NULL
     OR cardinality(requested_staged_ids) < 1
     OR cardinality(requested_staged_ids) > 100 THEN
    RAISE EXCEPTION 'Select between 1 and 100 approved records';
  END IF;

  SELECT u.id
    INTO owner_user_id
    FROM public.organizations o
    JOIN public.users u ON u.id = o.owner_id
   WHERE o.id = requested_organization_id
     AND u.auth_id = requested_auth_user_id;

  IF owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  imported_count := 0;
  skipped_count := 0;

  FOR staged_record IN
    SELECT q.*
      FROM public.quickbooks_staged_entities q
     WHERE q.organization_id = requested_organization_id
       AND q.id = ANY(requested_staged_ids)
     FOR UPDATE
  LOOP
    -- Start conservatively: purchases are cash expenses. Other QuickBooks types
    -- can overlap each other and must remain staged for a later mapping workflow.
    IF staged_record.import_status <> 'approved'
       OR staged_record.entity_type <> 'Purchase'
       OR staged_record.transaction_date IS NULL
       OR staged_record.total_amount IS NULL
       OR staged_record.total_amount <= 0 THEN
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    transaction_id := NULL;
    did_insert := FALSE;

    INSERT INTO public.transactions (
      user_id, org_id, title, amount, type, deductible, description, date_time,
      quickbooks_entity_type, quickbooks_external_id
    ) VALUES (
      owner_user_id,
      requested_organization_id,
      COALESCE(NULLIF(staged_record.display_name, ''), 'QuickBooks purchase ' || staged_record.external_id),
      -ABS(staged_record.total_amount),
      'Business',
      TRUE,
      'Imported from QuickBooks Purchase ' || staged_record.external_id,
      staged_record.transaction_date::TIMESTAMPTZ,
      staged_record.entity_type,
      staged_record.external_id
    )
    ON CONFLICT (org_id, quickbooks_entity_type, quickbooks_external_id)
      WHERE quickbooks_entity_type IS NOT NULL AND quickbooks_external_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO transaction_id;

    did_insert := transaction_id IS NOT NULL;
    IF NOT did_insert THEN
      SELECT t.id INTO transaction_id
        FROM public.transactions t
       WHERE t.org_id = requested_organization_id
         AND t.quickbooks_entity_type = staged_record.entity_type
         AND t.quickbooks_external_id = staged_record.external_id;
    END IF;

    IF transaction_id IS NULL THEN
      RAISE EXCEPTION 'Could not resolve imported transaction';
    END IF;

    UPDATE public.quickbooks_staged_entities
       SET import_status = 'imported',
           imported_at = COALESCE(imported_at, now()),
           imported_transaction_id = transaction_id
     WHERE id = staged_record.id
       AND organization_id = requested_organization_id;

    IF did_insert THEN
      imported_count := imported_count + 1;
    ELSE
      skipped_count := skipped_count + 1;
    END IF;
  END LOOP;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.import_approved_quickbooks_purchases(BIGINT, UUID, BIGINT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_approved_quickbooks_purchases(BIGINT, UUID, BIGINT[]) TO service_role;
