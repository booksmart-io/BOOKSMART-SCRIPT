# BookSmart Backend Security Review and Remediation Plan

**Review date:** July 31, 2026

**Scope:** `artifacts/api-server`, production dependencies, authentication, authorization, file handling, paid-provider usage, and baseline API hardening

**Review type:** Static source review, dependency advisory audit, and TypeScript validation. This was not an active penetration test.

## Executive summary

The review found four application-level vulnerabilities that should be fixed before the next production deployment, plus a vulnerable spreadsheet-processing dependency and several defense-in-depth gaps.

The highest-priority risks are:

1. A user may be able to affect another user's statement import by supplying its numeric ID.
2. A client-controlled flag can bypass the monthly AI usage check and generate unbounded provider costs.
3. A missing upload category bypasses monthly document-upload limits.
4. An unauthenticated download proxy can consume server memory and bandwidth.
5. User-controlled spreadsheets are parsed by a version of `xlsx` affected by high-severity prototype-pollution and denial-of-service advisories.

Fixing these issues protects customer data boundaries, prevents avoidable OpenAI and infrastructure costs, makes plan enforcement reliable, reduces outage risk, and provides stronger evidence that BookSmart handles financial documents responsibly.

## Findings

### BS-SEC-01 — Cross-user statement-import mutation

**Severity:** High (P1)

**Location:** `artifacts/api-server/src/routes/scan-statement.ts`

**Relevant areas:** Lines 235–242, 352–367, and 410–416

When an `importId` is supplied, the route queries for an import belonging to the authenticated user. If no matching row exists, processing continues instead of rejecting the request. Later, the unverified `importId` is used when inserting pending transactions. The failure helper also updates a statement import using only its ID, without a user-ownership condition.

**Potential impact:** An authenticated attacker who discovers or guesses an import ID could corrupt another customer's import state or associate unexpected processing results with it. This breaks tenant isolation for financial-document workflows.

**Required fix:**

- Reject an unknown or unowned `importId` before document processing begins.
- Require the authenticated user's numeric ID in every import-related update and insert.
- Change `markFailed` to filter by both `id` and `user_id`.
- Add two-user authorization tests for success, failure, and pending-transaction insertion paths.

**Benefit of fixing:** Restores reliable customer-data isolation, prevents cross-account corruption, and reduces privacy, support, and compliance risk.

### BS-SEC-02 — Client-bypassable AI usage limit

**Severity:** High (P1)

**Location:** `artifacts/api-server/src/routes/openai-chat.ts`

**Relevant area:** Lines 328–352

The monthly AI quota is checked only when the client-provided `use_live_context` value is not `false`. A user can therefore send `use_live_context: false` and continue making paid provider requests after reaching the plan limit.

**Potential impact:** Unbounded OpenAI usage, unexpected operating costs, unfair plan access, and denial of service if automated requests exhaust budgets or capacity.

**Required fix:**

- Enforce the quota independently of `use_live_context`.
- Determine internal/non-billable operations server-side.
- Reserve or increment usage atomically before the provider request to prevent concurrent-request bypasses.
- Add per-user and per-IP rate limits.

**Benefit of fixing:** Makes subscription entitlements trustworthy, controls provider spending, prevents abuse, and preserves service capacity for legitimate customers.

### BS-SEC-03 — Document-upload quota bypass

**Severity:** High (P1)

**Location:** `artifacts/api-server/src/routes/document-upload.ts`

**Relevant area:** Lines 39–69

Monthly upload limits are enforced only when the caller includes a `category`. Because the field is optional and controlled by the client, omitting it skips the check while the server still accepts and stores a file of up to 50 MB.

**Potential impact:** Storage-cost growth, plan abuse, inconsistent billing enforcement, and resource exhaustion through repeated large uploads.

**Required fix:**

- Require a category from a strict server-side allowlist.
- Determine or verify the file class server-side where possible.
- Enforce quotas on every applicable upload route.
- Reserve allowance atomically before storing the object.

**Benefit of fixing:** Prevents storage abuse, protects margins, ensures customers receive the limits associated with their plans, and produces accurate usage data.

### BS-SEC-04 — Unauthenticated, unbounded download proxy

**Severity:** Medium (P2)

**Location:** `artifacts/api-server/src/routes/document-download.ts`

**Relevant area:** Lines 7–46

The endpoint does not require authentication and buffers the complete upstream response in server memory. The host is restricted to the BookSmart Supabase project, which limits general SSRF exposure, but there is no response-size limit, request timeout, user-ownership verification, or rate limit.

**Potential impact:** Repeated large downloads could consume server memory, bandwidth, and outbound connections, causing elevated costs or an availability incident.

**Required fix:**

- Require authentication and verify object ownership.
- Accept a storage path rather than a caller-provided full URL.
- Generate a short-lived signed URL or stream the object with a strict byte limit.
- Add upstream timeouts and route-specific rate limiting.

**Benefit of fixing:** Reduces denial-of-service and bandwidth risk while ensuring documents are downloaded only through an authorized account context.

### BS-SEC-05 — Vulnerable XLSX parser processes user input

**Severity:** High (P1)

**Locations:** `artifacts/api-server/package.json` and `artifacts/api-server/src/routes/extract-document.ts`

**Relevant parser area:** Lines 76–80 of `extract-document.ts`

The backend uses `xlsx` 0.18.5 to parse user-controlled workbooks. The production dependency audit reported:

- High: prototype pollution in SheetJS, `GHSA-4r6h-8v6p-xvw6`.
- High: SheetJS regular-expression denial of service, `GHSA-5pgg-2g8v-p4x9`.

The audit found seven advisories across the workspace: five high, one moderate, and one low. The two SheetJS findings directly affect the backend file-processing path; the other reported dependency paths primarily pass through frontend `exceljs` dependencies.

**Potential impact:** A malicious workbook could consume excessive CPU or affect application objects during parsing, potentially causing service instability or unexpected application behavior.

**Required fix:**

- Upgrade or replace `xlsx` with a maintained, non-vulnerable parser.
- Limit compressed size, expanded size, worksheets, rows, columns, and processing time.
- Consider parsing untrusted office files in an isolated worker process.
- Rerun the production dependency audit after regenerating the lockfile.

**Benefit of fixing:** Reduces the chance that a hostile document can crash or manipulate the API process and makes document ingestion safer for financial records.

## Additional hardening opportunities

These were not ranked above the confirmed vulnerabilities, but they materially improve resilience:

- Configure an explicit CORS allowlist instead of the default `cors()` behavior.
- Add security headers with Helmet or equivalent middleware.
- Add global and sensitive-route rate limits.
- Add server, upstream-fetch, and document-processing timeouts.
- Validate file signatures instead of trusting supplied MIME types and filenames.
- Return stable public error messages and keep provider/database details only in sanitized server logs.
- Review every Supabase service-role operation for an authenticated ownership condition.
- Add automated secret scanning and dependency auditing to CI.

## Remediation plan

### Phase 1 — Release-blocking authorization and abuse fixes

**Target:** Before the next production deployment

1. Fix statement-import ownership validation and add cross-user tests.
2. Enforce AI quotas independently of client flags and make usage accounting atomic.
3. Require and validate upload categories; enforce upload quotas consistently.
4. Authenticate and bound the document-download route.

**Exit criteria:** All four issues have regression tests, two test users cannot access or modify one another's records, and quota-bypass tests fail closed.

### Phase 2 — File-processing and dependency safety

**Target:** Immediately after Phase 1, or in the same release if XLSX upload remains enabled

1. Upgrade or replace `xlsx`.
2. Introduce document complexity and processing-time limits.
3. Upgrade affected `exceljs` transitive dependencies.
4. Run `pnpm audit --prod --audit-level moderate` and document any accepted residual risk.

**Exit criteria:** No known high-severity production advisory remains in a backend path that processes attacker-controlled input.

### Phase 3 — API-wide hardening

**Target:** Next security-hardening sprint

1. Add explicit CORS, security headers, rate limits, and request/upstream timeouts.
2. Centralize sanitized error responses.
3. Inventory service-role routes and verify ownership enforcement.
4. Add file-signature validation and private-storage rules.

**Exit criteria:** Security middleware is enabled in staging and production, and every privileged data operation has a documented authorization rule.

### Phase 4 — Verification and ongoing prevention

1. Run API type checking and all unit/integration tests.
2. Add security regression tests to CI.
3. Run dependency and secret scanning on every pull request.
4. Conduct staging-only penetration testing with two ordinary users, a CPA account, and an admin account.
5. Re-review Stripe, Plaid, referral email, storage, and admin flows after the fixes land.

## Expected business benefits

| Improvement | Business benefit |
|---|---|
| Strong tenant authorization | Protects customer financial information and reduces breach and compliance exposure. |
| Reliable quota enforcement | Controls OpenAI, storage, and infrastructure costs while protecting subscription revenue. |
| Safer file parsing | Reduces outage risk from malicious or malformed documents. |
| Authentication and rate limiting | Makes automated abuse more difficult and preserves availability. |
| Centralized security controls | Reduces the chance that future routes ship without required protections. |
| Automated security checks | Detects regressions earlier, when they are less expensive to fix. |
| Documented verification tests | Gives engineering and stakeholders evidence that the fixes work as intended. |

## Validation performed

- Static review of API routes, authentication middleware, service-role database access, uploads, downloads, paid AI requests, and webhook handling.
- `pnpm --filter @workspace/api-server typecheck` completed successfully.
- `pnpm audit --prod --audit-level moderate` identified seven workspace advisories.
- Repository scan found no committed literal provider keys in the reviewed source; `.env` and `.env copy` are not tracked by Git.

## Current risk decision

The statement-import authorization issue, AI quota bypass, upload quota bypass, and vulnerable backend XLSX parser should be treated as release-blocking. The download proxy and API-wide hardening items should follow promptly because they reduce the likelihood and impact of automated abuse and availability incidents.
