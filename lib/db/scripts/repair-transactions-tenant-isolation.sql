-- REVIEW DRAFT: not applied to the remote database.
-- First inspect audit-transactions-tenant-isolation.sql results, particularly
-- trusted user identity/role helpers, CPA grants, and profile protections.
-- Preserves the access model in 20260728_phase_3_cpa_client_access.sql:
-- owner CRUD; admin and approved/engaged CPA reads; service-role processing.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regprocedure('public.current_app_user_id()') IS NULL
     OR to_regprocedure('public.current_app_role()') IS NULL
     OR to_regprocedure('public.cpa_has_org_access(bigint)') IS NULL THEN
    RAISE EXCEPTION 'Missing scoped identity/CPA helpers: review prerequisite migration first';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles
             WHERE rolname IN ('anon', 'authenticated') AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Client role bypasses RLS: stop and review role configuration';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
             WHERE c.oid = 'public.transactions'::regclass
               AND r.rolname IN ('anon', 'authenticated')) THEN
    RAISE EXCEPTION 'Client role owns transactions: stop and review ownership';
  END IF;
END;
$$;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Permissive policies are OR-combined. Replacing only a named policy can leave
-- a legacy broad policy active, so replace the complete policy set on this table.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'transactions'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.transactions', p.policyname);
  END LOOP;
END;
$$;

REVOKE ALL PRIVILEGES ON TABLE public.transactions FROM anon, PUBLIC;
-- Column grants survive table-level REVOKE; remove anonymous/public ones too.
DO $$
DECLARE g record;
BEGIN
  FOR g IN SELECT grantee, column_name, privilege_type
           FROM information_schema.column_privileges
           WHERE table_schema = 'public' AND table_name = 'transactions'
             AND grantee IN ('anon', 'PUBLIC')
  LOOP
    EXECUTE format('REVOKE %s (%I) ON TABLE public.transactions FROM %s',
      g.privilege_type, g.column_name,
      CASE WHEN g.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(g.grantee) END);
  END LOOP;
END;
$$;
-- RLS does not constrain TRUNCATE. Browser roles need only normal row operations.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.transactions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions TO authenticated;

CREATE POLICY transactions_scoped_select ON public.transactions
FOR SELECT TO authenticated
USING (
  public.current_app_role() = 'admin'
  OR public.cpa_has_org_access(transactions.org_id)
  OR EXISTS (
    SELECT 1 FROM public.organizations AS org
    WHERE org.id = transactions.org_id AND org.owner_id = public.current_app_user_id()
  )
);

CREATE POLICY transactions_owner_insert ON public.transactions
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organizations AS org
  WHERE org.id = transactions.org_id AND org.owner_id = public.current_app_user_id()
));

CREATE POLICY transactions_owner_update ON public.transactions
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organizations AS org
  WHERE org.id = transactions.org_id AND org.owner_id = public.current_app_user_id()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organizations AS org
  WHERE org.id = transactions.org_id AND org.owner_id = public.current_app_user_id()
));

CREATE POLICY transactions_owner_delete ON public.transactions
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organizations AS org
  WHERE org.id = transactions.org_id AND org.owner_id = public.current_app_user_id()
));

COMMIT;
