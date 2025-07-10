# BookSmart 📊

> AI-powered financial management platform for US freelancers and small businesses — connecting them with vetted CPAs.

---

## Overview

BookSmart is a full-stack financial management platform that gives freelancers and small business owners intelligent tax strategy, transaction tracking, and direct access to a marketplace of certified CPAs. The platform is role-based, with dedicated dashboards for **Users**, **CPAs**, and **Admins**.

---

## Features

### For Users (Freelancers & SMBs)
- **Dashboard** — Income/expense tracking, token wallet balance, recent transactions
- **AI Tax Advisor** — Chat with an AI powered by OpenRouter (GPT-4o mini) for personalised tax and financial advice
- **Financial Reports** — Categorised transactions with deductible flagging
- **CPA Marketplace** — Browse and hire vetted Certified Public Accountants
- **Order Management** — Track service requests from submission to completion
- **Token Wallet** — Platform credits for purchasing CPA services

### For CPAs
- **Lead & Order Management** — View and fulfil client service requests
- **Earnings Tracking** — Revenue dashboard with payment history
- **Client Communication** — Integrated messaging with clients

### For Admins
- **User & CPA Management** — Account oversight and role assignment
- **Category & Deduction Config** — Platform-wide tax category settings
- **Platform Settings** — System configuration

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, shadcn/ui |
| Routing | Wouter |
| Server State | TanStack Query |
| Charts | Recharts |
| Auth & Database | Supabase (PostgreSQL + Auth) |
| API Server | Express 5, TypeScript |
| AI | OpenRouter (GPT-4o mini via Express proxy) |
| Mobile | Expo (React Native) |
| Monorepo | pnpm workspaces, Node.js 24, TypeScript 5.9 |

---

## Project Structure

```
artifacts/
├── booksmart/          # React + Vite web application
│   └── src/
│       ├── pages/      # auth/, user/, cpa/, admin/ dashboards
│       ├── components/ # Shared UI components + layout
│       ├── hooks/      # useAuth + TanStack Query hooks
│       └── lib/        # Supabase client, utilities
├── booksmart-mobile/   # Expo React Native companion app
│   └── app/
│       ├── (auth)/     # Login, signup, forgot password
│       ├── (tabs)/     # User dashboard tabs (5 screens)
│       └── (cpa-tabs)/ # CPA dashboard tabs (4 screens)
└── api-server/         # Express 5 API + OpenRouter proxy
    └── src/routes/     # /api/openai-chat and other endpoints
```

---

## Getting Started

### Prerequisites
- Node.js 24+
- pnpm 9+
- A [Supabase](https://supabase.com) project

### Environment Variables

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API key (server-side only) |
| `STRIPE_SECRET_KEY` | Stripe secret key (payments) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (frontend) |

### Run Locally

```bash
# Install dependencies
pnpm install

# Start the web app (port 24254)
pnpm --filter @workspace/booksmart run dev

# Start the API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Start the mobile app
pnpm --filter @workspace/booksmart-mobile run dev
```

---

## Architecture Notes

- **Role-based routing** — `user`, `cpa`, `admin` roles are read from Supabase user metadata; the router redirects to the correct dashboard on login.
- **AI proxy** — The frontend calls `/api/openai-chat` (Express); the `OPENROUTER_API_KEY` never reaches the browser.
- **Mode B data layer** — All data lives in Supabase. The mobile app connects directly to Supabase using the same project — no separate mobile backend needed.
- **Dark mode default** — ThemeProvider defaults to dark, persisted in `localStorage`.

---

## Roadmap

- [ ] Push notifications for order updates (mobile)
- [ ] Stripe payment integration (credentials ready)
- [ ] Enhanced financial analytics & charts
- [ ] CPA onboarding & verification flow

---

## License

Private — All rights reserved.
