---
name: AI extraction route
description: /api/extract-document Express route — GPT-4o vision for financial document parsing
---

Route: POST `/api/extract-document` — requires auth (requireAuth middleware).

**Body (JSON, up to 15MB):** `{ fileData: string (base64), mimeType: string, docType: 'pnl'|'bs'|'cf' }`

**Content strategy:**
- Images (`image/*`): sent as `image_url` with base64 data URI, `detail: "high"`
- PDFs (`application/pdf`): sent as `image_url` with `data:application/pdf;base64,...`
- CSV/text: decoded and sent as plain text content

**Model:** `openai/gpt-4o` via OpenRouter; `response_format: { type: "json_object" }`; `temperature: 0`

**docType → category mapping (frontend):**
- `pnl` ← "Profit & Loss" or "Income Statement"
- `bs` ← "Balance Sheet"
- `cf` ← "Cash Flow Statement"
- `null` ← "Transactions" (no extraction)

**Response:** `{ extracted: {...}, docType: 'pnl'|'bs'|'cf' }`

**Prompts:** Exact replicas of Flutter's `AIExtractionService._getPromptForType` (in extract-document.ts).

**Why:** express.json() global limit raised to 15MB (in app.ts) to accommodate base64-encoded images/PDFs.

**Frontend flow (tax.tsx UploadDialog):**
1. User uploads → storage + DB insert (with `.select('id').single()` to get inserted ID)
2. If extractable category: step="extracting", call callExtractDocument()
3. On success: step="review", show extracted figures with confirm/skip
4. On confirm: PATCH `user_documents.parsed_data` with flattened extracted data + `ai_extracted: true`
5. On skip/error: close normally, document is already saved with base metadata
