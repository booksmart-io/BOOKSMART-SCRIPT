# BookSmart Performance and Load Test Results

## Status

**INITIAL HOSTED LOAD GATE: PASS**

Executed September 8, 2026 against the BookSmart development Supabase project with disposable synthetic accounts. All predefined thresholds passed, and tenant isolation remained enforced during concurrent activity.

## Hosted test profile

- Three organizations were active simultaneously.
- The primary organization contained 2,500 transactions spanning 2025–2026.
- 100 health requests and 10 authenticated status requests were measured.
- A complete customer export was validated for all 2,500 transactions.
- Two exports ran concurrently while a third was required to be rejected.
- 20 concurrent cross-tenant monitoring attempts were made.
- Process memory was sampled throughout the run.

## Results

| Measurement | Result | Threshold | Outcome |
| --- | ---: | ---: | --- |
| Health API p95 | 18 ms | 250 ms | PASS |
| Authenticated API p95 | 1,326 ms | 5,000 ms | PASS |
| 2,500-transaction export | 18,801 ms | 60,000 ms | PASS |
| Export archive size | 68,906 bytes | Informational | Complete |
| Two concurrent exports | 15,547 ms | 90,000 ms | PASS |
| Third-export rejection | 278 ms, HTTP 429 | 5,000 ms | PASS |
| Cross-tenant requests denied | 20 of 20 | 20 of 20 | PASS |
| Process RSS growth | 35 MiB | 256 MiB | PASS |

The export manifest reported exactly 2,500 transactions. No tested request produced cross-tenant data or exceeded the configured export concurrency ceiling.

## Cleanup verification

The first run exposed an ordering defect in the test harness cleanup: deleting an organization before its transactions caused the transaction activity trigger to reject a notification referencing the removed organization. The exact disposable fixture was repaired. Cleanup now deletes transactions in bounded pages, clears generated notifications, then removes the organization, profile, and Auth identity. A hosted smoke rerun passed. Final matching counts were zero for profiles, organizations, transactions, and Auth identities.

## Scope and remaining work

This is an initial load gate, not production capacity certification. The full performance section remains open for:

- thousands of invoices and Jobber jobs;
- large Gmail-result and document collections;
- deployed page-load and search timing;
- simultaneous provider synchronizations, callbacks, and insight generation;
- infrastructure CPU, database load, error rate, retry rate, and worker backlog; and
- a longer soak test using production-like resources.

The authenticated status endpoint was consistently classified as slow at roughly 1.1–1.6 seconds, although it remained within the 5-second threshold. Export setup overhead was approximately 15 seconds even for a small fixture. These are optimization candidates before production service-level targets are finalized.

## Reproduction

Run `pnpm run e2e:performance-load` from `artifacts/api-server`. The runner requires hosted test credentials. `E2E_LOAD_TRANSACTION_COUNT` overrides the default 2,500-transaction fixture size.
