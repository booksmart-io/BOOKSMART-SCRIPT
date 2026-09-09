# Owner account deletion — September 8, 2026

Implemented locally. No hosted account or customer data was deleted during validation.

## Behavior

The owner Settings page now replaces the placeholder Delete Account action with a permanent-deletion dialog. The owner must enter the account email and `DELETE`. The server also requires a sign-in within the previous 15 minutes.

Successful deletion:

1. Resolves the owner and all owned organizations on the server; callers cannot select another account or organization.
2. Attempts revocation for every stored Plaid, QuickBooks, Jobber and Gmail connection. Invalid/already-revoked credentials are treated as inactive where the provider makes that distinction. Failed provider confirmations are returned as warnings; local credentials are still permanently removed.
3. Deletes the Stripe customer, which prevents future subscription billing. A billing failure stops deletion before stored files or BookSmart database records are removed.
4. Recursively removes files in the authenticated owner's folders from `documents`, `chat-attachments` and `userImages`. Foreign or malformed paths abort deletion.
5. Bans the Auth identity before database removal so an old session cannot recreate or read the account if final cleanup needs support intervention.
6. Calls one server-only database function that atomically deletes UUID-keyed billing/token records and the owner profile. Reviewed cascades remove owned organizations and their financial, integration, evidence, monitoring and document rows. The function explicitly removes the Jobber expense audit rows whose restrictive relationships could block the cascade. Any unexpected restrictive dependency rolls the entire database portion back.
7. Deletes the Supabase Auth identity and clears the local browser session.

If final database or Auth cleanup fails, the identity remains banned and the UI directs the owner to support. The API returns stable error codes and does not expose provider or database error details.

## Validation

- 6 service/API tests pass: confirmation, role enforcement, cleanup ordering, billing failure, database failure, storage scoping/batches, anonymous denial and secret-safe errors.
- 3 disposable PostgreSQL tests pass: complete tenant-scoped cascade, rollback on an unexpected restrictive dependency, and CPA denial.
- API and frontend TypeScript checks pass.
- The full API regression suite passes with the export and existing security/application coverage.

## Deployment requirement and remaining acceptance

Apply `artifacts/booksmart/supabase/20260908_owner_account_deletion.sql` before deploying the API/UI. Deploying the API first would lock an account and then fail when the database function is unavailable.

The first hosted disposable-account attempt exposed an activity-notification trigger ordering conflict. PostgreSQL rolled the database deletion back. The migration now deletes transactions and job-cost assignments while their organization still exists, allowing their deletion notifications to satisfy the foreign key before the organization cascade removes the notices. The updated migration must be rerun because it replaces the function body.

## Hosted acceptance result

The corrected migration was applied and the complete destructive acceptance test passed using a newly created disposable synthetic owner. The test created a real Auth login, application profile, owned organization, financial transaction, token-history row and private stored file, then called the authenticated account-deletion endpoint.

Post-deletion verification passed for every target: profile deleted, organization deleted, transaction deleted, token history deleted, stored file deleted, Auth identity deleted, and the previously issued session denied. The disposable fixture was fully removed. No established synthetic company or user account was targeted.

Run destructive hosted acceptance only with a newly created disposable account. Verify provider revocation, Stripe cancellation, stored-file removal, database deletion, old-session denial and inability to sign in. The two established synthetic businesses were deliberately preserved.

This closes the owner self-service implementation. CPA self-service deletion, an operational recovery queue for rare cross-system partial failures, centralized audit trails, retention enforcement and backup lifecycle evidence remain open.
