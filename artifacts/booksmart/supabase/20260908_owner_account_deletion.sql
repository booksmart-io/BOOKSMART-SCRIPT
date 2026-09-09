-- Atomic database portion of owner self-service deletion. External provider,
-- billing, Storage and Auth cleanup are orchestrated by the authenticated API.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_owner_account_data(requested_auth_id UUID)
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
    WHERE auth_id = requested_auth_id AND role = 'user' FOR UPDATE;
  IF target_user_id IS NULL THEN RAISE EXCEPTION 'ordinary owner account not found'; END IF;

  -- This newer operational table has restrictive references to both the owner
  -- and an organization child, so remove it before the organization cascade.
  IF to_regclass('public.jobber_expense_write_audit') IS NOT NULL THEN
    DELETE FROM public.jobber_expense_write_audit
      WHERE organization_id IN (SELECT id FROM public.organizations WHERE owner_id = target_user_id);
  END IF;

  -- Delete rows with activity-notification DELETE triggers while their parent
  -- organization still exists. The subsequent organization cascade removes
  -- both these temporary deletion notices and all earlier notifications.
  DELETE FROM public.contractor_job_cost_assignments
    WHERE organization_id IN (SELECT id FROM public.organizations WHERE owner_id = target_user_id);
  DELETE FROM public.transactions
    WHERE org_id IN (SELECT id FROM public.organizations WHERE owner_id = target_user_id);

  -- These tables use the Auth UUID rather than public.users.id.
  DELETE FROM public.token_transactions WHERE user_id = requested_auth_id;
  DELETE FROM public.feature_unlocks WHERE user_id = requested_auth_id;
  DELETE FROM public.subscriptions WHERE user_id = requested_auth_id;

  -- Existing reviewed foreign keys cascade owned organizations, transactions,
  -- provider data and documents. Any unexpected restrictive dependency aborts
  -- this whole function and rolls every statement back.
  DELETE FROM public.users WHERE id = target_user_id AND auth_id = requested_auth_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'account changed during deletion'; END IF;
  RETURN target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_owner_account_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_owner_account_data(UUID) TO service_role;

COMMIT;
