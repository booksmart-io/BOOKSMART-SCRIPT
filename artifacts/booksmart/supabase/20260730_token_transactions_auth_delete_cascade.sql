-- Token transactions are keyed to the Supabase Auth UUID. They must not keep
-- an authentication identity alive after an administrator permanently deletes
-- the corresponding BookSmart account.
ALTER TABLE public.token_transactions
  DROP CONSTRAINT IF EXISTS token_transactions_user_id_fkey;

ALTER TABLE public.token_transactions
  ADD CONSTRAINT token_transactions_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;
