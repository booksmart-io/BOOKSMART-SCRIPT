# Canonical financial summary contract

`financial-summary-v2` is BookSmart's authoritative contract for financial summary values. Customer, CPA, reporting, monitoring, and future portfolio surfaces must consume this contract instead of calculating their own revenue, expenses, profit, cash movement, or Business Health Score.

## Required values

- `revenue`: recognized revenue for the requested inclusive period.
- `accountingExpenses`: recognized COGS, operating, other, and income-tax expenses.
- `netIncome`: revenue less accounting expenses under the selected source.
- `moneyIn` and `moneyOut`: non-transfer cash movement under the selected cash-flow source.
- `netCashMovement`: money in less money out.
- `profitMarginPct`: null when revenue is zero; otherwise net income divided by revenue.
- `deductibleAmount`: rule-based federal deductible amount for the period.
- `health`: the single `financial-health-v1` score and its explainable factors.
- `visuals.cashFlowBars`: server-derived cash-flow points. Transaction sources expose dated money-in, money-out, and net movement; uploaded statements expose operating, investing, and financing sections.
- `visuals.spendingBreakdown`: expense groups reconciled to the selected canonical P&L source.

## Period rules

- `start` and `end` are exact ISO instants.
- Both boundaries are inclusive.
- Date-only API inputs are interpreted as inclusive UTC days.
- Browser-defined local-day periods must send exact `startInstant` and `endInstant` values.
- A range may not be negative or longer than ten years.
- Comparison periods must not overlap the current period.

## Source selection

- Confirmed, organization-matched uploaded statements take precedence when they cover the requested period.
- P&L, Balance Sheet, and Cash Flow sources are disclosed independently in `sources`.
- The canonical transactions ledger is the fallback.
- Pending ledger rows, pending statement workflows, cross-organization statements, staged imports, rejected records, and transfers are excluded from the applicable values.
- Mixed P&L and Cash Flow sources produce `mixed_financial_sources`.

## Completeness and warnings

Consumers must preserve `completeness` and `warnings`. They must not replace unavailable or incomplete canonical values with independently calculated browser values. An unavailable canonical service produces an unavailable UI state.

## Consumer rules

1. Pages may format, sort, group, and chart canonical values.
2. Pages may not independently calculate summary totals or health scores.
3. Background monitoring and CPA services must call the same canonical application builder.
4. New contract behavior requires a new calculation version and regression tests.
5. Legacy paths may be removed only after parity telemetry shows no unexplained mismatch for equivalent periods and sources.

## Accounting safety

The contract is read-only. Calling it never creates, edits, approves, categorizes, or deletes transactions, statements, tasks, signals, CPA access, planning inputs, or notifications.
