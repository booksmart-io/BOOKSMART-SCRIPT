# BookSmart — Daily Report

**Date:** June 29, 2026
**Platform:** Replit
**Project:** BookSmart — AI-powered financial management platform for US freelancers & SMBs
**Prepared by:** Development Team

---

## Overview

This report covers all development work completed on the BookSmart platform, from the initial migration off Vercel through to today's dynamic dashboard features. The platform serves three user roles — freelancers/SMBs, CPAs, and admins — with AI-powered financial tools, bank statement processing, and a CPA marketplace.

---

## Phase 1 — Platform Migration (Flutter Web → React + Vite on Replit)

### Background

The original BookSmart app was built in **Flutter Web** and hosted on **Vercel**. It was fully rewritten as a modern **React + TypeScript** application running on **Replit** to enable faster iteration, better AI integration, and a unified monorepo development environment.

### What Was Rebuilt

| Before (Vercel) | After (Replit) |
|---|---|
| Flutter Web (Dart) | React + Vite (TypeScript) |
| Vercel hosting | Replit pnpm monorepo |
| Firebase / custom backend | Supabase (auth + database + storage) |
| API keys exposed in frontend | Express 5 proxy — keys never reach the browser |
| Single deployment target | Separate frontend and API server artifacts |

### Monorepo Structure

```
workspace/
├── artifacts/
│   ├── booksmart/        — React + Vite frontend   (port 24254, preview at /)
│   └── api-server/       — Express 5 backend        (port 8080,  preview at /api)
├── packages/
│   └── api-spec/         — OpenAPI spec + Zod/TanStack Query codegen
└── pnpm-workspace.yaml
```

### Technology Stack Chosen

| Layer | Technology | Reason |
|---|---|---|
| Frontend framework | React + Vite | Fast HMR, TypeScript-first |
| Routing | Wouter | Lightweight, no overhead |
| UI components | shadcn/ui + Tailwind CSS | Consistent dark navy + gold theme |
| Data fetching | TanStack Query (React Query v5) | Caching, real-time invalidation |
| Auth + Database | Supabase | Handles auth, RLS, real-time, storage |
| AI | OpenRouter via Express proxy | Access to GPT-4o-mini, Gemini 2.5 Flash |
| Charts | Recharts | Financial data visualisation |
| Node.js | v24 | Latest LTS |
| TypeScript | 5.9 | Full-stack type safety |

---

## Phase 2 — Authentication & Role-Based Routing

Three user roles were implemented, each with a completely separate dashboard experience:

| Role | Path | Purpose |
|---|---|---|
| `user` | `/` | Freelancers/SMBs — transactions, AI strategies, CPA marketplace, token wallet |
| `cpa` | `/cpa` | CPAs — lead management, order fulfilment, earnings, client chat |
| `admin` | `/admin` | Platform management — users, CPAs, categories, tax deductions, settings |

### How It Works

On every login, `use-auth.tsx` reads the role from Supabase user metadata. The router in `App.tsx` guards each route and automatically redirects the user to the correct dashboard — no manual navigation required.

### Database Identity Chain

A critical architectural detail: Supabase authentication uses UUIDs, but all business data is keyed on a separate **bigint** `id` in the `public.users` table:

```
auth.users (uuid)  ─→  public.users (bigint id, auth_id uuid)
                              ↓
                   organizations (owner_id = users.id)
                              ↓
                   transactions (org_id = organizations.id)
```

Every dashboard query resolves this chain: UUID → numericId → orgId → data.

---

## Phase 3 — PDF Upload & Bank Statement Processing

### End-to-End Flow

```
User selects PDF on Transactions page (tax.tsx)
  │
  ├─→ File uploaded to Supabase Storage (user-documents bucket)
  ├─→ Metadata saved to user_documents table
  └─→ POST /api/extract-text called
          │
          ├─ Text PDF  ──→ pdf-parse v1.1.1 extracts raw text
          └─ Scanned PDF ─→ google/gemini-2.5-flash (OpenRouter) performs OCR
          │
          └─→ Row inserted into statement_imports
                  (extracted_text, org_id, status: "processing")
                        │
                        └─→ Supabase webhook fires → n8n automation
                                  │
                                  ├─→ GPT reads extracted_text
                                  ├─→ Inserts rows into pending_transactions
                                  └─→ Sets statement_imports.status = "completed"
                                              │
                                              └─→ Review dialog opens in UI
                                                      │
                                                      ├─ User approves row → moves to transactions
                                                      └─ User rejects row  → discarded
                                                                │
                                                                └─→ Dashboard updates in real time
```

### `/api/extract-text` Endpoint

- **File:** `artifacts/api-server/src/routes/extract-text.ts`
- Accepts multipart PDF upload
- Text PDFs → `pdf-parse` v1.1.1 (CommonJS, loaded via `createRequire`)
- Scanned PDFs → `google/gemini-2.5-flash` via OpenRouter for OCR
- Always returns `is_scanned: false` — n8n's image processing path fails on PDFs, so the text path is always used regardless of scan status

### Bugs Found and Fixed

| # | Bug | Root Cause | Fix Applied |
|---|---|---|---|
| 1 | `pdf-parse` crashed on every call | v2.4.5 exports a class, not a callable function | Downgraded to v1.1.1; loaded via `createRequire` in ESM |
| 2 | Gemini returned 404 errors | Wrong model IDs used (`gemini-2.0-flash-001`, `gemini-flash-1.5`) | Correct ID confirmed: `google/gemini-2.5-flash` |
| 3 | `statement_imports` insert rejected by RLS | `org_id` field was missing from the insert payload | Always resolve and pass `org_id` before inserting |
| 4 | Dashboard showed empty even with data | `error` not destructured from org query → `orgId` silently stayed `null` | Added `{ data, error }` + `throw error`; added diagnostic logging |

---

## Phase 4 — Dashboard: Real-Time Financial Data

The four top-level stat cards are now fully live:

| Card | Source |
|---|---|
| Total Income | Sum of positive `transactions.amount` this month |
| Expenses | Sum of negative `transactions.amount` this month |
| Net Profit | Income − Expenses (calculated client-side) |
| Token Balance | Live query on `users.token_balance` |

The dashboard also subscribes to **Supabase real-time** changes on the `transactions` table. When n8n writes approved transactions, the UI refreshes automatically — no page reload needed.

### Diagnostic Logging Added

To track data loading issues, the following console logs were added (visible in browser DevTools):

```
[dashboard] numericId: 1  orgId: 4
[dashboard] tx_month rows: 20
[dashboard] tx_recent rows: 5
```

---

## Phase 5 — Business Power Score (BPS)

Previously hardcoded as `80`. Now **calculated live** from six real data inputs:

### Formula

```
BPS = 15 (base)
    + min(30,  allTimeTxCount × 3)     ← more transactions = higher score
    + min(20,  docCount × 5)           ← more documents = higher score
    + 10  if hasOrganization
    + 10  if profileComplete (name + phone filled in)
    + 10  if net profit positive this month
    + 5   if no pending transaction reviews (all approved)
    → capped at 100
```

### 10-Level Rank System

| BPS Score | Level | Title |
|---|---|---|
| 95 – 100 | 10 | Profit Machine |
| 85 – 94 | 9 | Cashflow Builder |
| 75 – 84 | 8 | Entrepreneur |
| 65 – 74 | 7 | Achiever |
| 55 – 64 | 6 | Builder+ |
| 45 – 54 | 5 | Builder |
| 35 – 44 | 4 | Explorer+ |
| 25 – 34 | 3 | Explorer |
| 15 – 24 | 2 | Beginner |
| 0 – 14 | 1 | Starter |

The gauge, level badge, rank title, and "Next rank" label all update as the score changes.

### XP & Streak

| Metric | Formula |
|---|---|
| XP | `allTimeTxCount × 50 + docCount × 100` |
| Streak (days) | Distinct transaction dates in the 5 most recent transactions |

---

## Phase 6 — Today's Missions

Previously 4 static, always-identical missions. Now **real checks** against Supabase data, with a live completion counter:

| Mission | Completed When |
|---|---|
| Upload a bank statement | `docCount > 0` |
| Approve AI-scanned transactions | `pendingCount === 0 && allTxCount > 0` |
| Upload tax documents (P&L, Balance Sheet) | `docCount >= 2` |
| Unlock AI tax strategies | AI Insight has been unlocked this session |

Completed missions show a strikethrough and "Done" badge. The card header shows "X/4 complete".

---

## Phase 7 — Achievements

Previously 6 static badges (all hardcoded as done/not-done). Now **live checks** against Supabase:

| Achievement | Condition | Live? |
|---|---|---|
| First Upload | `docCount > 0` | ✅ |
| 5-Day Streak | `streakDays >= 5` | ✅ |
| Profit+ | `netProfit > 0 && allTxCount > 0` | ✅ |
| Tax Ready | `docCount >= 4` | ✅ |
| AI Chat | Chat messages table check | 🔜 Future |
| Reporting | Report generation check | 🔜 Future |

---

## Phase 8 — Business Challenges

Previously 3 hardcoded progress bars (68%, 45%, 72%). Now **calculated from real transaction and document data**, with contextual sub-labels:

| Challenge | Formula | Sub-label Example |
|---|---|---|
| Revenue Growth | `(thisMonthIncome ÷ lastMonthIncome) × 100` capped at 100% | "vs $2,400 last month" |
| Tax Readiness | `(docCount ÷ 4) × 100` capped at 100% | "2/4 documents uploaded" |
| Cash Flow Score | `income ÷ (income + expenses) × 100` capped at 100% | "$5,000 in / $1,200 out" |

---

## Phase 9 — AI Insight (Token-Gated, Real AI Call)

Previously showed a hardcoded "$6,470 across 5 strategic insights". Now triggers a **real OpenRouter API call** when the user clicks "Unlock & View":

### Steps

1. Verifies user has ≥ 150 tokens in their wallet
2. Collects the user's last 30 transactions + monthly income/expense summary
3. Sends a structured prompt to `openai/gpt-4o-mini` via `/api/openai-chat`
4. Asks for 3–5 specific US tax-saving strategies in JSON format
5. Parses and displays: total savings potential + strategy list with savings per item
6. Deducts 150 tokens from `users.token_balance` in Supabase
7. React Query invalidates the token balance — wallet updates immediately

If the user has fewer than 150 tokens, the button is disabled and shows exactly how many more tokens are needed.

---

## Phase 10 — Funding Readiness

Previously hardcoded as "Loan Ready / 82 points". Now **data-driven based on BPS**:

| BPS Range | Label | Score |
|---|---|---|
| ≥ 70 | Loan Ready | `round(bpsScore × 0.85)` |
| 45 – 69 | Getting There | `round(bpsScore × 0.85)` |
| < 45 | Build Credit First | `round(bpsScore × 0.85)` |

---

## Phase 11 — Dun & Bradstreet Card

Previously showed a hardcoded score of `78` with "Good" / "Business age: 4 Years" — all fabricated data. This has been replaced with an honest **"Not connected"** state:

- Gauge is greyed out showing `—`
- Explanation that a D&B account connection is required
- Disabled "Connect D&B Account" button (requires D&B API key integration)

---

## Phase 12 — Token Wallet

| Before | After |
|---|---|
| Balance from auth profile (stale) | Separate live React Query on `users.token_balance` |
| No token costs listed | Costs shown for each action |
| Refreshed only on login | Refreshes immediately after any token spend |

Token costs displayed:

| Action | Cost |
|---|---|
| AI Insights | 150 tokens |
| Monthly report | 100 tokens |
| CPA consultation | 200 tokens |
| Banking recommendations | 75 tokens |

---

## New Supabase Queries Added

| Query key | Table | Purpose |
|---|---|---|
| `user_org` | `organizations` | Resolve orgId from numericId |
| `tx_month` | `transactions` | This month's income/expenses |
| `tx_recent` | `transactions` | Last 5 transactions for dashboard list |
| `tx_count` | `transactions` | All-time count for BPS calculation |
| `tx_last_month` | `transactions` | Last month income for Revenue Growth |
| `doc_count` | `user_documents` | Document count for BPS + Tax Readiness |
| `pending_count` | `pending_transactions` | Pending review count for Missions |
| `token_balance` | `users` | Live token balance (refreshable separately) |

---

## Environment & Secrets

| Secret | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | All AI calls — GPT-4o-mini, Gemini 2.5 Flash |
| `STRIPE_SECRET_KEY` | Stripe payments integration |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe frontend key |
| Supabase URL + anon key | In `src/lib/supabase.ts` — intentionally public (client-safe key) |

---

## Key Files Reference

| File | Status | Purpose |
|---|---|---|
| `artifacts/booksmart/src/App.tsx` | ✅ Done | Router + auth guard + role redirect |
| `artifacts/booksmart/src/pages/user/dashboard.tsx` | ✅ Done | Full dynamic user dashboard |
| `artifacts/booksmart/src/pages/user/tax.tsx` | ✅ Done | PDF upload + statement review dialog |
| `artifacts/booksmart/src/pages/user/ai-strategy.tsx` | 🔜 Hardcoded | AI Tax Strategies — needs real AI call |
| `artifacts/booksmart/src/hooks/use-auth.tsx` | ✅ Done | Supabase auth + profile (numericId, role, tokens) |
| `artifacts/booksmart/src/lib/supabase.ts` | ✅ Done | Supabase client initialisation |
| `artifacts/booksmart/src/index.css` | ✅ Done | Dark navy + gold theme tokens |
| `artifacts/api-server/src/routes/extract-text.ts` | ✅ Done | PDF text extraction + Gemini OCR fallback |
| `artifacts/api-server/src/routes/openai-chat.ts` | ✅ Done | OpenRouter proxy (keeps API key server-side) |
| `artifacts/api-server/src/routes/index.ts` | ✅ Done | Route registration |
| `artifacts/api-server/build.mjs` | ✅ Done | esbuild config (pdf-parse in externals) |

---

## What Still Needs Doing

| Feature | Priority | Notes |
|---|---|---|
| AI Tax Strategies page — real AI call | High | Replace 3 hardcoded cards with live OpenRouter call |
| CPA dashboard — real data | High | Leads, orders, earnings from Supabase |
| Admin dashboard — real data | High | User/CPA counts, category config |
| Login streak tracking | Medium | Needs `login_events` table; currently approximated |
| D&B API integration | Low | Requires D&B account + API key |
| AI Chat achievement | Low | Wire to chat messages table |
| Reporting achievement | Low | Wire to report generation |
| Stripe payments | Pending | Keys configured; UI integration TBD |
