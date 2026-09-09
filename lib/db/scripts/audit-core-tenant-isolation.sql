-- Read-only metadata only: one result row so the editor does not hide earlier results.
-- Export the result as CSV. Does not retrieve customer records or credentials.
BEGIN READ ONLY;
SELECT jsonb_pretty(jsonb_build_object(
  'columns', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT table_name,column_name,data_type,is_nullable,column_default,is_identity
    FROM information_schema.columns WHERE table_schema='public'
      AND table_name IN ('users','organizations','transactions','cpa_client_access')
    ORDER BY table_name,ordinal_position
  ) x),
  'constraints', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT c.conrelid::regclass::text AS table_name,c.conname,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c WHERE c.conrelid IN
      ('public.users'::regclass,'public.organizations'::regclass,'public.transactions'::regclass)
  ) x),
  'triggers', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT tgrelid::regclass::text AS table_name,tgname,pg_get_triggerdef(oid) AS definition
    FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN
      ('public.users'::regclass,'public.organizations'::regclass,'public.transactions'::regclass)
  ) x),
  'roles', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT rolname,rolsuper,rolbypassrls FROM pg_roles
    WHERE rolname IN ('postgres','anon','authenticated','service_role')
  ) x),
  'memberships', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT member_role.rolname AS member,parent_role.rolname AS parent
    FROM pg_auth_members m JOIN pg_roles member_role ON member_role.oid=m.member
    JOIN pg_roles parent_role ON parent_role.oid=m.roleid
    WHERE member_role.rolname IN ('anon','authenticated')
  ) x),
  'public_tables', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT c.relname,c.relrowsecurity,pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
  ) x),
  'policies', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT * FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('users','organizations','transactions','cpa_client_access')
  ) x),
  'definer_functions', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT p.oid::regprocedure::text AS function_name,pg_get_userbyid(p.proowner) AS owner,
      p.proconfig AS settings,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
  ) x)
)) AS security_metadata;
ROLLBACK;
