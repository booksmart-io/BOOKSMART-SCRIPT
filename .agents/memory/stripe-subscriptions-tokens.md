---
name: Stripe subscriptions & tokens architecture
description: How BookSmart's subscription tiers (Free/Plus/Pro) and token purchases are wired to Stripe, and where the source of truth lives.
---

Supabase already has `subscriptions` and `token_transactions` tables (pre-existing, not in `supabase/migrations.sql`) — check the live schema via the PostgREST root before assuming new tables/columns are needed. `users.token_balance` and `users.stripe_customer_id` also already existed.

Stripe products/prices for the 3 tiers (Free has no Stripe price) and 4 token packages were created via `scripts/src/seed-stripe-products.ts` (idempotent — searches by `metadata.plan_key` before creating) and their IDs are hardcoded in `artifacts/api-server/src/lib/stripe-catalog.ts`. Re-run the seed script if the Stripe account/mode changes; update the catalog file with the new IDs it prints.

**Why no webhook:** setting up a Stripe webhook requires a signing secret, and this project has no Replit-managed Stripe connection (just a plain `STRIPE_SECRET_KEY`/`VITE_STRIPE_PUBLISHABLE_KEY` secret pair) and no clean way to obtain a webhook secret without pausing for user input. Instead, `/api/stripe/confirm-checkout` is called by the frontend right after Stripe's success redirect; it re-verifies the session server-side via `stripe.checkout.sessions.retrieve` (checks `payment_status === "paid"` and that `metadata.user_id` matches the authenticated caller) before granting tokens or activating a subscription. It's idempotent (checks for an existing `token_transactions` row by `stripe_checkout_session_id`, or an existing `subscriptions` row by `stripe_subscription_id`).

**How to apply:** if a real webhook is added later (e.g. via the `stripe` skill's managed integration), keep `confirm-checkout`'s idempotency checks — a webhook and the success-redirect confirmation could both fire for the same session.
