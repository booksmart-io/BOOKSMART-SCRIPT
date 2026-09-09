# Customer account export — September 8, 2026

Implemented locally. This closes the missing export implementation, not the overall privacy/deletion release gate.

## User flow

Owner Settings → Download account data downloads `booksmart-account-export-YYYY-MM-DD.json.gz`.
The compressed JSON contains a versioned manifest, records grouped by table, and original stored file bytes encoded as base64 with SHA-256 checksums. The manifest includes restoration instructions, counts, collection timestamps and exclusions.

The scope is the signed-in owner's account and every organization they own. Account-level documents cannot truthfully be divided by company in the existing model. CPA/admin client exports are deliberately unavailable through this owner endpoint.

## Coverage

- Account profile, organizations, survey progress and financial settings.
- Transactions, statement imports and pending transactions.
- QuickBooks staged entities and account mappings; Jobber customers, jobs, invoices and payments in provider records.
- Gmail-derived evidence, extracted receipts, source links, matching and job cost assignments.
- Insights, tasks, task events, monitoring history and account notifications.
- Integration metadata using explicit projections that never select credentials.
- Documents, subscriptions, token history, feature unlocks, CPA orders and participating chat conversations.
- Stored objects under the authenticated account's folder in documents, chat-attachments and userImages, including nested folders.

Internal operational logs/backups, OAuth state, integration credentials, other users' files, and provider content BookSmart never stored are excluded. The undeployed Jobber expense-write audit is an internal operational log and is outside the customer export inventory; it is not silently treated as an empty customer dataset.

## Security and completeness controls

- `POST /api/account/export` requires authentication and rejects supplied account/company/path/table selectors.
- Active Auth identity is checked before and after collection. Owner role and organization ownership are rechecked before download.
- Every collection is filtered by a server-resolved owner, company, or previously authorized parent ID. Returned rows receive a second scope check.
- Pagination continues using exact counts, including when the server returns fewer rows than requested. Changing counts abort collection.
- Missing required tables, failed reads and inaccessible files abort rather than produce a partial download.
- Credentials/error fields and signed-URL query credentials are removed from structured data; original customer file bytes remain unchanged.
- Downloads have no-store headers. Provider error details are not returned to the caller.
- At most one export per account and two per server process run simultaneously. Per-table row count, total collected size and individual file limits abort oversized exports with a clear response.

## Verification

- 10 permanent export tests cover mixed ID ownership, parent scoping, original file bytes/checksums, pagination beyond 1,000 rows, changed counts, foreign rows, unsafe paths, missing tables, failed downloads, credential filtering, disabled/removed users, role restrictions, anonymous/selector denial, concurrency and safe HTTP failures.
- Full API regression suite: 181 passed, zero failures.
- API and frontend TypeScript checks passed.
- Read-only hosted checks use only the two pre-existing synthetic companies. They print aggregate counts and never save downloaded data or expose sessions/records.
- Hosted Company A: PASS, 43 collections, 1 owned organization, 78 records, 0 stored files.
- Hosted Company B: PASS, 43 collections, 1 owned organization, 91 records, 0 stored files.

## Browser acceptance

Browser download acceptance and hosted file-bearing fixture coverage now pass. A disposable owner used the real Settings action to download a valid gzip JSON archive. The archive contained the exact original private binary file bytes and matching SHA-256 checksum. All database, Storage and Auth fixtures were removed afterward. No application deployment or database migration was performed for this feature.

This synchronous version supports at most 100,000 rows per table and 100 MiB of collected data (including base64 expansion), with a 50 MiB per-file limit. Larger accounts need a background/streamed export implementation; no rows are intentionally truncated. Limits are per server process, not a distributed rate limiter.

Reads span the collection interval rather than a transactionally consistent database snapshot. Pause imports/edits when exporting. The count checks detect additions/removals that change counts, not every simultaneous same-count edit. Error-field redaction is conservative and can omit customer-entered fields whose names contain `error` or secret-related terms.

The export implementation and its browser acceptance are complete. Production backup coverage, performance testing and controlled live-data acceptance remain separate gates.
