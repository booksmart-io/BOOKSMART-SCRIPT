-- READ-ONLY Supabase Storage security audit.
-- Returns metadata only: no object names, paths, contents, customer data, or secrets.
-- Run in the development project's Supabase SQL Editor and export the one result as CSV.
BEGIN READ ONLY;

SELECT jsonb_pretty(jsonb_build_object(
  'buckets', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'bucket_id', b.id,
      'public', b.public,
      'file_size_limit', b.file_size_limit,
      'allowed_mime_types', b.allowed_mime_types
    ) ORDER BY b.id)
    FROM storage.buckets b
  ), '[]'::jsonb),
  'storage_rls', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table_name', c.relname,
      'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity,
      'owner', pg_get_userbyid(c.relowner)
    ) ORDER BY c.relname)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname IN ('buckets', 'objects')
  ), '[]'::jsonb),
  'policies', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table_name', p.tablename,
      'policy_name', p.policyname,
      'permissive', p.permissive,
      'roles', p.roles,
      'command', p.cmd,
      'using_expression', p.qual,
      'check_expression', p.with_check
    ) ORDER BY p.tablename, p.policyname)
    FROM pg_policies p
    WHERE p.schemaname = 'storage' AND p.tablename IN ('buckets', 'objects')
  ), '[]'::jsonb),
  'client_grants', COALESCE((
    SELECT jsonb_agg(to_jsonb(g) ORDER BY g.table_name, g.grantee, g.privilege_type)
    FROM (
      SELECT table_name, grantee, privilege_type, is_grantable
      FROM information_schema.table_privileges
      WHERE table_schema = 'storage'
        AND table_name IN ('buckets', 'objects')
        AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    ) g
  ), '[]'::jsonb),
  'client_column_grants', COALESCE((
    SELECT jsonb_agg(to_jsonb(g) ORDER BY g.table_name, g.grantee, g.column_name, g.privilege_type)
    FROM (
      SELECT table_name, grantee, column_name, privilege_type
      FROM information_schema.column_privileges
      WHERE table_schema = 'storage'
        AND table_name IN ('buckets', 'objects')
        AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    ) g
  ), '[]'::jsonb)
)) AS storage_security_metadata;

ROLLBACK;
