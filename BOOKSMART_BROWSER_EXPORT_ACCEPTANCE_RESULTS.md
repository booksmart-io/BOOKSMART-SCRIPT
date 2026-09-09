# Browser Account Export Acceptance

**Status:** Passed

**Date:** September 8, 2026

## Scope

The browser acceptance test created a disposable owner, organization, authenticated browser session, and private binary object in the hosted development project's `documents` bucket. It opened the real Settings page and used the visible **Download account data** action.

No established user, organization, file, or customer record was modified.

## Passed checks

- The authenticated owner could open the Settings page and see the export action.
- Clicking the action produced a browser download rather than displaying customer data in a page or URL.
- The filename followed `booksmart-account-export-YYYY-MM-DD.json.gz`.
- The downloaded file was valid gzip-compressed JSON.
- The manifest version and stored-file count were present.
- The archive contained exactly the disposable owner and its organization within the checked account scope.
- The private object appeared under its original bucket and path.
- Decoding its base64 content reproduced the original binary bytes exactly.
- The exported SHA-256 checksum matched an independently calculated checksum.
- The browser showed the successful-download confirmation.
- Cleanup verification found zero disposable database users and organizations.
- A residual disposable Auth identity from an initial network-timeout attempt was identified and removed.
- The generated-artifact secret scan passed: 64 files checked against 14 configured secret values with no matches.

## Supporting validation

- Playwright browser acceptance: 1 passed, zero failed on the successful run.
- Frontend TypeScript check: passed.
- The API export regression tests and full API regression suite remain passing.

## Operational observation

The successful hosted export took about 21 seconds for a small disposable account because it performs completeness checks across every supported collection and Storage bucket. Correctness and completeness passed, but export latency should be included in large-account performance testing.

## Remaining limit

This acceptance test covers an immediate browser download with a real stored-file fixture. Accounts exceeding the current synchronous export limits require a future background or streaming export design. That capacity work belongs to performance and load testing.
