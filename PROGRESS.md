# BookSmart — Development Progress Log

**Platform:** Replit (migrated from Vercel)  
**Stack:** React + Vite · Express 5 · Supabase · OpenRouter AI · pnpm workspaces  
**Last updated:** June 29, 2026

---

## 1. Migration: Flutter Web → React + Vite on Replit

The original BookSmart application was a **Flutter Web** app hosted on **Vercel**. It was fully rewritten as a **React + Vite** single-page application running on Replit.

### What changed

| Before | After |
|---|---|
| Flutter Web (Dart) | React + Vite (TypeScript) |
| Vercel hosting | Replit (pnpm monorepo) |
| Firebase/custom backend | Supabase (auth + database) |
| Direct API key exposure | Express proxy for AI keys |

### Monorepo structure

```
workspace/
├── artifacts/
│   ├── booksmart/          # React+Vite frontend (port 24254, preview at /)
│   └── api-server/         # Express 5 backend  (port 8080,  preview at /api)
├── packages/
│   └── api-spec/           # OpenAPI spec + codegen (Zod schemas, TanStack Query hooks)
└── pnpm-workspace.yaml
```

### Core technology choices

- **Routing:** Wouter (lightweight, replaces React Router)
- **UI:** shadcn/ui + Tailwind CSS with a dark navy + gold theme
- **State/fetching:** TanStack Query (React Query v5)
- **Auth:** Supabase email/password + Google sign-in
- **AI:** OpenRouter (via Express proxy) — key never reaches the browser
- **Charts:** Recharts

---

## 2. Authentication & Role-Based Routing

Three user roles, each with a dedicated dashboard:

| Role | Dashboard path | Purpose |
|---|---|---|
| `user` | `/` | Freelancers/SMBs — transactions, AI strategies, CPA marketplace |
| `cpa` | `/cpa` | CPAs — lead management, order fulfillment, earnings, client chat |
| `admin` | `/admin` | Platform management — users, CPAs, categories, tax deductions |

On login, `use-auth.tsx` reads the role from Supabase user metadata and the router in `App.tsx` redirects to the correct dashboard automatically.

### User profile chain

```
Supabase auth.users (uuid)
  → public.users (bigint id, auth_id uuid, token_balance, full_name, phone, …)
  → public.organizations (owner_id = users.id)
  → public.transactions (org_id = organizations.id)
```

The `numericId` (bigint PK from `public.users`) is the key used for all data queries — not the Supabase UUID.

---

## 3. PDF Upload & Bank Statement Processing

### Flow

```
User uploads PDF (tax.tsx)
  → Supabase Storage  (user-documents bucket)
  → user_documents table  (metadata)
  → POST /api/extract-text
        ├── Text PDF  → pdf-parse v1.1.1 extracts raw text
        └── Scanned PDF → Gemini 2.5 Flash (via OpenRouter) OCRs the image
  → statement_imports table  (extracted_text, status: "processing")
  → n8n webhook fires
        → GPT processes extracted text
        → inserts rows into pending_transactions
        → sets statement_imports.status = "completed"
  → Review dialog appears in UI
  → User approves/rejects each transaction
  → Approved rows move to transactions table
  → Dashboard updates in real time
```

### `/api/extract-text` endpoint

- **Location:** `artifacts/api-server/src/routes/extract-text.ts`
- Text PDFs: uses `pdf-parse` v1.1.1 (v2.x breaks — exports a class, not a function; must use `createRequire` to load it in ESM)
- Scanned PDFs: sends file to `google/gemini-2.5-flash` via OpenRouter for OCR
- Always returns `is_scanned: false` — n8n's image path fails on PDF files, so the text path is always used
- `org_id` is always included in the `statement_imports` insert (was missing initially, causing RLS failures)

### Key bugs fixed

| Bug | Root cause | Fix |
|---|---|---|
| `pdf-parse` crash | v2.4.5 exports a class; called as function | Downgraded to v1.1.1 |
| Gemini 404 errors | Wrong model IDs (`gemini-2.0-flash-001`, `gemini-flash-1.5`) | Correct ID: `google/gemini-2.5-flash` |
| `statement_imports` insert failed | Missing `org_id` field | Always pass `org_id` from org lookup |
| Org query silently failing | Error not destructured → `orgId` stayed null | Added `{ data, error }` destructuring + throw |

---

## 4. Dashboard — Real-Time Data

### Data loading chain

```
useAuth() → profile.numericId
  → organizations WHERE owner_id = numericId  → orgId
    → transactions WHERE org_id = orgId       → tx data
```

The dashboard subscribes to Supabase real-time changes on `transactions` so the UI updates automatically when n8n writes new approved transactions.

### What's live

| Section | Data source |
|---|---|
| Total Income | Sum of positive `transactions.amount` this month |
| Expenses | Sum of negative `transactions.amount` this month |
| Net Profit | Income − Expenses |
| Token Balance | `users.token_balance` (live query, refreshes after AI spend) |
| Recent Transactions | Last 5 rows from `transactions` (all time) |

---

## 5. Business Power Score (BPS)

The BPS is now **calculated live** from the user's real data — it is no longer hardcoded.

### Formula

```
score = 15 (base)
      + min(30, txCount × 3)       # transactions ever
      + min(20, docCount × 5)      # documents uploaded
      + 10 if hasOrg
      + 10 if profileComplete (full_name + phone)
      + 10 if netPositive (income > expenses this month)
      + 5  if no pending reviews and txCount > 0
      → capped at 100
```

### Level / Rank system

| Score | Level | Title |
|---|---|---|
| 95–100 | 10 | Profit Machine |
| 85–94 | 9 | Cashflow Builder |
| 75–84 | 8 | Entrepreneur |
| 65–74 | 7 | Achiever |
| 55–64 | 6 | Builder+ |
| 45–54 | 5 | Builder |
| 35–44 | 4 | Explorer+ |
| 25–34 | 3 | Explorer |
| 15–24 | 2 | Beginner |
| 0–14 | 1 | Starter |

**XP** = `txCount × 50 + docCount × 100`  
**Streak** = distinct transaction dates in the 5 most recent transactions (proxy; full login-event tracking is a future improvement)

---

## 6. Today's Missions

Missions are now **real checks** against Supabase data:

| Mission | Done condition |
|---|---|
| Upload a bank statement | `docCount > 0` |
| Approve AI-scanned transactions | `pendingCount === 0 && txCount > 0` |
| Upload tax documents | `docCount >= 2` |
| Unlock AI tax strategies | AI Insight has been unlocked this session |

Each incomplete mission shows its XP reward; completed missions are struck through.

---

## 7. Achievements

Six achievements backed by real Supabase data:

| Achievement | Done condition |
|---|---|
| First Upload | `docCount > 0` |
| 5-Day Streak | `streakDays >= 5` |
| Profit+ | `netProfit > 0 && txCount > 0` |
| Tax Ready | `docCount >= 4` |
| AI Chat | (future — chat table check) |
| Reporting | (future — report generation check) |

---

## 8. Business Challenges

Three progress bars calculated from real transaction and document data:

| Challenge | Formula |
|---|---|
| Revenue Growth | `(thisMonthIncome / lastMonthIncome) × 100`, capped at 100% |
| Tax Readiness | `(docCount / 4) × 100`, capped at 100% |
| Cash Flow Score | `income / (income + expenses) × 100`, capped at 100% |

Sub-labels show context ("vs $X,XXX last month", "X/4 documents uploaded", etc.).

---

## 9. AI Insight (Token-Gated)

Clicking **"Unlock & View"** on the AI Insight card triggers a real OpenRouter call:

1. Checks `token_balance >= 150`
2. Sends the user's month transactions + income/expense summary to `openai/gpt-4o-mini` via `/api/openai-chat`
3. Asks for 3–5 US tax-saving strategies in structured JSON
4. Displays total savings potential + strategy preview in the card
5. Deducts 150 tokens from `users.token_balance` in Supabase
6. Invalidates the live token balance query so the wallet updates immediately

If the user has fewer than 150 tokens, the button is disabled and shows how many more are needed.

---

## 10. Funding Readiness

The Funding card now shows an **estimated score based on BPS** (rather than a hardcoded "82"):

- Score = `round(bpsScore × 0.85)`
- Label changes by score tier: "Loan Ready" (≥70), "Getting There" (≥45), "Build Credit First" (<45)

---

## 11. Dun & Bradstreet

The D&B card is now clearly marked as **"Not connected"** — it requires a real D&B API integration which has not been set up. The hardcoded score (78) has been removed to avoid misleading users.

---

## 12. Token Wallet

The Token Wallet now shows:
- Live token balance (separate React Query, refreshes after every AI spend)
- Cost for each action (AI Insights: 150, Monthly report: 100, CPA consultation: 200, Banking recommendations: 75)

---

## What Remains Hardcoded / Needs Future Work

| Feature | Status |
|---|---|
| AI Tax Strategies page | Still has 3 hardcoded example strategies — needs real OpenRouter call |
| CPA dashboard | Likely has hardcoded placeholder data |
| Admin dashboard | Likely has hardcoded placeholder data |
| Login streak tracking | Approximated from tx dates — needs a `login_events` table |
| AI Chat achievement | Not wired to a real chat messages table yet |
| Reporting achievement | Not wired to report generation yet |
| D&B integration | Requires a D&B API key — external service |

---

## Environment & Secrets

| Secret | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | AI calls (OpenRouter proxy in Express) |
| `STRIPE_SECRET_KEY` | Payments (Stripe integration) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe frontend key |
| Supabase URL + anon key | In `src/lib/supabase.ts` — intentionally public (client-safe key) |

---

## Key File Reference

| File | Purpose |
|---|---|
| `artifacts/booksmart/src/App.tsx` | Top-level router + auth guard |
| `artifacts/booksmart/src/pages/user/dashboard.tsx` | Main user dashboard (fully dynamic) |
| `artifacts/booksmart/src/pages/user/tax.tsx` | PDF upload + statement review dialog |
| `artifacts/booksmart/src/pages/user/ai-strategy.tsx` | AI Tax Strategies (still hardcoded) |
| `artifacts/booksmart/src/hooks/use-auth.tsx` | Supabase auth + profile hook |
| `artifacts/booksmart/src/lib/supabase.ts` | Supabase client |
| `artifacts/booksmart/src/index.css` | Dark navy + gold theme tokens |
| `artifacts/api-server/src/routes/extract-text.ts` | PDF text extraction + Gemini OCR fallback |
| `artifacts/api-server/src/routes/openai-chat.ts` | OpenRouter proxy (OPENROUTER_API_KEY) |
| `artifacts/api-server/src/routes/index.ts` | Route registration |
| `artifacts/api-server/build.mjs` | esbuild config (pdf-parse in externals) |
