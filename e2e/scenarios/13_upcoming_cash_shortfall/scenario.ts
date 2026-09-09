import type { ScenarioAnswerKey, ScenarioFixture } from "../types";
export const scenario: ScenarioFixture = {
  manifest: { scenarioId: "13_UPCOMING_CASH_SHORTFALL", scenarioName: "Upcoming Cash Shortfall", industry: "Commercial Cleaning", companyName: "Evergreen Facility Care LLC", dateRange: { start: "2026-08-01", end: "2026-08-31" }, connectedSources: ["plaid", "gmail"], businessStory: "Explicit payroll and supplier debits due soon exceed verified available cash.", expectedInsightKeys: ["contractor:upcoming-cash-obligations"], prohibitedInsightKeys: ["contractor:overdue-receivables"] },
  quickbooks: { invoices: [], deposits: [], purchases: [] },
  plaid: { institutionName: "Synthetic Community Bank", accounts: [{ id: "plaid-account-ucs", name: "Operating Checking", type: "depository", subtype: "checking", currentBalance: 20_000, availableBalance: 20_000 }], transactions: [
    { id: "plaid-ucs-income", accountId: "plaid-account-ucs", date: "2026-08-10", amount: 35_000, merchant: "Customer deposits", description: "August customer receipts" },
    { id: "plaid-ucs-costs", accountId: "plaid-account-ucs", date: "2026-08-20", amount: -15_000, merchant: "Operating costs", description: "August operating costs" },
  ] },
  jobber: { clients: [], jobs: [], invoices: [] },
  gmail: { messages: [
    { id: "gmail-ucs-payroll", threadId: "gmail-thread-ucs-payroll", sender: "payroll@gusto.example.test", recipient: "owner@evergreen.example.test", subject: "Upcoming payroll debit $18,000 scheduled for September 5, 2026", timestamp: "2026-08-27T15:00:00.000Z", textBody: "Your next payroll debit of $18,000 is scheduled for September 5, 2026.", attachments: [] },
    { id: "gmail-ucs-vendor", threadId: "gmail-thread-ucs-vendor", sender: "billing@supplyco.example.test", recipient: "owner@evergreen.example.test", subject: "Supplier invoice $7,500 due September 8, 2026", timestamp: "2026-08-28T15:00:00.000Z", textBody: "The $7,500 supplier invoice is due September 8, 2026.", attachments: [] },
  ] },
};
export const answerKey: ScenarioAnswerKey = { completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0, financialFacts: { invoicedRevenue: 0, accountsReceivable: 0, jobValue: 0 }, bankFacts: { inflows: 35_000, outflows: 15_000, netCashMovement: 20_000, currentCash: 20_000, availableCash: 20_000 } };
