# BookSmart Contractor Intelligence Swarm Results

## Executive result

**Source of truth:** `C:\Users\Admin\Downloads\BOOKSMART_CONTRACTOR_INTELLIGENCE_TEST_CASES.md`

The repository does **not** currently contain deterministic seeds and end-to-end assertions for these exact 16 scenarios. The existing 13-scenario suite covers related behavior, but none of its fixtures exactly matches the new document's complete source combinations, amounts, evidence chains, and required outputs.

| Result | Count |
|---|---:|
| Exact scenarios | 16 |
| PASS | 0 |
| PARTIAL | 15 |
| FAIL | 1 |
| Exact fixture/answer-key definitions validated | 16 |
| Critical unresolved product gaps | 0 |
| High-severity unresolved product gaps | 1 |
| Existing scenario fixture validations | 13 passed |
| Validator regression tests | 2 passed |
| Intelligence/API regression tests | 158 passed |

**Strict product readiness against this exact specification: 46.9%.** This is a weighted coverage indicator (`PASS = 1`, `PARTIAL = 0.5`, `FAIL = 0`) rather than production certification. Fixture validation is not counted as a product pass.

## Test execution notes

- Existing deterministic scenario validation: **13 passed, 0 failed**.
- Existing validator tests: **2 passed, 0 failed**.
- Existing intelligence/API tests: **158 passed, 0 failed**.
- Exact source-of-truth fixtures and rich answer keys: **16 validated, 0 invalid**.
- Intelligence/API tests after remediation: **160 passed, 0 failed**.
- Scenario 5 and 15 reconciliation rules now pass focused tests; they remain PARTIAL until normalized provider correlation keys are wired into ingestion and browser validation.
- Ambiguous equal-score job matches now remain unassigned **and** are routed for human confirmation.
- Existing Playwright regression was attempted against `http://127.0.0.1:5173`.
- The first two browser tests failed because `/user/insights` rendered only the notification regions; the Insights heading and financial summary were absent. The run was stopped after the same page-rendering failure occurred twice.
- A green result from the existing suites is not treated as execution of the new 16 scenarios.

## Scenario results

### Scenario 1 — Bank + Gmail Only with Zelle Activity

- **Result:** PARTIAL
- **Seed verification:** Exact seed absent. Existing closest coverage is Scenario 07 plus transfer-exclusion unit coverage.
- **Expected numeric values:** Starting cash `$12,500`; customer deposits `$3,650`; listed outflows `$1,749.78`; savings transfer `$1,500` excluded from revenue.
- **Actual numeric values:** Not produced for this exact fixture.
- **Matches/duplicate handling:** Generic transfers can be excluded, but Zelle-to-Gmail customer-payment reconciliation is not tested.
- **Missing/unsupported:** No exact Zelle classification, email-to-bank link, or duplicate-email evidence guard.
- **Evidence/confidence:** Incomplete.
- **Severity:** High
- **Recommended fix:** Add exact Plaid/Gmail fixture, economic-event IDs, transfer classification, uncertainty assertions, and evidence-map checks.

### Scenario 2 — Organized Contractor with Payroll and Contracts

- **Result:** PARTIAL
- **Seed verification:** Exact Plaid + QuickBooks + Gmail fixture absent.
- **Expected numeric values:** Payments/invoices `$25,500`; payroll `$6,800`; lumber `$3,450`; insurance `$1,200`.
- **Actual numeric values:** Not produced for this exact fixture.
- **Matches/duplicate handling:** Payroll and vendor obligations have related coverage; contract-as-supporting-evidence and bank/QB economic-event deduplication do not.
- **Missing/unsupported:** Fully paid contract reconciliation and three-source vendor reconciliation.
- **Evidence/confidence:** Partial source provenance only.
- **Severity:** High
- **Recommended fix:** Seed the exact contract, invoices, payments, and obligations; assert one economic event per payment/expense.

### Scenario 3 — QuickBooks + Jobber Only

- **Result:** PARTIAL
- **Seed verification:** Similar margin fixture exists, but amounts and jobs differ.
- **Expected numeric values:** Wilson cost `$4,850`; margin `$4,650`; estimated cost `$4,500`.
- **Actual numeric values:** Exact Wilson results not produced.
- **Matches/duplicate handling:** Confirmed job-cost assignments support margin calculation; full autonomous suggestion/confirmation remains outside browser coverage.
- **Missing/unsupported:** Exact estimate-overrun assertion and Rivera in-progress treatment.
- **Evidence/confidence:** Supported only after confirmed assignment.
- **Severity:** Medium
- **Recommended fix:** Add Wilson/Rivera fixture and exercise suggestion → human confirmation → assignment.

### Scenario 4 — All Four Sources Connected

- **Result:** PARTIAL
- **Seed verification:** No single existing fixture connects the exact Parker, Davis, and Eastside records across all four sources.
- **Expected numeric values:** Parker margin `$11,000`; Davis receivable `$5,000`; Eastside deposit `$8,750`.
- **Actual numeric values:** Not produced for this exact fixture.
- **Matches/duplicate handling:** Individual capabilities exist across separate scenarios; end-to-end evidence chain is absent.
- **Missing/unsupported:** One visual chain from Jobber → QB → bank → Gmail for each material conclusion.
- **Evidence/confidence:** Partial.
- **Severity:** High
- **Recommended fix:** Create one exact all-source tenant and assert cash, receivable, margin, risk, and evidence nodes together.

### Scenario 5 — Duplicate and Conflicting Data

- **Result:** PARTIAL
- **Seed verification:** Exact `$5,000` four-copy payment and `$420/$425` conflict absent.
- **Expected numeric values:** One `$5,000` economic payment; unresolved `$5` expense discrepancy.
- **Actual numeric values:** Focused reconciliation produces one `$5,000` event and preserves `$420/$425` as `needs_review`.
- **Matches/duplicate handling:** Implemented in the conservative economic-event reconciler; not yet wired into normalized provider ingestion.
- **Conflicts:** Both observed values and source evidence are preserved.
- **Unsupported/invented risk:** Reduced by the new rule; end-to-end proof remains pending.
- **Evidence/confidence:** Focused unit evidence passes; browser evidence pending.
- **Severity:** High
- **Recommended fix:** Wire explicit provider correlation keys into ingestion and add exact browser coverage.

### Scenario 6 — Unpaid Invoice / Receivable Risk

- **Result:** PARTIAL
- **Seed verification:** Related overdue Jobber/QB/Gmail scenario exists, but the exact `$15,000`, 45-day, `$8,500` fixture does not.
- **Expected numeric values:** AR `$15,000`; job margin `$6,500` before collection status.
- **Actual numeric values:** Not produced for this exact fixture.
- **Matches/duplicate handling:** Overdue aging and completed-job invoice logic exist.
- **Missing/unsupported:** Gmail payment-delay evidence is not fully attached to receivable provenance.
- **Evidence/confidence:** Partial.
- **Severity:** Medium
- **Recommended fix:** Add the exact fixture and assert separate revenue, margin, AR, cash, and email-delay evidence.

### Scenario 7 — Completed but Unbilled Work

- **Result:** PARTIAL
- **Seed verification:** Strong related E2E coverage exists, but it uses five jobs totaling `$18,450`, not one `$8,000` job with `$3,600` costs.
- **Expected numeric values:** Unbilled work `$8,000`; associated costs `$3,600`.
- **Actual numeric values:** Exact values not produced.
- **Matches/duplicate handling:** Completed Jobber work with missing QB invoice is supported and visually evidenced.
- **Missing/unsupported:** Exact cost association assertion.
- **Evidence/confidence:** Strong partial coverage.
- **Severity:** Medium
- **Recommended fix:** Add the exact single-job fixture and cost-evidence assertion.

### Scenario 8 — Loss-Making Job

- **Result:** PARTIAL
- **Seed verification:** Existing margin-leak scenario uses different amounts.
- **Expected numeric values:** Margins: A `$5,000`, B `$7,000`, C `-$1,500`.
- **Actual numeric values:** Exact values not produced.
- **Matches/duplicate handling:** Confirmed tracked-loss detection exists.
- **Missing/unsupported:** Exact three-job comparison and loss-driver explanation.
- **Evidence/confidence:** Depends on confirmed assignments.
- **Severity:** Medium
- **Recommended fix:** Seed exact jobs/costs and assert that Job C remains visible despite company profitability.

### Scenario 9 — Payroll and Cash Shortfall Risk

- **Result:** PARTIAL
- **Seed verification:** Related Plaid/Gmail cash-shortfall E2E exists; QuickBooks liabilities and exact amounts are absent.
- **Expected numeric values:** Cash `$9,000`; obligations `$11,700`; shortfall `$2,700`; later payment `$8,000` excluded from immediate cash.
- **Actual numeric values:** Existing fixture uses cash `$20,000`, obligations `$25,500`, shortfall `$5,500`.
- **Matches/duplicate handling:** Immediate obligation math is supported.
- **Missing/unsupported:** QB liability reconciliation and later-receivable timing.
- **Evidence/confidence:** Plaid/Gmail visual evidence exists in the related scenario.
- **Severity:** Medium
- **Recommended fix:** Add exact liability and payment dates; assert time ordering explicitly.

### Scenario 10 — Personal Transfer vs Business Revenue

- **Result:** PARTIAL
- **Seed verification:** No exact E2E fixture; transfer exclusion exists at unit level.
- **Expected numeric values:** Customer revenue `$6,300`; personal/savings transfers excluded.
- **Actual numeric values:** Not produced for this fixture.
- **Matches/duplicate handling:** Generic transfer flags are excluded from canonical totals.
- **Missing/unsupported:** Robust ACH/check/customer classification and uncertainty presentation.
- **Evidence/confidence:** Incomplete.
- **Severity:** High
- **Recommended fix:** Add exact Plaid-only fixture and classification-confidence assertions.

### Scenario 11 — Customer Concentration Risk

- **Result:** PARTIAL
- **Seed verification:** Existing concentration E2E uses `$100,000` total and 48%, not the specified values.
- **Expected numeric values:** Total `$165,000`; Customer A `72.7%`.
- **Actual numeric values:** Exact values not produced.
- **Matches/duplicate handling:** Concentration calculation and source preservation exist.
- **Missing/unsupported:** Exact QB/Jobber recognized-revenue reconciliation.
- **Evidence/confidence:** Partial.
- **Severity:** Medium
- **Recommended fix:** Add exact annual figures and cross-source no-double-count assertion.

### Scenario 12 — Missing Sources / Graceful Degradation

- **Result:** PARTIAL
- **Seed verification:** A no-QuickBooks tenant exists, but not a previously connected/disconnected QuickBooks lifecycle.
- **Expected numeric values:** No fixed amount; useful intelligence with reduced confidence.
- **Actual numeric values:** Related scenario produces available-source insights.
- **Matches/duplicate handling:** Missing inputs are exposed; bank-to-Gmail/Jobber exact matches are not proven.
- **Missing/unsupported:** Overall confidence does not consistently reduce solely because QuickBooks is missing.
- **Evidence/confidence:** Partial.
- **Severity:** High
- **Recommended fix:** Add disconnect state, freshness metadata, confidence assertions, and explicit no-invented-QB checks.

### Scenario 13 — Ambiguous Job Matching

- **Result:** PARTIAL
- **Seed verification:** Exact J-301/J-302 and `$1,100` fixture absent.
- **Expected numeric values:** One `$1,100` expense left unassigned between two candidates.
- **Actual numeric values:** Unit coverage confirms equal candidates remain unmatched.
- **Matches/duplicate handling:** Equal candidates remain unmatched and are now routed for human confirmation.
- **Evidence/confidence:** Low-confidence/manual-review UI proof is missing.
- **Severity:** High
- **Recommended fix:** Add exact fixture, confirmation queue behavior, and visual evidence for both candidates.

### Scenario 14 — Stale or Delayed Integration Data

- **Result:** FAIL
- **Seed verification:** Exact `$11,000` same-day Plaid payment with stale unpaid QB invoice absent.
- **Expected numeric values:** One likely `$11,000` payment with a sync-lag qualification.
- **Actual numeric values:** Not produced; current related scenario preserves conflict but does not infer likely synchronization delay.
- **Matches/duplicate handling:** Freshness timestamps exist, but this three-source temporal reconciliation is missing.
- **Evidence/confidence:** Insufficient for the required conclusion.
- **Severity:** High
- **Recommended fix:** Add event-time-aware payment matching, source freshness explanation, and exact fixture.

### Scenario 15 — Refund / Reversal Handling

- **Result:** PARTIAL
- **Seed verification:** No exact E2E fixture or payment-to-refund provenance test.
- **Expected numeric values:** Net collected cash `$4,500` from `$6,000 - $1,500`.
- **Actual numeric values:** Focused reconciliation links the `$1,500` reversal and produces `$4,500` net collected cash.
- **Matches/duplicate handling:** QuickBooks credit and Plaid refund evidence consolidate into one reversal in the new reconciler.
- **Evidence/confidence:** Focused test passes; normalized ingestion and browser evidence remain pending.
- **Severity:** High
- **Recommended fix:** Wire the reconciler after explicit provider keys are normalized, then add exact QB/Plaid browser coverage.

### Scenario 16 — Contractor with Sparse Evidence

- **Result:** PARTIAL
- **Seed verification:** Related Plaid/Gmail ambiguous-spending fixture exists, but not 25 transactions with five supported records.
- **Expected numeric values:** No fixed total; known/likely/unknown separation with lower confidence.
- **Actual numeric values:** Exact fixture not produced.
- **Matches/duplicate handling:** Weak matches can remain unassigned; sparse evidence is not summarized into the required confidence presentation.
- **Evidence/confidence:** Incomplete.
- **Severity:** High
- **Recommended fix:** Add exact density/sparsity fixture and assert known, likely, unknown, and overall confidence states.

## Failure counts by category

| Category | Confirmed exact-spec failures/gaps |
|---|---:|
| Numeric-accuracy execution gaps | 12 |
| Duplicate-accounting failures | 1 critical |
| Cross-source matching gaps | 10 |
| Evidence/confidence gaps | 12 |
| Exact refund/reversal coverage | 1 failed |
| Exact stale-sync interpretation | 1 failed |

These counts identify missing proof against the new source-of-truth scenarios; they do not imply that every related production calculation is incorrect.

## Required next implementation phase

1. Add the 16 scenarios exactly as written to the scenario registry and guarded seed/reset tooling.
2. Extend the answer-key schema to record expected matches, duplicate outcomes, conflicts, missing/false-positive insights, evidence, confidence, severity, and remediation.
3. Add a cross-source economic-event model before declaring Scenarios 1, 2, 4, or 5 safe.
4. Add explicit stale-sync, refund/reversal, sparse-evidence, and ambiguous-assignment workflows.
5. Re-run validation, analysis, and Playwright for all 16 exact tenants.
6. Generate a fresh visual report only from those exact run results.

## Final determination

BookSmart has substantial related regression coverage, but the new 16-scenario contractor-intelligence specification is **not yet fully implemented or executed**. The product should not be represented as passing these cases until their exact seeds, evidence chains, values, and browser assertions exist.
