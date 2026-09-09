# Integration Disconnect Acceptance

**Status:** Passed for hosted synthetic connections

**Date:** September 8, 2026

## Scope

The acceptance suite created a disposable owner, an unrelated disposable user, one disposable organization, and synthetic Plaid, QuickBooks, Jobber, and Gmail connection records in the hosted development project. Tokens were generated only for this test and were intentionally invalid at the providers. The suite removed all disposable identities and organization data afterward.

No established user, company, provider connection, or customer record was modified.

## Passed checks

- The unrelated user could not disconnect any of the four connections.
- QuickBooks, Jobber, and Gmail returned explicit `403` denials for a foreign organization.
- Plaid returned a record-hiding `404` denial for a foreign item.
- The owner could disconnect every synthetic connection.
- QuickBooks and Gmail changed to `disconnected` and cleared both access and refresh credentials.
- Jobber removed the connection through its organization-scoped purge function.
- Plaid removed the item and its stored credential.
- Subsequent QuickBooks, Jobber, and Gmail synchronization attempts did not succeed.
- A subsequent Plaid synchronization found no active item and imported zero records.
- Reconnection requires a new provider authorization flow because no usable credential remains.
- Remote provider rejection of the synthetic invalid tokens did not prevent local credential removal.
- Audit events covered Plaid, QuickBooks, Jobber, and Gmail with both successful and denied outcomes.
- The audit records contained none of the synthetic provider token, owner session, unrelated-user session, or service-role key used by the test.
- Cleanup verification found zero remaining disposable users and zero disposable organizations.

## Defects corrected during acceptance

Cross-tenant QuickBooks, Jobber, and Gmail disconnect attempts previously returned generic server errors even though they made no change. They now return explicit `403` responses. Plaid now returns a safe `404` for the same condition. Security-sensitive `404` responses are recorded as denied rather than failed in the centralized audit log.

## Validation

- Hosted disposable acceptance: passed for all four providers.
- API regression suite: 181 passed, zero failed.
- API TypeScript check: passed.
- API build: passed.

## Limit

This test proves safe local behavior when remote revocation cannot be confirmed. It does not claim that a real provider grant was revoked because using real connected accounts would violate the disposable-fixture boundary. Final provider-side revocation confirmation belongs in the controlled live-data pilot with explicit consent.
