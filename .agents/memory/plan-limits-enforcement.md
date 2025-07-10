---
name: Plan limits enforcement
description: How per-tier subscription usage limits and feature gates are enforced server-side without new DB tables.
---

Per-tier (free/plus/pro) usage limits and feature gates are enforced server-side in
`artifacts/api-server/src/lib/plan-limits.ts`, reused by `openai-chat.ts` (AI questions),
`document-upload.ts` (receipt/statement uploads), and a dedicated `plan-limits.ts` router
(usage summary + pre-check endpoint for AI tax strategies).

**Why:** No DDL/exec_sql capability exists against this Supabase project, so new "usage counter"
tables weren't an option. Usage is instead derived by counting existing rows for the current
month: `token_transactions` (zero-amount rows, type=`ai_question_usage`) for AI chat questions,
`ai_tax_strategies` rows for strategy generations, and `user_documents` rows (filtered by
`category === "Receipts"` vs. not) for uploads.

**How to apply:** When adding a new gated feature, prefer counting an existing table's rows over
adding a new one. Tier is resolved from the user's most recent active `subscriptions` row's
`stripe_price_id` (matched against `SUBSCRIPTION_PLANS` in `stripe-catalog.ts`), defaulting to
`free`. Known accepted gaps: transaction-count/month and "connected bank accounts" limits are
NOT enforced (no backend route/feature exists for either).
