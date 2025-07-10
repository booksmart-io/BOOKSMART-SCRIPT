---
name: Sonner toasts need their own mount
description: sonner's toast() calls render nothing unless sonner's own Toaster component is mounted, even if a different shadcn Toaster is already mounted.
---

This codebase has two separate toast systems: shadcn's `useToast` hook (backed by
`@/components/ui/toaster`'s `<Toaster/>`) and the `sonner` package's `toast()`
function (backed by `@/components/ui/sonner.tsx`'s `<Toaster/>`, which wraps
`Toaster as Sonner` from `"sonner"`).

**Why:** They are independent notification stacks with independent render
trees. Mounting one does not make the other's `toast()` calls appear — pages
that `import { toast } from "sonner"` will silently no-op (no error, no visual
feedback) if sonner's `<Toaster/>` isn't mounted somewhere in the tree.

**How to apply:** If a save/action calls `toast.success(...)` / `toast.error(...)`
from `"sonner"` and nothing appears in the UI, first check that sonner's
`<Toaster/>` (from `@/components/ui/sonner.tsx`) is mounted at the app root
(e.g. in `App.tsx`) alongside — not instead of — the shadcn `<Toaster/>` if
other pages still use `useToast()`. Both can coexist; they just need to both
be mounted if both APIs are used across the codebase.
