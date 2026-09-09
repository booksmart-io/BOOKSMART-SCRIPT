# Stage 1: identity and transaction protection

September 8 update: the customer account export endpoint and Settings download
are now implemented locally, superseding the earlier finding below that no
complete export endpoint exists. The read-only export check passed for both
hosted synthetic companies; see BOOKSMART_CUSTOMER_EXPORT_RESULTS.md for coverage,
limits and outstanding browser/file acceptance. Owner self-service deletion is
also implemented locally with transactional database cleanup; see
BOOKSMART_ACCOUNT_DELETION_RESULTS.md. Its migration and destructive disposable-
account acceptance subsequently passed against the hosted project. CPA deletion is
now implemented and its protected database function is applied. Production backup
lifecycle remains open; no release approval is implied.

Later September 8 update: the centralized pseudonymous security audit log is
implemented locally for sessions, exports, deletion, integrations, CPA access and
sensitive admin actions. See BOOKSMART_SECURITY_AUDIT_LOG_RESULTS.md. Its database
migration and hosted acceptance remain pending. The two-year purge mechanism exists;
scheduled retention execution and backup lifecycle evidence remain open.

Prepared and applied to the development Supabase project on September 7, 2026.

This follows the September 3 conversation's final staged approach. Use this draft
instead of running either earlier repair unchanged. It is not a whole-database
security certification or a release approval.

## What is prepared

`lib/db/scripts/repair-stage1-tenant-isolation.sql`:

- Replaces transaction policies with owner-only access. Both user_id and org_id
  ownership must match the authenticated identity for reads and writes.
- Prevents browser edits to another profile and protects identity, email, role,
  approval, balances and all unlisted/future profile fields. Profile creation,
  deletion and account linking remain backend operations.
- Protects organization INSERT/UPDATE/DELETE and immutable identity/ownership.
  This dependency cannot wait until a later stage: changing an organization owner
  could otherwise defeat authorization in backend financial endpoints.
- Removes anonymous access and dangerous client table/column/sequence privileges
  on users, organizations and transactions. Preserves existing backend grants.
- Revokes client execution of both exported legacy billing functions, including
  overloads; grants only reviewed signatures to service_role.
- Preserves existing users/organizations read policies and RLS enabled/disabled
  state. **Authenticated profile and organization privacy remains incomplete when
  their RLS is disabled.** This stage deliberately does not grant CPA/admin a
  direct transaction bypass or create a new CPA allowlist.
- Uses a transaction, bounded lock/statement timeouts, duplicate identity checks,
  table/role checks, and aborts if the earlier core repair is detected.

`lib/db/scripts/repair-stage1-orders-tokens.sql` (apply after the foundation):

- Existing orders begin with `client_authorized=false`; no historical order is
  silently converted into financial-data consent.
- New requests can be created only by the client, for their own user ID, with an
  approved CPA and the initial pending/unpaid/zero-amount state. The trigger records
  explicit authorization. Direct CPA inserts and all browser updates/deletes fail.
- A client-only function authorizes an eligible order or revokes every authorization
  between that client and CPA. Backend CPA access checks require both an active
  engagement status and `client_authorized=true`.
- Anonymous access and direct client writes to orders, token_transactions and
  feature_unlocks are removed. Users can read only their own token history/unlocks.
- Backend token spending locks the balance row and atomically updates the balance,
  ledger, unlock and retry result. UUID retry keys prevent duplicate charges; a key
  reused with different arguments fails. Failed ledger/unlock writes roll back.
- Purchase and refund functions remain backend-only and compatible.

## Application compatibility changes

| Path | Change or finding |
| --- | --- |
| hooks/use-auth.tsx | Removed browser email lookup/account adoption and auth_id backfill. Existing ensure-profile backend handles confirmed-email linking/provisioning. |
| pages/cpa/profile.tsx | Ordinary saves no longer send email, role or approval changes. Email displays read-only. Pending/approved status is preserved. |
| pages/user/dashboard.tsx | AI insight unlock uses existing authenticated token-spend endpoint; no browser balance write, and no successful unlock displayed if spending fails. |
| pages/cpa/dashboard.tsx | Activity feed uses recent_transactions from the existing backend financial summary instead of querying transactions directly. Its time coverage follows that summary's reporting window. |
| pages/user/reports.tsx | Reviewed receipt approval inserts: already supply numeric user_id and org_id. No edit required. |
| routes/auth-profile.ts | Existing backend provisions and links profiles after confirming email. No migration to browser writes. |
| routes/scan-statement.ts, financial-statements.ts, quickbooks.ts | Inspected service-role configuration and owner-scoping paths. Actual provider imports remain to be tested against hosted schema. |
| routes/cpa-client-financials.ts | Existing authentication, approved-CPA and active-order checks remain. The order table's write authorization must be audited before treating this as a proven secure CPA path. |
| routes/token-unlocks.ts | Spending now calls the backend-only atomic database function with a validated retry key. |
| pages/user/orders.tsx | Owners can authorize eligible historical requests and revoke all access for the selected CPA. |
| pages/user/cpa-network.tsx | New requests clearly disclose financial access and are authorized by the submitting client. |
| CPA financial/monitoring/Jobber routes | Every order-based financial access check now also requires explicit client authorization. |

Paths in this table are relative to artifacts/booksmart/src or
artifacts/api-server/src as appropriate. Existing unrelated workspace changes
were retained.

## Local evidence

- Stage 1 foundation: 11 subtests plus parent (12 reported tests), including the aggregate audit.
- Orders/tokens extension: 11 subtests plus parent (12 reported tests).
- Together with the two earlier SQL repair suites: 57 reported tests, zero failures.
- Combined database repair suites: 69 passed, zero failed.
- Related auth, CPA access, payment fulfillment and trusted-ledger tests: 22 passed.
- Frontend TypeScript check passed.

The stage 1 tests reproduce the leak, apply twice, exercise A/B reads and CRUD,
reject foreign inserts/upserts/transfers, guard profiles and organizations, deny
anonymous/unbound identities and CPA/admin direct reads, restrict billing RPCs,
and preserve backend provisioning/import writes. They run the exported database
functions and QuickBooks mapping trigger in a disposable local PostgreSQL fixture.
They do not reproduce the entire hosted schema, browser interaction or providers.

Reproduce database checks:

```powershell
node --test e2e/security/stage1-rls-repair.test.mjs e2e/security/core-rls-repair.test.mjs e2e/security/transactions-rls-repair.test.mjs
```

## Concrete next steps before hosted application

1. Save a development schema/policies/grants snapshot or verify a recoverable copy.
2. Run audit-core-tenant-isolation.sql and audit-stage1-tenant-isolation.sql as
   postgres in the correct development project. Review current policies, triggers,
   constraints, views, role inheritance and exposed SECURITY DEFINER function bodies.
   Check any paths that can write identity/ownership as a privileged database role.
3. Resolve duplicate identities or mismatched transaction ownership through trusted
   review; this migration does not rewrite legacy data. Verify role/approval values
   were not corrupted while browser writes were permitted.
4. Verify booksmart_stage1 is unused or belongs to this migration, owned by postgres,
   cannot be modified by clients, and is absent from Supabase exposed schemas.
   Review existing users/organization RLS if enabled; this draft preserves it.
5. Validate both migrations and the updated application against an isolated copy of
   the actual development schema.
6. Apply the reviewed stage 1 foundation, followed by its orders/tokens extension.
   Do not run the older core/transaction repair drafts. Do not run all
   three repair drafts or disable RLS to solve application errors. On SQL error,
   issue ROLLBACK if the editor session remains in a failed transaction.
7. With fresh synthetic A/B sessions, repeat direct REST and browser checks: own
   CRUD, foreign read/write denial, anonymous denial, profile edits, onboarding,
   organization creation/switching, reports and transaction edits. Verify actual
   Plaid/QuickBooks/receipt/statement imports and token purchase/refund/unlock flows.
8. Verify CPA assigned/unassigned/revoked access and admin functions through their
   backend routes. Recheck completed private storage behavior for regressions.
9. Save hosted evidence and failures before starting broader profile reads, CPA
   consent/revocation, and remaining tables. Existing service credential rotation
   remains recorded as outstanding; it was not performed here.

## Hosted verification result

Both Stage 1 migrations were applied to the development project. The read-only
metadata verification passed, including RLS, policies, grants, function execution
permissions, preserved orphan rows and the protected helper schema.

`e2e/security/hosted-stage1-regression.mjs` then passed with fresh sessions and
temporary synthetic data. It verified Company A/B owner reads and bidirectional
foreign read/update/delete denial, anonymous denial, protected profile fields,
CPA client authorization/revocation and self-grant denial, and retry-safe atomic
token spending. Temporary public and authentication fixtures are removed in the
test's cleanup path.

Live browser and provider-import flows were validated separately. Manual
development validation passed for client authorization and
revocation, unrelated-CPA denial, private documents, receipt and bank-statement
imports, Plaid isolation and QuickBooks isolation. The final automated rerun passed
71 database security tests, 62 frontend domain/access/accounting tests and 171 API
server tests; frontend and API
server type checks also passed.

## Accounting edge-case verification

The financial-engine regression suite now covers partial invoice collections,
customer deposits and retainers before and after revenue recognition, chargebacks,
bounced payments, reversing entries for voided checks and invoices, collected sales
tax, payroll expense and tax accruals and their settlement, loans, credit-card
payments, owner contributions/draws, and inclusive month-end/year-end boundaries.
It also retains the existing cash-flow reconciliation, receivable/payable,
depreciation, P&L and balance-sheet coverage.

These tests exposed and closed four calculation defects: receivable collections
reduced cash, deferred revenue could be treated as earned revenue, generic payable
matching swallowed sales-tax liabilities, and settled accrued liabilities could
remain noncash. All 62 frontend tests and the frontend type check pass after the
repairs.

Cash and accrual behavior is covered at the calculation layer through cash
transactions, AR/AP, deferred revenue and uploaded-statement precedence. BookSmart's
current bank-cash calculations are USD-only, so general multi-currency accounting is
not a supported scenario. Manual UI verification of edge-case labels, confidence
wording and evidence links remains part of final product acceptance.

## Privacy and deletion audit

This phase is **OPEN** and must not be treated as release-complete.

- QuickBooks, Jobber, Gmail and Plaid expose owner-scoped disconnect routes. They
  attempt provider revocation where supported and locally disable or remove stored
  credentials. Jobber purges its synchronized operational records; Plaid removes
  the selected item's imported transactions. Their destructive behavior still
  requires isolated hosted fixtures for end-to-end proof.
- A complete customer data-export endpoint does not exist. The existing report CSV
  and document downloads do not cover the plan's transactions, invoices, jobs,
  email evidence, insights, tasks, integration metadata and account record as one
  customer export.
- Owner and CPA Settings now provide self-service account deletion. Owner deletion
  passed a complete hosted disposable-account run. CPA deletion is implemented,
  its protected database function is applied, and transactional tests prove client
  records remain intact. A destructive disposable-CPA browser run remains optional
  final acceptance evidence.
- There is no centralized audit trail proving login/logout, all integration
  connect/disconnect actions, role changes, customer export and customer deletion.
  Existing Jobber and financial-input audit records cover only subsets.
- No application-enforced retention schedule or expired-data purge was found.
  Backup expiration and deleted-data lifecycle must be verified against an approved
  Supabase backup-retention policy rather than inferred from application code.
- The generated-artifact secret scan passed, but log sanitization still needs an
  explicit test covering authorization headers and provider credentials on failure
  paths.

## Release disposition

- Tenant isolation: **PASS**.
- CPA consent and revocation: **PASS**.
- Private documents and financial imports: **PASS**.
- Automated security and application validation: **PASS**.
- Profile and organization tenant isolation: **PASS** after Stage 2 closed
  authenticated enumeration (Company A changed from 121 visible profiles and 50
  organizations to its own profile plus approved CPA directory entries and one
  owned organization).
- Disabled and removed sessions: **PASS**; already-issued sessions return no
  protected rows after disablement or removal.
- Employee role: **NOT APPLICABLE**; the current product model defines only user,
  CPA and admin roles.
- OAuth state and token security: **PASS for automated and hosted controls**.
  QuickBooks, Jobber and Gmail states are signed, expiring, organization-bound,
  stored privately and consumed once; replay and expired-state checks passed on
  the hosted development database. Plaid Link exchange remains owner-scoped.
- Secret artifact scan: **PASS**; 64 generated test/report files were checked
  against 14 configured secret values with no matches.
- Synchronization reliability: **PASS for implemented provider sync paths**. Jobber cursor recovery, watermark
  overlap, throttling recognition and idempotent hashes pass. Gmail bounds and
  deduplicates scans. QuickBooks now paginates beyond 1,000 records. Plaid account
  and transaction conflict keys are scoped to the owning item/organization in the
  hosted database, preventing cross-tenant provider-ID collisions. Plaid transaction
  sync and QuickBooks read queries now retry bounded transport errors, HTTP 429 and
  temporary provider failures while permanent failures and one-time OAuth exchanges
  are not replayed.
  Plaid's cursor feed applies added/modified/removed records in provider order;
  Jobber full reconciliation archives records no longer returned. QuickBooks and
  Gmail are pull-based in this implementation, so provider webhook replay and
  out-of-order webhook cases are not applicable. Imported QuickBooks evidence is
  retained for accounting history rather than destructively removed.
- Accounting edge-case calculations: **PASS**. Automated coverage includes all
  currently supported scenarios in the plan; general multi-currency reporting is
  not currently supported. Manual UI wording/evidence acceptance remains open.
- Privacy, export, deletion, retention and audit logs: **COMPLETE for application controls**.
  Hosted customer export, owner self-service deletion, four integration disconnect
  paths, centralized audit logging, and scheduled two-year audit retention have
  passed with disposable fixtures. CPA self-service deletion is implemented and its
  service-only database function is hosted, and disposable hosted deletion passed
  while preserving all client fixtures. Production backup coverage is deferred;
  the Free plan does not provide the required managed backup assurance.
- Supabase credential rotation: **CLOSED — owner waived rotation on September 7,
  2026**. The existing credentials remain in use and were not rotated.

## Backup retention follow-up

`BOOKSMART_BACKUP_RETENTION_AND_DELETION_POLICY.md` now documents Supabase's managed backup windows, the separation between database backups and Storage objects, the risk that a restore can reintroduce rows deleted after its restore point, and the required restore-time deletion reconciliation workflow. The project owner confirmed the target project uses the Free plan. Production backup coverage remains open until BookSmart upgrades to a managed-backup plan or implements an approved encrypted off-site backup process with tested restoration and deletion reconciliation.

## Integration disconnect acceptance

Hosted disposable acceptance now passes for Plaid, QuickBooks, Jobber and Gmail. It proves owner scoping, cross-tenant denial, local credential removal or connection purge, blocked future synchronization, fresh authorization for reconnection, centralized audit coverage and safe continuation when provider revocation of a synthetic invalid token cannot be confirmed. Exact cleanup verification found no disposable users or organizations remaining. Real provider-side grant revocation remains a controlled live-data pilot check requiring explicit consent.

## Browser export acceptance

The owner Settings download flow now passes hosted browser acceptance with a disposable private binary file. The downloaded gzip JSON archive retained the original bytes, bucket and path, and its SHA-256 checksum matched an independent calculation. The browser displayed successful completion, all disposable fixtures were removed, and the generated-artifact secret scan passed. Export latency for the small fixture was approximately 21 seconds and remains a performance-test input.

## Performance and load acceptance

The initial hosted load gate passed. A 2,500-transaction export completed in 18.8 seconds with all rows present; health p95 was 18 ms; authenticated API p95 was 1.326 seconds; two concurrent exports completed in 15.5 seconds; the third was limited with HTTP 429 in 278 ms; all 20 cross-tenant requests were denied; and RSS growth was 35 MiB. Cleanup was hardened and final verification found zero matching profiles, organizations, transactions, or Auth identities. See `BOOKSMART_PERFORMANCE_LOAD_RESULTS.md`. The broader production-scale matrix remains open.
