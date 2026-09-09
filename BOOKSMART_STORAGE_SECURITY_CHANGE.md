# Supabase customer-storage security change

Prepared September 3, 2026. **Local only; not applied to Supabase.**

## Scope

- `documents` and `chat-attachments` become private.
- Broad client object policies for `documents`, `chat-attachments`, `userImages`,
  and the misspelled `user-images` reference are removed.
- `userImages` remains public for profile-photo display, while mutations use the
  authenticated avatar backend.
- Document signing, downloads, and deletion require authentication and an object
  path below the caller's UUID folder.
- The unauthenticated arbitrary Supabase Storage download proxy is closed.

The SQL does not delete or move any file. Existing public document/chat URLs stop
working after bucket privacy changes. Document views obtain one-hour signed URLs.
Existing chat messages contain one-hour signed URLs and require a future participant-
authorized refresh endpoint after expiry; current uploads keep working initially.

CPA document downloads deliberately fail closed because the deployed database has
no verified CPA access-grant table. Add explicit CPA consent authorization before
restoring that workflow. Do not weaken owner checks to restore it.

This change does not secure `user_documents` database rows or other database tables,
does not scan file contents, and does not prove encryption configuration. It addresses
bucket exposure and the application paths inspected in this review.

## Safe rollout

1. Deploy the backend/frontend changes first.
2. Test document upload/view/download/delete and avatar upload/delete using synthetic data.
3. Apply `artifacts/booksmart/supabase/20260903_private_customer_storage.sql` in development.
4. Verify public URLs fail, owner signed access succeeds, and another user/logged-out access fails.
5. Test chat uploads and expiry behavior. Keep release blocked until participant-authorized
   signed-URL refresh and CPA document authorization are implemented if those features are required.
