-- Read-only prerequisite companion to audit-core-tenant-isolation.sql.
-- Run as postgres in DEVELOPMENT; returns aggregate counts, no identities or amounts.
SELECT
 (SELECT count(*) FROM (
   SELECT auth_id FROM public.users WHERE auth_id IS NOT NULL
   GROUP BY auth_id HAVING count(*)>1
 ) duplicates) AS duplicate_auth_identity_groups,
 (SELECT count(*) FROM public.transactions t LEFT JOIN public.organizations o ON o.id=t.org_id
   WHERE o.id IS NULL OR t.user_id IS DISTINCT FROM o.owner_id) AS inconsistent_transaction_owners,
 (SELECT count(*) FROM public.organizations o LEFT JOIN public.users u ON u.id=o.owner_id
   WHERE u.id IS NULL OR u.auth_id IS NULL) AS organizations_without_linked_owner,
 (SELECT count(*) FROM public.users WHERE auth_id IS NULL) AS profiles_requiring_backend_linking,
 (SELECT jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('users','organizations','transactions')) AS rls_state;
