-- Read-only verification after repair-stage2-role-profile-isolation.sql.
BEGIN READ ONLY;
SELECT jsonb_pretty(jsonb_build_object(
 'rls',(SELECT jsonb_object_agg(c.relname,c.relrowsecurity) FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN('users','organizations','transactions','orders','token_transactions','feature_unlocks')),
 'policies',(SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'command',cmd,'roles',roles)
  ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='public'
  AND tablename IN('users','organizations','transactions','orders','token_transactions','feature_unlocks')),
 'active_identity_functions',(SELECT jsonb_agg(jsonb_build_object(
  'signature',p.oid::regprocedure::text,'security_definer',p.prosecdef,
  'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
  'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')) ORDER BY p.proname)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='booksmart_stage1' AND p.proname IN('identity_is_active','is_admin','is_approved_cpa','cpa_has_client')),
 'client_schema_create',(SELECT jsonb_build_object(
  'anon',has_schema_privilege('anon','booksmart_stage1','CREATE'),
  'authenticated',has_schema_privilege('authenticated','booksmart_stage1','CREATE')))
)) AS stage2_verification;
ROLLBACK;
