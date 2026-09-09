# BookSmart P0 Onboarding Test Results

Run date: September 2, 2026
Environment: Local BookSmart browser application on port 5173
Result: **28 of 28 passed**
Video: **Enabled for every test (28 videos)**

## What passed

- Signed-out visitors are directed to login.
- Signed-out users cannot open owner, CPA, or admin pages.
- Signup clearly presents email, password, confirmation, role, and legal-consent controls.
- The CPA role choice can be selected and reversed.
- Refusing consent safely returns the visitor to login.
- Weak passwords, mismatched passwords, and missing consent are blocked before an account request is made.
- The email-verification field accepts numeric input, limits input to six characters, and blocks early submission.
- Missing verification context safely returns the visitor to signup.
- Invalid password-reset email input is blocked locally without sending an email.
- Core signup controls follow a usable keyboard order.
- Login, signup, reset, and verification screens fit a 320-pixel mobile viewport without horizontal overflow.

## Controlled lifecycle simulation

- Consented owner signup sends the expected email, role, and legal-consent metadata and opens verification.
- CPA selection is preserved with pending-verification status in the signup request.
- A duplicate-account response remains on signup and directs the visitor toward sign-in or password reset.
- An expired or invalid verification code fails safely and remains retryable.
- A validly formatted password-reset request uses the entered address and shows a neutral confirmation.

## Returning synthetic owner experience

- A completed owner reaches a useful dashboard without creating another business.
- Saved personal and business profile sections reopen with a usable continuation path.
- The current organization’s business survey is reachable without changing saved answers.
- The document repository and upload entry point are available without uploading a file.
- Dashboard, profile, organization, and document screens fit a 320-pixel owner viewport.

## Authentication resilience

- Signup rate limiting stays on signup, displays the problem, and never reports false success.
- A temporary signup failure can be retried into one verification flow.
- Repeated signup clicks while the request is pending produce only one account request.
- A temporary verification failure retains the pending email and permits retry.
- Password-reset rate limiting stays visible and never displays a false email-sent confirmation.

## Safety boundary

This run intentionally did **not** create accounts, send verification or password-reset email, connect financial providers, invite users, or initiate payments. External authentication responses were simulated at the network boundary. Real delivery requires a controlled environment and approved test inboxes/accounts.

## Next controlled gate

Use dedicated test email addresses and non-production Supabase/provider environments to verify actual signup delivery, valid/expired/reused OTP codes, duplicate-account behavior, reset-link completion, logout/session expiry, profile completion, business setup, document upload, survey save/resume, and the first dashboard experience.

## Evidence

- Interactive report: `onboarding-report/index.html`
- Per-test videos and failure artifacts: `test-results/onboarding/`
- Test suite: `e2e/onboarding/p0-onboarding.spec.ts`
- Configuration: `playwright.onboarding.config.ts`
