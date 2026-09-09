-- Development follow-up for the September 7 exports. Read-only, one exportable row.
-- Returns ownership IDs and schema definitions, not names, emails, amounts or tokens.
BEGIN READ ONLY;
SELECT jsonb_pretty(jsonb_build_object(
 'transaction_ownership_issues', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
   SELECT t.id AS transaction_id, t.user_id AS transaction_user_id,
     t.org_id AS transaction_org_id, o.owner_id AS organization_owner_id,
     CASE WHEN o.id IS NULL THEN 'missing_organization'
          WHEN t.user_id IS DISTINCT FROM o.owner_id THEN 'owner_mismatch'
     END AS issue
   FROM public.transactions t LEFT JOIN public.organizations o ON o.id=t.org_id
   WHERE o.id IS NULL OR t.user_id IS DISTINCT FROM o.owner_id
   ORDER BY t.id
 ) x),
 'unlinked_profiles', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
   SELECT u.id AS profile_id, u.role,
     (SELECT count(*) FROM public.transactions t WHERE t.user_id=u.id) AS transaction_count,
     (SELECT count(*) FROM public.organizations o WHERE o.owner_id=u.id) AS organization_count
   FROM public.users u WHERE u.auth_id IS NULL ORDER BY u.id
 ) x),
 'table_grants', (SELECT jsonb_agg(to_jsonb(x)) FROM (
   SELECT table_name,grantee,privilege_type FROM information_schema.table_privileges
   WHERE table_schema='public' AND table_name IN
     ('users','organizations','transactions','orders','token_transactions','feature_unlocks')
   ORDER BY table_name,grantee,privilege_type
 ) x),
 'column_grants', (SELECT jsonb_agg(to_jsonb(x)) FROM (
   SELECT table_name,column_name,grantee,privilege_type
   FROM information_schema.column_privileges WHERE table_schema='public'
     AND table_name IN ('users','organizations','transactions','orders')
     AND grantee IN ('PUBLIC','anon','authenticated')
   ORDER BY table_name,column_name,grantee,privilege_type
 ) x),
 'order_policies', (SELECT jsonb_agg(to_jsonb(x)) FROM (
   SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='orders'
 ) x),
 'relevant_function_bodies', (SELECT jsonb_agg(to_jsonb(x)) FROM (
   SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prokind='f' AND p.proname IN
     ('apply_token_purchase','refund_token_purchase','apply_quickbooks_account_mapping',
      'notify_transaction_activity','update_updated_at_column')
 ) x),
 'private_schema', (SELECT jsonb_agg(to_jsonb(x)) FROM (
   SELECT nspname,pg_get_userbyid(nspowner) AS owner,
     has_schema_privilege('anon',oid,'CREATE') AS anon_create,
     has_schema_privilege('authenticated',oid,'CREATE') AS authenticated_create
   FROM pg_namespace WHERE nspname='booksmart_stage1'
 ) x),
 'public_views', (SELECT jsonb_agg(to_jsonb(x)) FROM (
   SELECT c.relname,c.relkind,c.reloptions,pg_get_userbyid(c.relowner) AS owner,
     pg_get_viewdef(c.oid,true) AS definition
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('v','m')
 ) x)
)) AS stage1_followup;
ROLLBACK;
