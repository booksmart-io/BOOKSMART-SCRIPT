# Core tenant-isolation repair — development review package

Prepared September 3, 2026. **Not applied to Supabase. Not cleared for deployment.**

## Evidence and scope

User-supplied Supabase screenshots show RLS disabled for users, organizations,
and transactions. The grants export shows anon and authenticated have SELECT,
INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER on all three tables.
The user clarified this is development with no real customer data or credentials.
These findings do not establish third-party access or a production incident.

The subsequent metadata and function exports also confirm the two legacy token
functions are SECURITY DEFINER, executable by anon/authenticated, and perform no
caller/payment verification. Their anonymous balance mutation was reproduced
locally using the actual exported bodies and synthetic data, not against Supabase.

This coordinated draft supersedes the earlier transaction-only draft for this
review. Do not run both. It covers these three tables and its own private CPA
allowlist, plus execute privileges on apply_token_purchase/refund_token_purchase.
It does NOT cover storage, other public tables, views, other exposed RPCs, backend
authorization, n8n retention or rate limiting. Do not mark the full test plan passed.

## Proposed access model and compatibility tradeoffs

- Anonymous roles receive no access to these three tables, including column grants.
- Authenticated owners manage their own organizations and transactions. Updates
  cannot transfer organization identity/ownership or transactions into another tenant.
  Transaction INSERT/UPDATE checks also require user_id to match the caller.
- Users read their own profile; admins read all three tables. Direct profile
  updates are limited by a trigger to explicitly listed personal/CPA profile fields.
  IDs, auth links, role, approval, email, balances and unlisted/future fields are immutable.
  active_org_id can be saved only for an owned, admin-visible or explicitly
  CPA-authorized organization, or cleared. Saving a selection grants no access.
- Both legacy token functions lose PUBLIC, anon and authenticated execution
  (including overloads). Only the two reviewed signatures are granted to service_role.
  Function bodies are unchanged. Backend callers must still verify Stripe events,
  payment/refund ownership, amounts and retry safety; these functions do not.
  Current repository fulfillment calls fulfill_token_checkout, which is unchanged.
  External workflows calling the legacy functions must use verified backend credentials.
- Profile creation/deletion and privileged account edits require the verified
  backend. The current auth hook already calls `/api/auth/ensure-profile` and
  deliberately avoids browser-side profile insertion.
- Existing backend service-role privileges are preserved, not newly granted.
  A backend that lacks privileges or does not use service_role needs separate review.
- CPA organization/transaction reads require approval AND a reviewed grant in
  `booksmart_security.cpa_org_reads`. No client, service-role workflow or existing
  public order trigger can populate this administrator-only table directly.
  It starts empty. No grants are inferred or backfilled from unverified orders.
  A grant must match the current organization owner. Removing it revokes the read.

**This is a fail-closed development baseline, not a drop-in feature-parity migration.**
The private CPA allowlist is intentionally separate from the missing/unverified
public CPA access system. Adopting it requires explicit review; production CPA
consent/revocation must ultimately be integrated into a trusted backend workflow.
Do not copy public order records into it blindly.

Known affected UI flows: CPA directory/client profile reads, chat participant
profile lookups, referral reads, email-based account linking, browser-side token
balance updates, and admin profile editing. CPA profile saves that change email,
role or approval will fail (unchanged protected values are permitted). These need
scoped backend endpoints or safe public projections, not broad users-table reads.
This package does not modify those application flows.

## Files

- `lib/db/scripts/repair-core-tenant-isolation.sql`: transactional review draft.
- `lib/db/scripts/audit-core-tenant-isolation.sql`: one-row read-only metadata export.
- `e2e/security/core-rls-repair.test.mjs`: isolated local PostgreSQL fixtures/tests.

## Local verification

27 coordinated-repair subtests passed (28 including their parent). The existing
transaction suite also passed: combined Node result **45 passed, 0 failed**.
Tests reproduce disabled-RLS exposure, apply twice, check both tenant directions,
anonymous denial, normal owner CRUD, foreign writes/upserts, immutable identity
and privilege fields, unknown future profile fields, CPA approval/grants/revocation,
admin reads, backend writes, sequence protection and duplicate-identity aborts.
Additional checks cover transaction user attribution, authorized/foreign/cleared
active-organization preferences, anonymous billing reproduction before repair,
denial of both billing functions afterward (including app-admin callers), and
successful service-role billing with the actual exported function bodies.
The exported timestamp, QuickBooks mapping and activity notification triggers
execute in the local fixture, including successful mapping and notification assertions.
Missing billing signatures abort the repair before policy replacement.

The local fixture models expected key columns, not the entire deployed schema.
It includes all five provided function definitions, but not the complete deployed
constraints, views, other functions, or API configuration. Browser/UI parity and hosted
Supabase behavior remain unverified. No remote connections or writes were used.

Run from repository root:

```powershell
node --test e2e/security/core-rls-repair.test.mjs e2e/security/transactions-rls-repair.test.mjs
```

Uses the previously installed local PGlite dependency in
`.tmp/transaction-policy-validation`; no new application dependencies were added.

## Required before applying

1. Export the new one-row audit from the development Supabase SQL Editor.
2. Review actual columns/defaults, triggers, constraints, owners, client role
   memberships, and callable SECURITY DEFINER functions. Inspect dependent views
   and privileged routines for alternate access to these tables. The audit inventories
   functions but does not certify their bodies. Investigate any unsafe paths separately.
3. Confirm the private schema name is unused (or belongs to this migration), and
   keep it out of Supabase exposed schemas. Confirm auth_id is uniquely mapped and
   existing synthetic role/approval/ownership values are trusted. Legacy corruption
   is not repaired by adding policies. The script rejects duplicate auth IDs.
4. Export schema/policies/grants or take a development snapshot. Review the
   compatibility tradeoffs above, especially CPA access, before approving application.
5. Apply only after review, as postgres, with no concurrent development writes.
   The script uses a transaction and bounded timeouts. On error, issue ROLLBACK
   if the editor session remains in a failed transaction; do not keep running fragments.
6. Re-export the audit. With fresh synthetic A/B sessions, run hosted direct-API
   and Playwright tests: own reads succeed, foreign reads return no rows, foreign
   writes fail or affect zero rows, unauthenticated access fails. Test backend
   provisioning, personal profile updates, onboarding, organization creation,
   import processing, CPA grants/revocation and admin workflows separately.

The exported schema also reports RLS disabled on other tables including
token_transactions, user_documents, bank_accounts, chats and messages. Grants
and authorization for those tables remain unreviewed. In particular, restricting
the billing functions does not secure direct access to the token ledger. Treat
this as a scoped repair, not full protection against all token/account abuse.
Existing mismatched transaction user_id/org_id values are not rewritten; they
require a separate trusted consistency review if legitimate edits fail.

After commit, rollback requires a reviewed migration/snapshot; do not restore the
known insecure grants or disable RLS merely to make a UI test pass. Keep development
blocked from release until all affected paths and the rest of the security plan pass.

## Design references

- PostgreSQL policy composition and write checks:
  https://www.postgresql.org/docs/18/sql-createpolicy.html
- TRUNCATE and REFERENCES are not governed by row security:
  https://www.postgresql.org/docs/17/ddl-rowsecurity.html
- Table, column, sequence and function privileges:
  https://www.postgresql.org/docs/current/ddl-priv.html
