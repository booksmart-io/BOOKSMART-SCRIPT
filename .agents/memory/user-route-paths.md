---
name: User route paths
description: Actual top-level route paths for BookSmart's user-role pages, to avoid 404s when navigating or testing
---

BookSmart's user dashboard is registered at the route `/user`, not `/user/dashboard`. Other user pages follow `/user/<name>` (e.g. `/user/reports`, `/user/tax`, `/user/settings`).

**Why:** The dashboard is the "index" page for the user role, so it doesn't get a `/dashboard` suffix like other role pages might suggest by analogy. Navigating directly to `/user/dashboard` 404s even though the component is conventionally called `dashboard.tsx`.

**How to apply:** When writing e2e test plans, screenshot paths, or links, check `artifacts/booksmart/src/App.tsx`'s route table for the exact path rather than assuming `/user/<page-file-name>`.
