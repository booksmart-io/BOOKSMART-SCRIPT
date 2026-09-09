# Transaction isolation repair: review package

September 3, 2026. **Prepared and locally tested; not applied to Supabase.**
The confirmed direct transaction exposure remains unresolved on the remote system.

## What was found

The repository's `20260728_phase_3_cpa_client_access.sql` already defines an
intended access model: owners manage their organizations' transactions, approved
CPAs with active organization access may read them, and admins may read them.
The live synthetic checks nevertheless returned foreign transaction IDs in both
directions. This establishes unauthorized access, but not its precise policy cause.

Live read-only RPC checks for `current_app_user_id`, `current_app_role`, and
`cpa_has_org_access` each returned HTTP 404. They may be absent or unavailable
through the REST schema cache/API. Their deployed definitions remain unverified.
The configured `DATABASE_URL` is an HTTPS project URL, not a PostgreSQL connection
string, so it cannot be used to inspect database catalogs.

## Files to review

- `lib/db/scripts/audit-transactions-tenant-isolation.sql`: read-only catalog audit
  of RLS, grants, policies, identity/CPA functions, and user-security triggers.
  Includes transaction policy DDL for a baseline record; returns no customer rows.
- `lib/db/scripts/repair-transactions-tenant-isolation.sql`: transaction-only
  draft replacing all existing transaction policies, enabling RLS, removing
  anonymous/public grants, limiting authenticated privileges to row operations,
  and enforcing owner writes plus scoped owner/CPA/admin reads. UPDATE checks both
  the old and new organization, preventing transfers to a foreign tenant.
- `e2e/security/transactions-rls-repair.test.mjs`: isolated PostgreSQL tests using
  the actual identity/CPA helper definitions from the repository migration.

## Deployment prerequisite

Run the audit in the correct project's Supabase SQL Editor and review its result
sets before applying anything. Confirm helpers bind identity to `auth.uid()`,
CPA approval and active access are enforced, and users cannot change protected
roles, auth links, organization ownership or CPA grants. These are security
dependencies of transaction policies, not proven by local tests.

If helper functions are missing, adapt the repair after inspecting the audit.
The draft deliberately aborts instead of guessing those prerequisites. Do not
blindly run the entire older Phase 3 migration: it modifies many unrelated tables.

After prerequisites are resolved and the concrete change is approved, apply via
the normal SQL migration workflow. Then refresh synthetic login sessions and
rerun the stored-data Playwright suite. A fix is not verified until the live
foreign-row tests fail safely and own-organization reads continue to work.
Also verify legitimate CPA/admin access and disposable cross-tenant writes in
an isolated test database. The migration is transactional and has bounded lock
and statement timeouts; a SQL error rolls back its changes.

## Local verification

16 subtests passed (17 tests reported by Node including the parent). The suite
reproduced a broad-policy leak, applied the repair twice, verified bidirectional
isolation and legitimate access, blocked cross-tenant writes and organization
transfers, checked anonymous/column access and TRUNCATE denial, and proved missing
helpers abort the repair before dropping policies. No remote writes were made.

Reproduce locally from the repository root:

```powershell
npm install --prefix .tmp/transaction-policy-validation --no-package-lock --ignore-scripts @electric-sql/pglite
node --test e2e/security/transactions-rls-repair.test.mjs
```

PGlite runs PostgreSQL locally in memory; it does not contact Supabase. Fixtures
model the documented schema and cannot prove parity with the deployed schema.

## Credential action remains outstanding

Rotate the Supabase service credential exposed in the earlier test error. Update
every backend/workflow that uses it, verify those services work, then revoke the
old credential. Do not place the replacement in chat, frontend configuration,
reports or source control. Rotation was not performed by this review.

Reference: PostgreSQL combines permissive policies with OR, so adding a narrower
permissive policy alongside an old broad permissive policy would not by itself
fix the leak: https://www.postgresql.org/docs/18/sql-createpolicy.html
