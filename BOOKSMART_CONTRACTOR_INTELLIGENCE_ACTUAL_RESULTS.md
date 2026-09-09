# BookSmart Contractor Intelligence Actual Product Evaluation

> Fixture validation is not counted as a product pass.

Summary: **16 PASS / 0 PARTIAL / 0 FAIL**

## 01_CONTRACTOR_INTELLIGENCE — Bank + Gmail Only with Zelle Activity

**PASS — 6/6 declared checks evidenced by actual signals.**

Actual insights: contractor:unassigned-job-expenses, contractor:sparse-evidence, contractor:classified-customer-payments, contractor:bank-email-match:7802-mike-confirm, contractor:bank-email-match:7803-sarah-confirm, contractor:bank-email-match:7804-jose-invoice, contractor:bank-email-match:7805-hd-receipt, contractor:expenses-needing-receipt-review

Missing output: none

## 02_CONTRACTOR_INTELLIGENCE — Organized Contractor with Payroll and Contracts

**PASS — 6/6 declared checks evidenced by actual signals.**

Actual insights: net-income-trend, contractor:sparse-evidence, contractor:bank-email-match:7842-abc-invoice, contractor:classified-customer-payments, contractor:bank-email-match:7841-payroll-confirm, contractor:split-payment-group:greenfield-greenfield-contract, contractor:expenses-needing-receipt-review, contractor:unassigned-job-expenses, contractor:bank-email-match:7843-insurance-renewal, contractor:customer-concentration

Missing output: none

## 03_CONTRACTOR_INTELLIGENCE — QuickBooks + Jobber Only

**PASS — 4/4 declared checks evidenced by actual signals.**

Actual insights: contractor:active-job-progress:j-102, contractor:customer-concentration, contractor:expenses-needing-receipt-review, expense-trend, net-income-trend, contractor:job-margin:j-101

Missing output: none

## 04_CONTRACTOR_INTELLIGENCE — All Four Sources Connected

**PASS — 3/3 declared checks evidenced by actual signals.**

Actual insights: contractor:job-margin:j-202, net-income-trend, contractor:active-job-progress:j-203, contractor:job-margin:j-201, contractor:overdue-receivables, contractor:expenses-needing-receipt-review, revenue-trend, expense-trend, contractor:completed-jobs-outstanding, contractor:receivable-concentration, contractor:customer-concentration

Missing output: none

## 05_CONTRACTOR_INTELLIGENCE — Duplicate and Conflicting Data

**PASS — 6/6 declared checks evidenced by actual signals.**

Actual insights: contractor:customer-concentration, contractor:economic-event-conflict:expense|ref:reviewexpenseconflictqb20260802, contractor:classified-customer-payments, contractor:deduplicated-economic-event:customer_payment|ref:verifiedpaymentchaindupqbpaymentdupbank, expense-trend, net-income-trend

Missing output: none

## 06_CONTRACTOR_INTELLIGENCE — Unpaid Invoice / Receivable Risk

**PASS — 3/3 declared checks evidenced by actual signals.**

Actual insights: contractor:receivable-concentration, contractor:customer-concentration, contractor:completed-jobs-outstanding, contractor:overdue-receivables, contractor:receivables-aging, contractor:job-margin:overdue-job

Missing output: none

## 07_CONTRACTOR_INTELLIGENCE — Completed but Unbilled Work

**PASS — 2/2 declared checks evidenced by actual signals.**

Actual insights: contractor:completed-work-unbilled, contractor:expenses-needing-receipt-review, net-income-trend, expense-trend

Missing output: none

## 08_CONTRACTOR_INTELLIGENCE — Loss-Making Job

**PASS — 3/3 declared checks evidenced by actual signals.**

Actual insights: contractor:job-margin:job-c, contractor:expenses-needing-receipt-review, contractor:customer-concentration, contractor:job-margin:job-a, expense-trend, net-income-trend, contractor:job-margin:job-b

Missing output: none

## 09_CONTRACTOR_INTELLIGENCE — Payroll and Cash Shortfall Risk

**PASS — 4/4 declared checks evidenced by actual signals.**

Actual insights: contractor:upcoming-cash-obligations, contractor:receivable-concentration, contractor:customer-concentration

Missing output: none

## 10_CONTRACTOR_INTELLIGENCE — Personal Transfer vs Business Revenue

**PASS — 1/1 declared checks evidenced by actual signals.**

Actual insights: contractor:classified-customer-payments, contractor:sparse-evidence, contractor:expenses-needing-receipt-review

Missing output: none

## 11_CONTRACTOR_INTELLIGENCE — Customer Concentration Risk

**PASS — 3/3 declared checks evidenced by actual signals.**

Actual insights: contractor:customer-concentration

Missing output: none

## 12_CONTRACTOR_INTELLIGENCE — Missing Sources / Graceful Degradation

**PASS — 2/2 declared checks evidenced by actual signals.**

Actual insights: connection:quickbooks:e2e-12_CONTRACTOR_INTELLIGENCE, revenue-trend, net-income-trend, contractor:accounting-confirmation-unavailable, contractor:expenses-needing-receipt-review, expense-trend

Missing output: none

## 13_CONTRACTOR_INTELLIGENCE — Ambiguous Job Matching

**PASS — 2/2 declared checks evidenced by actual signals.**

Actual insights: negative-cash-movement, contractor:bank-email-match:7847-smith-receipt, contractor:ambiguous-job-match:7847-smith-receipt, contractor:expenses-needing-receipt-review, contractor:unassigned-job-expenses

Missing output: none

## 14_CONTRACTOR_INTELLIGENCE — Stale or Delayed Integration Data

**PASS — 2/2 declared checks evidenced by actual signals.**

Actual insights: connection:quickbooks:e2e-14_CONTRACTOR_INTELLIGENCE, contractor:accounting-confirmation-unavailable, contractor:overdue-receivables, contractor:completed-jobs-outstanding, contractor:receivable-concentration, contractor:customer-concentration, contractor:classified-customer-payments, contractor:sparse-evidence, contractor:possible-sync-delay:7848-quickbooks:stale-invoice

Missing output: none

## 15_CONTRACTOR_INTELLIGENCE — Refund / Reversal Handling

**PASS — 4/4 declared checks evidenced by actual signals.**

Actual insights: contractor:receivable-concentration, contractor:customer-concentration, contractor:classified-customer-payments, contractor:refund-adjustment:customer_payment|ref:verifiedrefundchainrefundpaymente2e15contractorintelligencepayment6000, contractor:overdue-receivables, contractor:expenses-needing-receipt-review, contractor:sparse-evidence, net-income-trend, revenue-trend

Missing output: none

## 16_CONTRACTOR_INTELLIGENCE — Contractor with Sparse Evidence

**PASS — 5/5 declared checks evidenced by actual signals.**

Actual insights: contractor:unassigned-job-expenses, contractor:classified-customer-payments, contractor:sparse-evidence, duplicate-expense:7817-7818, duplicate-expense:7819-7820-7821

Missing output: none
