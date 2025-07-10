---
name: AI tax strategies persistence
description: ai-strategy.tsx AI-generated strategies are persisted to Supabase table `ai_tax_strategies`, not local-only state.
---

The `ai_tax_strategies` Supabase table already existed (org_id, user_id FKs; columns: title, summary, category, estimated_savings, risk_level, audit_risk, implementation_steps jsonb, tags, ai_context, created_at) but the AI Strategy page's `generate()` only wrote to local React state, so results were lost on refresh/navigation.

Fixed by loading strategies via `useQuery` keyed on `["ai_tax_strategies", orgId]` on mount, and having `generate()` delete-then-insert rows for the org after a successful AI call, then invalidating that query key. The UI's `Strategy` type (difficulty/status) doesn't map 1:1 onto the table (risk_level/audit_risk) — see `rowToStrategy`/`riskFromDifficulty`/`auditRiskFromStatus` mapping helpers.

**Why:** Before assuming a new table/migration is needed for persistence gaps in this Supabase-backed app, check the live schema first (`GET {SUPABASE_URL}/rest/v1/` lists all PostgREST-exposed tables) — this project's Supabase project already had many tables created directly via the Supabase SQL editor that aren't reflected in the repo's `supabase/migrations.sql` file.

**How to apply:** When a "data disappears on refresh" bug traces to `useState`-only storage, first check whether a matching Supabase table already exists via the PostgREST root endpoint before proposing new DDL (which this environment cannot execute directly — no `exec_sql`/`exec` RPC exists, and Replit's built-in `database` skill only targets Replit's own Postgres, not external Supabase).
