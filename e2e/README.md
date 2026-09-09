# Synthetic business E2E

This directory contains deterministic, test-only business scenarios. Provider
fixtures model records at BookSmart's existing integration boundaries. Answer
keys are loaded only by validators and tests; application code must never read
them.

The database seeding layer is intentionally gated until an isolated test
Supabase project is configured. Never point scenario reset or seed commands at
production or a shared customer environment.
