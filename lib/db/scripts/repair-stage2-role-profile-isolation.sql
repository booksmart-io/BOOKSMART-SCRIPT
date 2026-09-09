-- Stage 2: close profile/organization enumeration and invalidate disabled sessions at RLS.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$ BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run reviewed migration as postgres'; END IF;
 IF to_regclass('auth.users') IS NULL THEN RAISE EXCEPTION 'Supabase auth.users is required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='booksmart_stage1') THEN
  RAISE EXCEPTION 'Apply Stage 1 before Stage 2';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION booksmart_stage1.identity_is_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog SET row_security=off AS $$
 SELECT EXISTS(
  SELECT 1 FROM auth.users a
  WHERE a.id=auth.uid() AND a.deleted_at IS NULL
    AND (a.banned_until IS NULL OR a.banned_until<=now())
 )
$$;

CREATE OR REPLACE FUNCTION booksmart_stage1.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog SET row_security=off AS $$
 SELECT booksmart_stage1.identity_is_active() AND EXISTS(
  SELECT 1 FROM public.users u WHERE u.auth_id=auth.uid() AND u.role='admin'
 )
$$;

CREATE OR REPLACE FUNCTION booksmart_stage1.is_approved_cpa()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog SET row_security=off AS $$
 SELECT booksmart_stage1.identity_is_active() AND EXISTS(
  SELECT 1 FROM public.users u WHERE u.auth_id=auth.uid() AND u.role='cpa'
    AND lower(trim(coalesce(u.verification_status,'')))='approved'
 )
$$;

CREATE OR REPLACE FUNCTION booksmart_stage1.cpa_has_client(target_user bigint, require_financial_consent boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog SET row_security=off AS $$
 SELECT booksmart_stage1.is_approved_cpa() AND EXISTS(
  SELECT 1 FROM public.orders o
  JOIN public.users cpa ON cpa.id=o.cpa_id
  WHERE cpa.auth_id=auth.uid() AND o.user_id=target_user
    AND (NOT require_financial_consent OR (
      o.client_authorized AND o.status IN ('active','in_progress','in-progress')
    ))
 )
$$;

REVOKE ALL ON FUNCTION booksmart_stage1.identity_is_active(),booksmart_stage1.is_admin(),
 booksmart_stage1.is_approved_cpa(),booksmart_stage1.cpa_has_client(bigint,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION booksmart_stage1.identity_is_active(),booksmart_stage1.is_admin(),
 booksmart_stage1.is_approved_cpa(),booksmart_stage1.cpa_has_client(bigint,boolean)
 TO authenticated;

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies
  WHERE schemaname='public' AND tablename IN ('users','organizations') LOOP
  EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
 END LOOP;
END $$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY stage2_users_read ON public.users FOR SELECT TO authenticated USING (
 booksmart_stage1.identity_is_active() AND (
  auth_id=auth.uid() OR booksmart_stage1.is_admin()
  OR (role='cpa' AND lower(trim(coalesce(verification_status,'')))='approved')
  OR booksmart_stage1.cpa_has_client(id,false)
 )
);
CREATE POLICY stage2_users_update ON public.users FOR UPDATE TO authenticated
 USING(booksmart_stage1.identity_is_active() AND auth_id=auth.uid())
 WITH CHECK(booksmart_stage1.identity_is_active() AND auth_id=auth.uid());

CREATE POLICY stage2_org_read ON public.organizations FOR SELECT TO authenticated USING (
 booksmart_stage1.identity_is_active() AND (
  owner_id=booksmart_stage1.user_id() OR booksmart_stage1.is_admin()
  OR booksmart_stage1.cpa_has_client(owner_id,true)
 )
);
CREATE POLICY stage2_org_insert ON public.organizations FOR INSERT TO authenticated
 WITH CHECK(booksmart_stage1.identity_is_active() AND owner_id=booksmart_stage1.user_id());
CREATE POLICY stage2_org_update ON public.organizations FOR UPDATE TO authenticated
 USING(booksmart_stage1.identity_is_active() AND owner_id=booksmart_stage1.user_id())
 WITH CHECK(booksmart_stage1.identity_is_active() AND owner_id=booksmart_stage1.user_id());
CREATE POLICY stage2_org_delete ON public.organizations FOR DELETE TO authenticated
 USING(booksmart_stage1.identity_is_active() AND owner_id=booksmart_stage1.user_id());

-- Add the active-account condition to every Stage 1 client policy.
DROP POLICY IF EXISTS stage1_tx_owner ON public.transactions;
CREATE POLICY stage1_tx_owner ON public.transactions FOR ALL TO authenticated
 USING(booksmart_stage1.identity_is_active() AND user_id=booksmart_stage1.user_id() AND booksmart_stage1.owns_org(org_id))
 WITH CHECK(booksmart_stage1.identity_is_active() AND user_id=booksmart_stage1.user_id() AND booksmart_stage1.owns_org(org_id));

DROP POLICY IF EXISTS stage1_order_read ON public.orders;
CREATE POLICY stage1_order_read ON public.orders FOR SELECT TO authenticated USING (
 booksmart_stage1.identity_is_active() AND (user_id=booksmart_stage1.user_id() OR (
  cpa_id=booksmart_stage1.user_id() AND booksmart_stage1.is_approved_cpa()
 ))
);
DROP POLICY IF EXISTS stage1_order_request ON public.orders;
CREATE POLICY stage1_order_request ON public.orders FOR INSERT TO authenticated
 WITH CHECK(booksmart_stage1.identity_is_active() AND user_id=booksmart_stage1.user_id() AND status='pending' AND client_authorized);

DROP POLICY IF EXISTS stage1_ledger_read ON public.token_transactions;
CREATE POLICY stage1_ledger_read ON public.token_transactions FOR SELECT TO authenticated
 USING(booksmart_stage1.identity_is_active() AND user_id=auth.uid());
DROP POLICY IF EXISTS stage1_unlock_read ON public.feature_unlocks;
CREATE POLICY stage1_unlock_read ON public.feature_unlocks FOR SELECT TO authenticated
 USING(booksmart_stage1.identity_is_active() AND user_id=auth.uid());

COMMIT;
