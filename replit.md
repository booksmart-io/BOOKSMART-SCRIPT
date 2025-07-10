# BookSmart

AI-powered financial management platform for US freelancers and small businesses, connecting them with vetted CPAs.

## Run & Operate

- `pnpm --filter @workspace/booksmart run dev` — run the BookSmart frontend (port 24254, preview at `/`)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, preview at `/api`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, wouter (routing), TanStack Query, recharts
- Auth + Data: Supabase (email/password + Google sign-in)
- API: Express 5 (OpenRouter proxy at `/api/openai-chat`)
- AI: OpenRouter (via Express proxy; key stored as `OPENROUTER_API_KEY` env var)

## Where things live

- `artifacts/booksmart/src/App.tsx` — top-level router + auth guard
- `artifacts/booksmart/src/pages/` — all page components (auth/, user/, cpa/, admin/)
- `artifacts/booksmart/src/components/layout/dashboard-layout.tsx` — shared sidebar layout
- `artifacts/booksmart/src/hooks/use-auth.tsx` — Supabase auth hook + AuthProvider
- `artifacts/booksmart/src/lib/supabase.ts` — Supabase client (URL + anon key)
- `artifacts/booksmart/src/index.css` — BookSmart theme (dark navy + gold color palette)
- `artifacts/api-server/src/routes/openai-chat.ts` — OpenRouter proxy route (uses `OPENROUTER_API_KEY`)

## Architecture decisions

- **No Replit DB / Drizzle** — all data lives in Supabase; `lib/db/` is unused.
- **Flutter → React conversion** — original app was Flutter Web; rewritten in React+Vite to run on Replit.
- **Role-based routing** — `user`, `cpa`, `admin` roles read from Supabase user metadata; router redirects to the correct dashboard on login.
- **OpenRouter via proxy** — frontend calls `/api/openai-chat` (Express); the `OPENROUTER_API_KEY` never reaches the browser. Uses `openai/gpt-4o-mini` model by default.
- **Dark mode default** — ThemeProvider defaults to dark, persisted in localStorage.

## Product

Three user roles with dedicated dashboards:
- **Users** (freelancers/SMBs): transaction tracking, AI tax strategies, financial reports, CPA marketplace, orders, AI chat, token wallet
- **CPAs**: lead management, order fulfillment, earnings tracking, client chat
- **Admins**: user/CPA management, category & tax deduction configuration, platform settings

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `DATABASE_URL` is NOT required — Supabase handles all data. Do not add `@workspace/db` imports to `api-server`.
- Supabase anon key in `src/lib/supabase.ts` is intentionally public (it's the client-safe key).
- API server runs at `/api` path prefix; all Express routes must be under `/api/`.
- Vite dev server for booksmart uses port `24254` (set by `PORT` env var from artifact config).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
