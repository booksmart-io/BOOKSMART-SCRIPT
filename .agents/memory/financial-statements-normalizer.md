---
name: Financial statements normalizer
description: How uploaded/manual P&L, Balance Sheet, and Cash Flow document data is normalized for reuse across Dashboard and Reports
---

`artifacts/booksmart/src/lib/financial-statements.ts` is the single source of truth for turning a `user_documents` row's `parsed_data` JSONB into a canonical `StatementPeriod` shape.

**Why:** `parsed_data` comes from two different pipelines with different key casing — AI extraction writes snake_case keys (`revenue`, `cost_of_goods_sold`, `net_income`, `assets_current`, ...), while the manual entry template writes camelCase keys, sometimes nested under a `periods: [...]` array. Any feature that reads statement data (Dashboard KPIs, the Financial Statements tab, future reporting) must handle both shapes consistently, or figures will silently come out wrong for one of the two entry paths.

**How to apply:** Always go through `normalizeStatementDoc(row)`, `periodOverlaps(period, start, end)`, and `statementPeriodLabel(period)` rather than reading `parsed_data` fields directly. When adding a new consumer of statement data, import from this lib instead of re-implementing field mapping.

The manual-vs-AI branch is gated strictly on `parsed_data.manual_entry === true` (not e.g. a `source` field). Seeding/test data must set this exact flag plus camelCase field names, or all figures normalize to 0 even though the row exists.
