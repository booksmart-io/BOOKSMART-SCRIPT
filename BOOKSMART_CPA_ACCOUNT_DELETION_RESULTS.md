# CPA self-service account deletion — September 9, 2026

## Result

Implemented and applied to the hosted Supabase development project. No existing
CPA account or client data was deleted during validation.

CPA Settings now provides a permanent-deletion dialog requiring the signed-in
CPA's email address and the exact phrase `DELETE`. The API also requires a sign-in
within the previous 15 minutes.

Successful deletion removes the CPA's private stored files, locks existing Auth
sessions, atomically removes the CPA profile and its engagement/access records,
and deletes the Auth identity. Client organizations, financial transactions,
documents, job-cost assignments and other client-owned records remain intact.
Referral attribution is cleared without removing the referred client.

## Security and verification

- The server resolves the target only from the verified Auth subject.
- Admin and owner roles cannot enter the CPA deletion branch.
- Storage cleanup accepts only the deleting Auth subject's prefix.
- The identity is banned before database deletion.
- The database operation is transactional and rollback-safe.
- `delete_cpa_account_data(uuid)` is `SECURITY DEFINER`, fixes its search path,
  disables row security internally, and grants execution only to `service_role`.
- CPA/owner deletion service tests: 9 passed.
- Transactional database deletion tests: 4 passed.
- Full API regression suite: 181 passed.
- Full frontend regression suite: 62 passed.
- API and frontend TypeScript checks passed.
- Hosted metadata verification confirmed the protected function configuration.

## Hosted destructive acceptance

A new disposable client and CPA were created in the hosted development project.
The CPA signed in and deleted its account through the real authenticated API.
Verification passed: CPA profile deleted, engagement deleted, CPA file deleted,
Auth identity deleted, and the old CPA session denied. The client profile,
organization and financial transaction all remained present. The test then removed
the disposable client and remaining fixtures. Existing CPA and client accounts were
deliberately preserved.
