-- Read-only preflight. Run in Supabase SQL Editor as the database administrator.
-- Save all result sets before considering the repair; no customer rows returned.
BEGIN READ ONLY;

SELECT current_database() AS database_name, current_user AS audit_role;

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('transactions', 'organizations', 'users', 'cpa_client_access');

SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('transactions', 'organizations', 'users', 'cpa_client_access')
ORDER BY tablename, policyname;

SELECT grantee, privilege_type, is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND table_name = 'transactions'
ORDER BY grantee, privilege_type;

SELECT grantee, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'transactions'
ORDER BY grantee, column_name, privilege_type;

SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role');

SELECT p.oid::regprocedure AS function_name, p.prosecdef AS security_definer,
       p.proconfig AS settings, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'current_app_user_id', 'current_app_role', 'is_approved_cpa',
  'cpa_has_org_access', 'protect_user_security_fields'
);

SELECT tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE tgrelid = 'public.users'::regclass AND NOT tgisinternal;

-- Policy backup as executable DDL, for comparison and controlled recovery.
-- Do not blindly restore an insecure baseline after applying the repair.
SELECT format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
  policyname, schemaname, tablename, permissive, cmd,
  (SELECT string_agg(quote_ident(role_name::text), ', ') FROM unnest(roles) role_name),
  CASE WHEN qual IS NULL THEN '' ELSE format(' USING (%s)', qual) END,
  CASE WHEN with_check IS NULL THEN '' ELSE format(' WITH CHECK (%s)', with_check) END
) AS previous_policy_ddl
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'transactions';

ROLLBACK;
