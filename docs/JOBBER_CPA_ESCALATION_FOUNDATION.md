# Jobber CPA Escalation Foundation

Status: preview-only foundation implemented. No CPA-visible signal, task, or
notification persistence is enabled.

## Conservative candidate rule

A preview candidate requires all of the following source evidence:

- active, non-archived Jobber job;
- exact Jobber status `requires_invoicing`;
- explicit `uninvoicedTotal` of at least $5,000;
- explicit Jobber `completedAt` at least 14 full days old.

The candidate is labeled operational, retains its Jobber source ID and direct
link, and states that the amount is not recognized BookSmart revenue.

## Consent and access

Apply `20260825_jobber_cpa_sharing_consent.sql` before using these endpoints.
Consent defaults to off and is organization-scoped. Only the authenticated
organization owner may read or change it.

- `GET /api/integrations/jobber/cpa-sharing?organization_id=<id>`
- `PUT /api/integrations/jobber/cpa-sharing`
- `GET /api/integrations/jobber/cpa-escalation-preview?organization_id=<id>`

The preview requires owner authentication and organization ownership. Future
eligibility requires both explicit owner consent and an active engagement with
an approved CPA. The preview itself remains available to the owner so missing
requirements can be reviewed safely.

Updating consent returns `cpa_visibility_changed: false` and creates zero
persistent escalations. The preview returns `dry_run: true`, `persisted: false`,
and `cpa_visibility_changed: false`.

## Still intentionally disabled

- CPA-visible Jobber signals and tasks;
- CPA notifications;
- automatic consent;
- accounting or transaction writes;
- escalation for unscheduled jobs;
- escalation without explicit completion and amount evidence.

## Owner interface

The connected Jobber card in Settings includes a default-off consent switch and
an on-demand CPA eligibility preview. The interface shows consent state, active
approved-engagement eligibility, threshold requirements, qualifying candidates,
and direct HTTPS Jobber links. Every state is labeled preview-only and confirms
that no CPA-visible record has been created.
