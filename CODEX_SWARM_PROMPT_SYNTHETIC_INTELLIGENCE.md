# Codex swarm prompt: BookSmart synthetic intelligence validation

Use a multi-agent swarm to implement and audit the cases in
`BOOKSMART_SYNTHETIC_INTELLIGENCE_CASES.md`.

## Objective

Prove that BookSmart independently connects QuickBooks, Jobber, Gmail,
Plaid/bank activity, payroll, receipts, and contract evidence and generates
financial insights through the normal production pipeline. Do not hard-code
expected insights or expose the validator answer key to the application.

## Non-negotiable rules

- Seed raw provider-shaped records only.
- Do not insert expected insight titles, recommendations, severity, or final
  conclusions into application tables.
- Do not add scenario-name, tenant-ID, or fixture-amount branches to production
  code.
- Do not call a test-only path that bypasses ingestion, normalization,
  matching, or analysis.
- Keep the answer key exclusively in validator/test code.
- Do not weaken an assertion to make a test pass.
- Record product gaps honestly instead of creating fixture-specific fixes.
- Use synthetic data and sandbox/development integrations only.
- Never commit credentials or real customer records.

## Agent roles

### Agent 1: Case and ground-truth designer

Review every Markdown case. Define provider inputs, reporting cutoff,
cross-source relationships, intentional contradictions, independently proven
ground truth, supported findings, prohibited findings, tolerances, and required
evidence. Keep expectations outside application-visible payloads.

### Agent 2: Provider fixture and isolation engineer

Create deterministic QuickBooks, Jobber, Gmail, Plaid/bank, payroll, receipt,
and contract fixtures at the closest real integration boundary. Implement
idempotent reset and seed operations for isolated tenants. Prove that no answer
key or expected insight reaches application storage or prompts.

### Agent 3: Intelligence and evidence auditor

Trace every result from raw source records through normalization, entity
matching, calculations, monitoring/intelligence generation, persistence, and
UI evidence. Identify unsupported conclusions, missed findings, wrong amounts,
unsafe recommendations, stale-source errors, and provenance gaps. Do not write
scenario-specific workarounds.

### Agent 4: E2E, security, and reporting lead

Verify authentication, tenant isolation, UI results, financial amounts,
evidence navigation, healthy-case suppression, missing-source behavior,
contradiction handling, videos, traces, and the shareable HTML report. Run
scenario validation, API tests, typecheck, lint if configured, and production
builds.

### Agent 5: Visual evidence experience engineer

Build a customer-facing evidence map for each material insight. It must show
the QuickBooks, Jobber, Gmail, bank, payroll, receipt, and contract records that
were actually used; the keys that connected them; the calculation path; missing
or conflicting evidence; confidence; and the recommended action. Every source
node must open the corresponding BookSmart record. Reuse the product's existing
design system and make the view accessible and responsive. Do not render a
fixture-authored or decorative graph: derive it from persisted production
provenance and matching results.

## Execution sequence

1. Inspect the existing fixture framework, provider adapters, database models,
   intelligence pipeline, and UI.
2. Map each Markdown case into application-visible source data and a separate
   validator-only answer key.
3. Implement deterministic reset, seed, ingest, normalize, match, and analyze
   commands without bypassing production logic.
4. Independently calculate expected financial outcomes.
5. Verify application storage contains source records but no pre-generated
   expected insights.
6. Run normal BookSmart analysis.
7. Compare results with the independent answer key.
8. Run Playwright against the customer-facing UI.
9. Open each important insight's visual evidence map and verify its nodes,
   connections, calculation, confidence, and record links.
10. Audit production code for fixture leakage or scenario-specific logic.
11. Produce a technical integrity report and a concise executive report.

## Anti-cheating audit

Search for and report:

- Scenario IDs or names in production code.
- Assertion phrases or expected insight titles in seed payloads.
- Direct writes to insight/result tables.
- Test-only branches affecting financial analysis.
- Fixed answer-key amounts copied into production logic.
- Prompts containing expected conclusions.
- UI mocks replacing real API output.
- Evidence graphs built from fixture expectations instead of persisted runtime
  provenance.
- Authentication or tenant-isolation bypasses.

Any leakage invalidates the affected test until removed.

## Required deliverables

1. Machine-readable fixtures for every case and intended provider.
2. Validator-only answer keys and independent mathematical validation.
3. Deterministic reset, seed, ingest, analyze, and test commands.
4. Playwright tests that verify stable insight types, amounts, entities,
   evidence, recommendations, and prohibited false positives.
5. A visual evidence view that shows the cross-system source graph, matching
   reasons, calculation path, confidence, contradictions, and source links.
6. Videos for every test plus traces and screenshots on failure, including the
   evidence view being opened and inspected.
7. An integrity audit proving the normal intelligence pipeline generated the
   results.
8. A final report covering provider coverage, numeric accuracy, false
   positives, false negatives, evidence quality, isolation, product defects,
   and readiness for supervised live-data validation.

## Completion criteria

Do not report completion merely because Playwright is green. Completion
requires correct independent calculations, normal pipeline execution, answer
key separation, evidence-backed conclusions, safe uncertainty handling,
tenant-isolation coverage, a customer-visible cross-system evidence map, a
clean anti-cheating audit, and documented full regression results.
