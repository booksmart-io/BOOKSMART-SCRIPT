-- Organizations are owned by an application user. A permanent user deletion
-- must remove those organizations; their own child relationships then cascade
-- through organization-owned data.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_owner_id_fkey;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_owner_id_fkey
  FOREIGN KEY (owner_id)
  REFERENCES public.users(id)
  ON DELETE CASCADE;
