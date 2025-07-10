---
name: Statement import upload flow
description: How the tax document upload flow branches by category — critical to keep accurate
---

## Rule
- **Transactions category + PDF or image only**: insert into `statement_imports` (triggers n8n via DB webhook), then open `StatementReviewDialog` which polls `statement_imports.status` until 'completed', then shows `pending_transactions` for approve/reject
- **P&L / Income Statement / Balance Sheet / Cash Flow**: GPT-4o extraction via `/api/extract-document` → review dialog → `_saveExtractedData` creates transactions. **`statement_imports` is NOT touched**
- **All other categories**: upload to storage + insert `user_documents` only

## Why
Original Flutter `_documentCategoryToParserType()` returns null for "Transactions", which falls to the `else if` (PDF/image) branch that calls `_triggerStatementImport`. The statement_imports insert only happens there, not for financial statements.

## How to apply
- `categoryToDocType(category)` returns `"pnl" | "bs" | "cf" | null` — null means not a financial statement
- Only insert `statement_imports` when `docType === null AND category === "Transactions" AND (mime === "application/pdf" OR mime.startsWith("image/"))`
- `organizations` table: `owner_id` column references `users.id` (integer). Query `organizations WHERE owner_id = numericUserId` to get `org_id` for the import.
- `StatementReviewDialog` polls every 3s (max 30 polls = 90s timeout), fetches `pending_transactions WHERE import_id = X AND status = "pending"`, approve → insert into `transactions` (amount negated for debit), reject → delete from `pending_transactions`

## Transaction query pattern
The Flutter TransactionController always queries by `org_id`, NOT `user_id`:
```dart
.eq('org_id', getCurrentOrganization!.id);
```
In React: first query `organizations WHERE owner_id = numericId` to get `orgId`, then filter transactions by `org_id`. Also wire the Supabase realtime subscription filter to `org_id=eq.{orgId}`.
For invalidation across components that don't have `orgId`, use prefix-only query keys: `["tx_month"]` / `["tx_recent"]`.
