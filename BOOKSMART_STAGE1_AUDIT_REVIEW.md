# Development audit export review — September 7, 2026

## Follow-up export (7) reviewed

The follow-up resolves the aggregate ownership ambiguity: all 11 transactions
(7530–7540) reference missing organization 87 and user 178. None of these 11
is classified as a mismatch with an existing organization owner. Preserve them
pending a decision based on their source/history; do not guess a replacement org.
Stage 1 would deny direct access to these orphaned rows without deleting them.

The five unlinked profiles are CPA IDs 7–11, each with zero owned organizations
and zero transactions attributed to it. Other dependencies were not counted;
this is not evidence that deletion is safe or that these are disposable fixtures.

Newly confirmed authorization concern: the orders INSERT policy accepts either
the client identity or the CPA identity. Its UPDATE policy likewise allows either
participant, with no policy restriction on client reassignment or status changes.
The supplied grants include authenticated INSERT/UPDATE. The backend CPA financial
summary authorizes access using an active order for cpa_id/client user_id. Therefore
these policies do not establish independent client consent and expose a potential
self-granted CPA access path even after transaction RLS is enabled. Full hosted
reproduction was not attempted; order constraints/triggers were not exported.
The existing backend endpoint must not be considered verified solely because it
checks active orders. This is a blocker for tenant-isolation sign-off.

token_transactions has broad anon/authenticated read/write grants and the preceding
export shows RLS disabled. Restricting the two billing functions alone does not
protect the token ledger. Orders also has client TRUNCATE/TRIGGER/REFERENCES grants
that need removal/review; RLS does not replace privilege hardening.

All five supplied function definitions match the previously tested local fixture
definitions after whitespace normalization. No public views/materialized views
or booksmart_stage1 schema were returned. These findings resolve those particular
prerequisites, not the complete deployment gate.

The order authorization and token-ledger extension is now prepared locally in
repair-stage1-orders-tokens.sql. Its dedicated disposable-database suite reproduces
the exported CPA self-grant behavior and verifies the replacement authorization,
ledger isolation, atomic spending, retries, rollback and concurrency behavior.
Retain the orphan rows until their intended disposition is established.
Snapshot/recovery and hosted validation remain required. No remote database data
or permissions were changed during this work.

## Initial exports (5) and (6)

Sources: user-supplied Supabase Snippet Untitled query (5).csv (security_metadata)
and (6).csv (stage 1 aggregate audit). No remote queries or changes made.

Status: review incomplete; not cleared for hosted application.

Confirmed from the exports:

- users, organizations and transactions all have RLS disabled. Five existing
  users policies are present but are not enforced while RLS is disabled.
- There are 11 transactions with a missing organization or a user_id that does
  not match the organization owner. The aggregate cannot distinguish these causes.
  Stage 1's strict direct-access policy would hide these rows until resolved.
  No ownership should be rewritten solely from this count.
- Zero duplicate auth identity groups; users already has UNIQUE(auth_id).
- Five profiles lack auth_id. This does not establish that they should be linked
  or deleted. Zero organizations lack a linked owner according to the supplied query.
- The three target tables are owned by postgres. anon/authenticated are neither
  superusers nor BYPASSRLS; the memberships field is null (no entries).
- The two expected legacy billing signatures exist and have effective anonymous
  and authenticated EXECUTE privileges. The draft revokes these privileges.
  The export inventories functions but does not include their bodies, so it cannot
  independently establish whether their implementation changed since earlier review.
- orders has RLS enabled, but this export does not include its policies or grants.
  This alone does not prove CPA engagement authorization is safe.
- The exported constraints do not include a transactions.org_id foreign key.
  Missing-organization rows are therefore one possible explanation for the 11 issues.
- Three target-table triggers match the previously modeled trigger names.
  Full function bodies and actual schema parity still need verification.

The core audit omitted current table/column grants, view definitions and function
bodies. The next read-only script, lib/db/scripts/audit-stage1-followup.sql,
collects those prerequisites along with the 11 ownership issues as IDs only and
dependency counts for the five unlinked profiles. It does not correct or delete data.

Next: review that export, classify the ownership problems, and prepare any justified
data correction for explicit review. Snapshot/recovery confirmation, isolated hosted
schema testing, CPA order permissions, token-spend transaction handling and hosted
regression tests remain outstanding. The database has not been repaired by this review.
