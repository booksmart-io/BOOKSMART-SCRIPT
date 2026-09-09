-- Stage 1 DEVELOPMENT REVIEW DRAFT. Read BOOKSMART_STAGE1_SECURITY_REPAIR.md.
-- Protects writes/transaction reads; preserves existing users/organizations read policy state.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run reviewed migration as postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
             AND policyname IN ('core_tx_read','core_users_read','core_org_read')) THEN
    RAISE EXCEPTION 'Core repair already present; do not layer stage 1 over it';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner
             WHERE n.nspname='booksmart_stage1' AND r.rolname <> 'postgres') THEN
    RAISE EXCEPTION 'Unexpected private schema owner';
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

CREATE UNIQUE INDEX IF NOT EXISTS stage1_users_auth_identity_unique
  ON public.users(auth_id) WHERE auth_id IS NOT NULL;

-- Private schema: do NOT add to Supabase exposed schemas.
CREATE SCHEMA IF NOT EXISTS booksmart_stage1 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA booksmart_stage1 FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA booksmart_stage1 TO authenticated;

CREATE OR REPLACE FUNCTION booksmart_stage1.user_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET row_security = off
AS $$ SELECT id FROM public.users WHERE auth_id=auth.uid() $$;
CREATE OR REPLACE FUNCTION booksmart_stage1.owns_org(target_org bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET row_security = off
AS $$ SELECT EXISTS(SELECT 1 FROM public.organizations
WHERE id=target_org AND owner_id=booksmart_stage1.user_id()) $$;

-- Invoker trigger: backend service_role and postgres retain trusted writes.
-- All unlisted profile fields, including future columns, are immutable to clients.
CREATE OR REPLACE FUNCTION booksmart_stage1.guard_client_update()
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
      IF OLD.auth_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Cannot edit another profile' USING ERRCODE='42501';
      END IF;
      IF NEW.active_org_id IS DISTINCT FROM OLD.active_org_id
         AND NEW.active_org_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.organizations o WHERE o.id=NEW.active_org_id
             AND o.owner_id=booksmart_stage1.user_id()
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

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA booksmart_stage1 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION booksmart_stage1.user_id(),booksmart_stage1.owns_org(bigint) TO authenticated;

-- Guard organization writes even while its existing read policies remain unchanged.
CREATE OR REPLACE FUNCTION booksmart_stage1.guard_org_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF current_user NOT IN ('postgres','service_role') THEN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF TG_OP <> 'INSERT' AND OLD.owner_id IS DISTINCT FROM booksmart_stage1.user_id() THEN
   RAISE EXCEPTION 'Foreign organization write' USING ERRCODE='42501';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.owner_id IS DISTINCT FROM booksmart_stage1.user_id() THEN
   RAISE EXCEPTION 'Foreign organization ownership' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
   RAISE EXCEPTION 'Organization identity is immutable' USING ERRCODE='42501';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION booksmart_stage1.guard_org_write() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS stage1_guard_org_write ON public.organizations;
CREATE TRIGGER stage1_guard_org_write BEFORE INSERT OR UPDATE OR DELETE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION booksmart_stage1.guard_org_write();

DROP TRIGGER IF EXISTS stage1_guard_user_update ON public.users;
CREATE TRIGGER stage1_guard_user_update BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION booksmart_stage1.guard_client_update();
DROP TRIGGER IF EXISTS stage1_guard_org_update ON public.organizations;
CREATE TRIGGER stage1_guard_org_update BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION booksmart_stage1.guard_client_update();

DO $$
DECLARE p record; g record; tbl text;
BEGIN
  FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
    AND tablename='transactions' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY['users','organizations','transactions'] LOOP
    IF tbl='transactions' THEN EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl); END IF;
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

-- Users and organizations retain their existing read/RLS policy state in this stage.
-- No CPA/admin bypass: direct transaction access requires both user and organization ownership.
CREATE POLICY stage1_tx_owner ON public.transactions FOR ALL TO authenticated
USING (user_id=booksmart_stage1.user_id() AND booksmart_stage1.owns_org(org_id))
WITH CHECK (user_id=booksmart_stage1.user_id() AND booksmart_stage1.owns_org(org_id));

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
