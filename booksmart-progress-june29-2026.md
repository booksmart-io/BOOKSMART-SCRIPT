# BookSmart — Development Progress
**Date:** June 29, 2026

---

## Done Today

### 1. PDF Upload Error Handling (Bank Statement Scanning)
- Added proper error surfacing for storage, database, and import errors during PDF upload
- Fixed the file upload to pass the `File` object directly to Supabase storage (instead of ArrayBuffer, which caused upload failures)
- Ensured `org_id` is always included when inserting into `statement_imports` (was missing, causing DB constraint errors)

### 2. `/api/extract-text` Endpoint (API Server)
- Created a new Express route (`POST /api/extract-text`) that accepts a base64-encoded PDF
- Uses `pdf-parse` to extract raw text from digital (text-layer) PDFs
- Returns `{ text, isScanned }` for the frontend to use before inserting into `statement_imports`

### 3. Frontend Integration with `/api/extract-text`
- Updated the bank statement upload flow in the Transactions page
- Before inserting into `statement_imports`, the app now calls `/api/extract-text` to populate the `extracted_text` column
- n8n reads `extracted_text` to send to GPT for transaction parsing

### 4. Gemini Vision Fallback for Scanned PDFs
- Identified root cause of n8n error: uploaded PDF was a scanned image (no text layer) — `pdf-parse` returned empty text, so `extracted_text` was null, and n8n failed with _"No extracted text available for GPT processing"_
- Implemented a vision fallback in `/api/extract-text`: when `pdf-parse` returns fewer than 50 characters, the endpoint calls **Google Gemini 2.0 Flash** via OpenRouter with the PDF as a base64 image
- Gemini reads the scanned document and returns all transaction data as plain text

### 5. Fix: Scanned PDF Flagged as Image Causing n8n Failure
- After adding the Gemini fallback, n8n threw a new error: _"You uploaded an unsupported image. Supported formats: png, jpeg, gif, webp"_
- Root cause: `is_scanned = true` was being stored even after Gemini extracted text — n8n saw that flag and tried to download the PDF from storage as an image, which failed
- Fix: `is_scanned` is now always set to `false` — since we always extract text ourselves (pdf-parse or Gemini), n8n always uses the text path, never the image path

---

## Pending / Not Yet Done

### GitHub Push
- Recent changes are committed locally but **not yet pushed to GitHub**
- The HTTPS remote (`https://github.com/jjlingad2329/BOOKSMART`) requires authentication (personal access token or SSH key) that is not configured in the Replit environment
- **Action needed:** Provide a GitHub Personal Access Token (with `repo` scope) or set up SSH to enable pushing

### End-to-End Testing of the Full PDF Flow
- The fix for n8n's "unsupported image" error was deployed, but the full round-trip (PDF upload → Gemini extraction → n8n GPT processing → pending_transactions populated → review dialog) has not been confirmed working yet
- **Action needed:** Upload a scanned bank statement PDF and verify transactions appear in the review dialog

### n8n Workflow Validation
- n8n is user-managed; its internal flow has not been reviewed
- If GPT parsing still fails after extraction, the n8n prompt or field mapping may need adjustment
- **Action needed:** Monitor n8n execution logs after the next upload attempt

### General QA
- Other platform areas (CPA dashboard, admin panel, AI chat, token wallet, orders) have not been tested in this session
- No automated end-to-end tests have been run

---

## Environment Notes
- API server runs on port **8080**, preview at `/api`
- Frontend runs on port **24254**, preview at `/`
- `OPENROUTER_API_KEY` is configured as a secret in Replit (used for Gemini + GPT-4o-mini)
- All data and auth live in **Supabase** — no local database
