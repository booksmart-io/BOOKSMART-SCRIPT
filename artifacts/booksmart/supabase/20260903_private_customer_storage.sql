-- Storage-only security migration. Review and test before applying.
-- Existing files are retained; their public URLs stop working for private buckets.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='documents')
     OR NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='chat-attachments')
     OR NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='userImages') THEN
    RAISE EXCEPTION 'Expected storage bucket is missing; stop and review';
  END IF;
END $$;

UPDATE storage.buckets SET public=false WHERE id IN ('documents','chat-attachments');
-- Avatars are intentionally public, but all mutations go through the authenticated backend.
UPDATE storage.buckets SET public=true WHERE id='userImages';

DO $do$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (coalesce(qual,'') ~ $re$bucket_id\s*=\s*'documents'$re$
           OR coalesce(with_check,'') ~ $re$bucket_id\s*=\s*'documents'$re$
           OR coalesce(qual,'') ~ $re$bucket_id\s*=\s*'chat-attachments'$re$
           OR coalesce(with_check,'') ~ $re$bucket_id\s*=\s*'chat-attachments'$re$
           OR coalesce(qual,'') ~ $re$bucket_id\s*=\s*'userImages'$re$
           OR coalesce(with_check,'') ~ $re$bucket_id\s*=\s*'userImages'$re$
           OR coalesce(qual,'') ~ $re$bucket_id\s*=\s*'user-images'$re$
           OR coalesce(with_check,'') ~ $re$bucket_id\s*=\s*'user-images'$re$)
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects',p.policyname);
  END LOOP;
END $do$;

-- No object policies are recreated: browser roles cannot list/read/write these
-- buckets through the Storage API. Authenticated backend endpoints use service_role.
COMMIT;
