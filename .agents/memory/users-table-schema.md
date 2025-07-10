---
name: public.users table column names
description: Exact column names in the Flutter-originated public.users Supabase table; critical for auth lookup
---

The `public.users` table was created by the Flutter app and uses these column names:

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | integer PK, auto-increment |
| `auth_id` | uuid | FK to Supabase auth.users; used for lookups |
| `email` | text | |
| `role` | text | 'user', 'cpa', or 'admin' |
| `first_name` | text | NOT `full_name` |
| `middle_name` | text | |
| `last_name` | text | NOT `name` |
| `phone_number` | text | NOT `phone` |
| `img_url` | text | |
| `token_balance` | int | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Why:** Querying with wrong column names (`full_name`, `phone`) silently returns a Supabase error, causing the fallback path to set `numericId: null`. That in turn means all FK-based table queries (user_documents, orders, etc.) never match any rows.

**How to apply:** Always SELECT the exact column names above. Build `full_name` in JS from `[first_name, middle_name, last_name].filter(Boolean).join(" ")`.

All FK columns in other tables (user_documents.user_id, orders.user_id, etc.) reference the integer `id`, NOT the auth UUID.
