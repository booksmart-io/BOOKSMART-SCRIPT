-- Atomic database portion of CPA self-service deletion. Client organizations,
-- financial records and documents remain owned by and available to each client.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_cpa_account_data(requested_auth_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $$
DECLARE
  target_user_id BIGINT;
BEGIN
  IF requested_auth_id IS NULL THEN RAISE EXCEPTION 'auth identity required'; END IF;
  SELECT id INTO target_user_id FROM public.users
    WHERE auth_id = requested_auth_id AND role = 'cpa' FOR UPDATE;
  IF target_user_id IS NULL THEN RAISE EXCEPTION 'CPA account not found'; END IF;

  -- This operational audit uses a restrictive requester relationship. Removing
  -- CPA-authored operational rows allows the profile deletion to remain atomic.
  IF to_regclass('public.jobber_expense_write_audit') IS NOT NULL THEN
    DELETE FROM public.jobber_expense_write_audit WHERE requested_by = target_user_id;
  END IF;

  -- Existing reviewed relationships cascade CPA orders/access rows and set
  -- optional attribution/referral columns to NULL. Client-owned rows remain.
  DELETE FROM public.users
    WHERE id = target_user_id AND auth_id = requested_auth_id AND role = 'cpa';
  IF NOT FOUND THEN RAISE EXCEPTION 'account changed during deletion'; END IF;
  RETURN target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_cpa_account_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_cpa_account_data(UUID) TO service_role;

COMMIT;
