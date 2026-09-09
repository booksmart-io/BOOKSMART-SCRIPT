-- Read-only checks AFTER approved application. No customer records returned.
BEGIN READ ONLY;
SELECT 'table_rls' AS check_type, c.relname AS object_name,
       c.relrowsecurity AS enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('users','organizations','transactions');

-- Expected: anon_execute=false, authenticated_execute=false, service_execute=true.
SELECT p.oid::regprocedure::text AS function_name,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('apply_token_purchase','refund_token_purchase');
ROLLBACK;
