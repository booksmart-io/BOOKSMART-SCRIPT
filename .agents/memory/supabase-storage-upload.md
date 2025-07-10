---
name: Supabase Storage upload flow
description: Upload file to Supabase Storage bucket then insert DB record — the correct two-step pattern used in BookSmart.
---

# Supabase Storage Upload Pattern

**Rule:** Always upload file first (storage.upload), then get publicUrl, then insert the DB row. Never store file bytes in the DB.

**Why:** Matches Flutter TaxDocumentController.uploadDocument() flow; Supabase Storage bucket is named `documents`.

**How to apply:**
1. `supabase.storage.from("documents").upload(path, bytes, { contentType })`
2. `supabase.storage.from("documents").getPublicUrl(path)` → `data.publicUrl`
3. `supabase.from("user_documents").insert({ user_id, name, file_url, tax_year, category, file_size, mime_type, parsed_data })`

**Storage path convention:** `{userId}/{timestamp}_{filename}`

**For delete:** parse the storage path from the public URL after `/documents/` and call `storage.remove([path])` — best-effort (ignore errors).
