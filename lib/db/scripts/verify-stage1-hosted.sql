-- Read-only hosted verification after both Stage 1 migrations.
BEGIN READ ONLY;
SELECT jsonb_pretty(jsonb_build_object(
  'rls', (SELECT jsonb_object_agg(c.relname,c.relrowsecurity) FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    AND c.relname IN ('transactions','orders','token_transactions','feature_unlocks')),
  'policies', (SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'command',cmd,'roles',roles)
    ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('transactions','orders','token_transactions','feature_unlocks')),
  'client_table_privileges', (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (
    SELECT table_name,grantee,privilege_type FROM information_schema.table_privileges
    WHERE table_schema='public' AND table_name IN ('users','organizations','transactions','orders','token_transactions','feature_unlocks')
    AND grantee IN ('PUBLIC','anon','authenticated') ORDER BY table_name,grantee,privilege_type) x),
  'client_column_privileges', (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (
    SELECT table_name,column_name,grantee,privilege_type FROM information_schema.column_privileges
    WHERE table_schema='public' AND table_name IN ('users','organizations','transactions','orders','token_transactions','feature_unlocks')
    AND grantee IN ('PUBLIC','anon','authenticated') ORDER BY table_name,column_name,grantee,privilege_type) x),
  'functions', (SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
    'security_definer',p.prosecdef,'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) ORDER BY p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
    (n.nspname='public' AND p.proname IN ('apply_token_purchase','refund_token_purchase','spend_tokens_atomic','set_cpa_order_authorization'))
    OR (n.nspname='booksmart_stage1' AND p.proname IN ('user_id','owns_org','guard_client_update','guard_org_write','guard_order_request'))),
  'legacy_orders_authorized', (SELECT count(*) FROM public.orders WHERE client_authorized),
  'orphan_transactions_preserved', (SELECT count(*) FROM public.transactions t
    LEFT JOIN public.organizations o ON o.id=t.org_id WHERE o.id IS NULL),
  'stage1_schema_exposed_to_clients', (SELECT jsonb_build_object(
    'anon_create',has_schema_privilege('anon','booksmart_stage1','CREATE'),
    'authenticated_create',has_schema_privilege('authenticated','booksmart_stage1','CREATE')))
)) AS stage1_verification;
ROLLBACK;
