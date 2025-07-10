---
name: DB schema & FK pattern
description: Supabase public.users columns and FK conventions used throughout the app
---

The `public.users` table has:
- `id bigint` — integer PK used for ALL foreign keys
- `auth_id uuid` — Supabase auth UUID (used only for storage path namespacing)
- `first_name`, `middle_name`, `last_name`, `phone_number`, `img_url`, `token_balance`
- NOT `full_name` or `phone` — the Flutter original used these column names

**Why:** use-auth.tsx queries these columns; using wrong names produces `numericId: null` which breaks all FK-based queries.

**How to apply:** Always use `profile.numericId` (integer) for `user_id` FK inserts/queries. Use `authUuid` only for storage paths.
