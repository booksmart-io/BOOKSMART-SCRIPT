-- DEVELOPMENT REVIEW DRAFT. Not a whole-database security certification.
-- Read BOOKSMART_CORE_SECURITY_REPAIR.md before applying. Run as postgres.
-- Replaces policies on three tables and restricts two legacy billing functions.
-- CPA access fails closed until
-- separately reviewed grants are entered into the private allowlist.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run reviewed migration as postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated')
             AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unsafe client role attributes';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
             WHERE r.rolname IN ('anon','authenticated')) THEN
    RAISE EXCEPTION 'Client role inherits another role; audit inherited privileges first';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
             WHERE c.oid IN ('public.users'::regclass,'public.organizations'::regclass,
                            'public.transactions'::regclass) AND r.rolname <> 'postgres') THEN
    RAISE EXCEPTION 'Unexpected table owner; review before migration';
  END IF;
  IF EXISTS (SELECT auth_id FROM public.users WHERE auth_id IS NOT NULL
             GROUP BY auth_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate auth identities must be resolved by an administrator';
  END IF;
END $$;

-- The exported legacy billing functions trust their arguments, not the caller.
-- Revoke PUBLIC as well as explicit client grants, including unknown overloads.
-- Only the reviewed signatures are enabled for trusted backend calls.
DO $$
DECLARE f record;
BEGIN
  IF to_regprocedure('public.apply_token_purchase(uuid,integer,text,text,text,text,text)') IS NULL
     OR to_regprocedure('public.refund_token_purchase(uuid,integer,text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Expected billing signatures missing; re-audit before applying';
  END IF;
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('apply_token_purchase','refund_token_purchase') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION
  public.apply_token_purchase(uuid,integer,text,text,text,text,text),
  public.refund_token_purchase(uuid,integer,text,text,text,text,text)
TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS core_users_auth_identity_unique
  ON public.users(auth_id) WHERE auth_id IS NOT NULL;

-- Private schema: do NOT add to Supabase exposed schemas.
CREATE SCHEMA IF NOT EXISTS booksmart_security AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA booksmart_security FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA booksmart_security TO authenticated;

-- Deliberately independent of unverified public orders/CPA triggers.
-- No automatic backfill. Only the database administrator manages these grants.
CREATE TABLE IF NOT EXISTS booksmart_security.cpa_org_reads (
  cpa_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id bigint NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (cpa_id, organization_id)
);
REVOKE ALL ON booksmart_security.cpa_org_reads FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE booksmart_security.cpa_org_reads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION booksmart_security.user_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET row_security = off
AS $$ SELECT id FROM public.users WHERE auth_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION booksmart_security.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET row_security = off
AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE auth_id=auth.uid() AND role='admin') $$;

CREATE OR REPLACE FUNCTION booksmart_security.cpa_reads(target_org bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM booksmart_security.cpa_org_reads a
    JOIN public.users u ON u.id=a.cpa_id
    JOIN public.organizations o ON o.id=a.organization_id AND o.owner_id=a.client_id
    WHERE u.auth_id=auth.uid() AND u.role='cpa'
      AND lower(trim(coalesce(u.verification_status,'')))='approved'
      AND a.organization_id=target_org
  )
$$;

-- Invoker trigger: backend service_role and postgres retain trusted writes.
-- All unlisted profile fields, including future columns, are immutable to clients.
CREATE OR REPLACE FUNCTION booksmart_security.guard_client_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE editable text[] := ARRAY[
  'first_name','middle_name','last_name','phone_number','img_url','updated_at',
  'certifications','license_number','career_start_date','professional_bio',
  'specialties','state_focuses','certification_proof_url','license_copy_url','terms_agreed',
  'active_org_id'
];
BEGIN
  IF current_user NOT IN ('postgres','service_role') THEN
    IF TG_TABLE_NAME='users' THEN
      IF NEW.active_org_id IS DISTINCT FROM OLD.active_org_id
         AND NEW.active_org_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.organizations o WHERE o.id=NEW.active_org_id
             AND (o.owner_id=booksmart_security.user_id() OR booksmart_security.is_admin()
                  OR booksmart_security.cpa_reads(o.id))
         ) THEN
        RAISE EXCEPTION 'Active organization is not authorized' USING ERRCODE='42501';
      END IF;
    END IF;
    IF TG_TABLE_NAME='users' AND
       (to_jsonb(NEW)-editable) IS DISTINCT FROM (to_jsonb(OLD)-editable) THEN
      RAISE EXCEPTION 'Protected profile fields cannot be changed directly' USING ERRCODE='42501';
    ELSIF TG_TABLE_NAME='organizations' AND
       ((to_jsonb(NEW)->'id') IS DISTINCT FROM (to_jsonb(OLD)->'id') OR
        (to_jsonb(NEW)->'owner_id') IS DISTINCT FROM (to_jsonb(OLD)->'owner_id')) THEN
      RAISE EXCEPTION 'Organization identity and ownership are immutable' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA booksmart_security FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION booksmart_security.user_id(),booksmart_security.is_admin(),
  booksmart_security.cpa_reads(bigint) TO authenticated;

DROP TRIGGER IF EXISTS core_guard_user_update ON public.users;
CREATE TRIGGER core_guard_user_update BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION booksmart_security.guard_client_update();
DROP TRIGGER IF EXISTS core_guard_org_update ON public.organizations;
CREATE TRIGGER core_guard_org_update BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION booksmart_security.guard_client_update();

DO $$
DECLARE p record; g record; tbl text;
BEGIN
  FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('users','organizations','transactions') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY['users','organizations','transactions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',tbl);
  END LOOP;
  -- Table revokes do not remove separate column grants.
  FOR g IN SELECT table_name,grantee,column_name,privilege_type
    FROM information_schema.column_privileges WHERE table_schema='public'
    AND table_name IN ('users','organizations','transactions')
    AND grantee IN ('PUBLIC','anon','authenticated') LOOP
    EXECUTE format('REVOKE %s (%I) ON TABLE public.%I FROM %s',
      g.privilege_type,g.column_name,g.table_name,
      CASE WHEN g.grantee='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(g.grantee) END);
  END LOOP;
END $$;

-- Profile creation/deletion and account linking use the verified backend.
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations,public.transactions TO authenticated;

CREATE POLICY core_users_read ON public.users FOR SELECT TO authenticated
USING (auth_id=auth.uid() OR booksmart_security.is_admin());
CREATE POLICY core_users_update ON public.users FOR UPDATE TO authenticated
USING (auth_id=auth.uid()) WITH CHECK (auth_id=auth.uid());

CREATE POLICY core_org_read ON public.organizations FOR SELECT TO authenticated
USING (owner_id=booksmart_security.user_id() OR booksmart_security.is_admin()
       OR booksmart_security.cpa_reads(id));
CREATE POLICY core_org_insert ON public.organizations FOR INSERT TO authenticated
WITH CHECK (owner_id=booksmart_security.user_id());
CREATE POLICY core_org_update ON public.organizations FOR UPDATE TO authenticated
USING (owner_id=booksmart_security.user_id()) WITH CHECK (owner_id=booksmart_security.user_id());
CREATE POLICY core_org_delete ON public.organizations FOR DELETE TO authenticated
USING (owner_id=booksmart_security.user_id());

CREATE POLICY core_tx_read ON public.transactions FOR SELECT TO authenticated
USING (booksmart_security.is_admin() OR booksmart_security.cpa_reads(org_id) OR EXISTS (
  SELECT 1 FROM public.organizations o WHERE o.id=org_id AND o.owner_id=booksmart_security.user_id()
));
CREATE POLICY core_tx_insert ON public.transactions FOR INSERT TO authenticated
WITH CHECK (user_id=booksmart_security.user_id() AND EXISTS (SELECT 1 FROM public.organizations o
  WHERE o.id=org_id AND o.owner_id=booksmart_security.user_id()));
CREATE POLICY core_tx_update ON public.transactions FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.organizations o
  WHERE o.id=org_id AND o.owner_id=booksmart_security.user_id()))
WITH CHECK (user_id=booksmart_security.user_id() AND EXISTS (SELECT 1 FROM public.organizations o
  WHERE o.id=org_id AND o.owner_id=booksmart_security.user_id()));
CREATE POLICY core_tx_delete ON public.transactions FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.organizations o
  WHERE o.id=org_id AND o.owner_id=booksmart_security.user_id()));

-- Serial IDs need sequence USAGE, never UPDATE/setval, for ordinary inserts.
DO $$
DECLARE tbl text; seq text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['users','organizations','transactions'] LOOP
    seq := pg_get_serial_sequence('public.'||tbl,'id');
    IF seq IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated',seq);
      IF tbl <> 'users' THEN EXECUTE format('GRANT USAGE ON SEQUENCE %s TO authenticated',seq); END IF;
    END IF;
  END LOOP;
END $$;
COMMIT;
