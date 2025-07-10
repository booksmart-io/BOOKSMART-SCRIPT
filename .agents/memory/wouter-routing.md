---
name: Wouter routing pattern
description: Switch+Route with function children is unreliable in wouter v3; use location map approach instead.
---

# Wouter v3 Routing

**Rule:** Do NOT use `<Switch>` + `<Route path="...">{() => <Component />}</Route>` — the function-children pattern causes 404 pages to render even on matched routes in wouter 3.x.

**Why:** In wouter v3, Switch iterates children but function-children routes don't short-circuit correctly, causing the NotFound fallback to also render.

**How to apply:** Use a route table (plain object mapping path → component+role), read `useLocation()`, and return the matched component directly. See `artifacts/booksmart/src/App.tsx` for the canonical pattern with `USER_ROUTES`, `CPA_ROUTES`, `ADMIN_ROUTES` maps.
