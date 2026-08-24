# Jobber Monitoring Rule Review

Status: the two approved owner-only rules are released for all connected
organizations through `JOBBER_MONITORING_ROLLOUT=all`.

## Shared safety requirements

- [x] Jobber records remain operational and never become BookSmart accounting entries.
- [x] Candidates remain owner-only with `requiresCpaReview: false`.
- [x] Candidate keys are deterministic for database upsert and lifecycle reconciliation.
- [x] Preview access and persistent-monitoring access use separate organization allowlists.
- [x] An absent persistent allowlist keeps signal, task, and notification creation disabled.
- [x] Product owner approved the conservative final wording and thresholds below by directing BookSmart to proceed safely.

## Rule 1: Job needs invoicing

Current proposed behavior:

- Trigger: an active Jobber job has the exact status `requires_invoicing` and an
  explicit finite `uninvoicedTotal` greater than zero.
- Candidate key: `jobber:requires-invoicing:<external job ID>`.
- Medium severity: amount greater than $0 and below $5,000.
- High severity: amount of $5,000 or more.
- Resolution: the candidate disappears when the job is archived, leaves
  `requires_invoicing`, or no longer has a positive amount.
- Accounting boundary: the description explicitly says the amount is not
  counted as BookSmart revenue.

Review:

- [x] Positive-path behavior is covered by automated tests.
- [x] The $4,999.99 and $5,000 severity boundary is covered by automated tests.
- [x] Status-based resolution is covered by an automated test.
- [x] Source Jobber record IDs are retained for traceability.
- [x] Current wording directs the owner to review and invoice in Jobber.
- [x] Approved $5,000 as the limited-pilot high-severity threshold.
- [x] Approved the user-facing title, description, and recommended action after removing unsupported completion wording.
- [x] Rejected generic amount fallback. The rule requires an explicit positive
  `uninvoicedTotal`; missing evidence produces no candidate.

Important limitation: this rule currently means "Jobber says the job requires
invoicing." It must not be described as "completed visit not invoiced" until
Jobber supplies and BookSmart validates sufficient visit-completion evidence.

## Rule 2: Active jobs are unscheduled

Current proposed behavior:

- Trigger: one or more active, non-archived Jobber jobs have exact status
  `unscheduled`.
- Candidate key: `jobber:unscheduled-active-jobs` (one aggregate candidate per
  organization).
- Medium severity: 1–4 unscheduled jobs.
- High severity: 5 or more unscheduled jobs.
- Resolution: the candidate disappears when no active job remains unscheduled.
- Accounting boundary: this is operational scheduling information only.

Review:

- [x] Positive-path and traceable-source behavior is covered by automated tests.
- [x] The 4-job and 5-job severity boundary is covered by automated tests.
- [x] The zero-unscheduled resolution state is covered by an automated test.
- [x] The candidate remains owner-only.
- [x] Approved five jobs as the limited-pilot high-severity threshold.
- [x] Approved the user-facing title, description, and recommended action.
- [x] Deferred job-age and job-value scoring to a later separately reviewed version.

## Rollout decision

All approval boxes above are resolved. Persistent evaluation is code-restricted
to `jobber:requires-invoicing:*` and `jobber:unscheduled-active-jobs` for every
connected organization; the other preview rules cannot be newly persisted.
Historical Jobber keys remain lifecycle-managed only so a normal evaluation
can resolve them and complete linked tasks without deletion. The release has no
CPA visibility and no accounting writes. The organization allowlist remains
available as an immediate rollback from global rollout.

## Pilot observation supporting rollout

The read-only audit after the first restricted sync passed on 2026-08-14:

- Two approved signals are active: one requires-invoicing job and one aggregate
  unscheduled-jobs signal.
- Three pre-restriction signals are resolved.
- Their linked legacy tasks are completed through normal lifecycle handling.
- Two approved owner tasks remain open.
- All nine notification events are suppressed from delivery.
- No signal is CPA-visible, no task is assigned outside the owner role, no
  accounting-effect metadata is present, and no duplicate active keys or event
  keys were found.
- A follow-up evidence audit matched both active signals to current synchronized
  Jobber source records: one active unscheduled job and one job with explicit
  positive `uninvoicedTotal` in `requires_invoicing` status. No current false
  positive was detected.
- A subsequent stability audit produced the same approved active conditions,
  with no duplicate keys, deliverable notifications, CPA exposure, or
  accounting impact. Lifecycle resolution remains pending because the source
  conditions are still active in synchronized Jobber data.
