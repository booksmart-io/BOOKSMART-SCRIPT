-- User documents belong to an application user and must not prevent an
-- administrator from permanently deleting that user.
ALTER TABLE public.user_documents
  DROP CONSTRAINT IF EXISTS user_documents_user_id_fkey;

ALTER TABLE public.user_documents
  ADD CONSTRAINT user_documents_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.users(id)
  ON DELETE CASCADE;
