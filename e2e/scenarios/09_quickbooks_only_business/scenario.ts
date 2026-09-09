import type { ScenarioAnswerKey, ScenarioFixture } from "../types";

const invoices: ScenarioFixture["quickbooks"]["invoices"] = [
  { id: "qb-qob-invoice-1", customerId: "qb-qob-customer-1", invoiceNumber: "QOB-7001", issuedDate: "2026-07-01", dueDate: "2026-07-31", total: 16_000, balance: 12_000, lines: [{ id: "line-qob-1", description: "Consulting engagement", quantity: 1, unitPrice: 16_000, amount: 16_000 }] },
  { id: "qb-qob-invoice-2", customerId: "qb-qob-customer-2", invoiceNumber: "QOB-7002", issuedDate: "2026-08-05", dueDate: "2026-09-05", total: 14_000, balance: 6_000, lines: [{ id: "line-qob-2", description: "Implementation engagement", quantity: 1, unitPrice: 14_000, amount: 14_000 }] },
];

export const scenario: ScenarioFixture = {
  manifest: { scenarioId: "09_QUICKBOOKS_ONLY_BUSINESS", scenarioName: "QuickBooks Only Business", industry: "Professional services",
    companyName: "Beacon Advisory Group LLC", dateRange: { start: "2026-07-01", end: "2026-08-31" }, connectedSources: ["quickbooks", "gmail"],
    businessStory: "A services firm relies on QuickBooks and email, with profitable cash flow, rising vendor costs, and one overdue customer balance.",
    expectedInsightKeys: ["contractor:overdue-receivables", "expense-trend"],
    prohibitedInsightKeys: ["contractor:completed-work-unbilled", "contractor:completed-jobs-outstanding", "contractor:job-margin"] },
  quickbooks: { invoices,
    deposits: [
      { id: "qb-qob-deposit-july", date: "2026-07-10", amount: 24_000, description: "July client receipts", classification: "business_income" },
      { id: "qb-qob-deposit-aug", date: "2026-08-10", amount: 28_000, description: "August client receipts", classification: "business_income" },
    ], purchases: [
      { id: "qb-qob-july-vendors", date: "2026-07-15", amount: 10_000, vendor: "Professional Vendors", description: "July contractors and software" },
      { id: "qb-qob-aug-contractors", date: "2026-08-14", amount: 12_000, vendor: "Professional Vendors", description: "August contractors" },
      { id: "qb-qob-aug-software", date: "2026-08-18", amount: 2_000, vendor: "Business Software", description: "Recurring software subscriptions" },
    ] },
  plaid: { institutionName: "", accounts: [], transactions: [] }, jobber: { clients: [], jobs: [], invoices: [] },
  gmail: { messages: [
    { id: "gmail-qob-collection", threadId: "gmail-thread-qob-collection", sender: "ap@clientone.example.test", recipient: "billing@beaconadvisory.example.test", subject: "Payment update QOB-7001", timestamp: "2026-08-24T16:00:00.000Z", textBody: "We expect to release the remaining $12,000 balance next month.", attachments: [] },
    { id: "gmail-qob-software", threadId: "gmail-thread-qob-software", sender: "billing@businesssoftware.example.test", recipient: "finance@beaconadvisory.example.test", subject: "Annual software renewal notice", timestamp: "2026-08-25T16:00:00.000Z", textBody: "Your recurring software plan renews September 15.", attachments: [] },
  ] },
};
export const answerKey: ScenarioAnswerKey = { completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0,
  financialFacts: { invoicedRevenue: 30_000, accountsReceivable: 18_000, jobValue: 0, accountingExpenses: 24_000, netIncome: 28_000, netCashMovement: 28_000 } };
