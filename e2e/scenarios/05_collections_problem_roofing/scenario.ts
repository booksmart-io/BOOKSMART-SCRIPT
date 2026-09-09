import type { ScenarioAnswerKey, ScenarioFixture } from "../types";

const invoices: ScenarioFixture["quickbooks"]["invoices"] = [
  { id: "qb-cpr-current", customerId: "qb-customer-cpr-lake", invoiceNumber: "ROOF-6101", issuedDate: "2026-08-20", dueDate: "2026-09-15", total: 10_000, balance: 10_000, lines: [{ id: "line-cpr-1", description: "Lake residence roof repair", quantity: 1, unitPrice: 10_000, amount: 10_000 }] },
  { id: "qb-cpr-30", customerId: "qb-customer-cpr-maple", invoiceNumber: "ROOF-6094", issuedDate: "2026-06-25", dueDate: "2026-07-25", total: 18_000, balance: 18_000, lines: [{ id: "line-cpr-2", description: "Maple retail roof replacement", quantity: 1, unitPrice: 18_000, amount: 18_000 }] },
  { id: "qb-cpr-60", customerId: "qb-customer-cpr-ridge", invoiceNumber: "ROOF-6082", issuedDate: "2026-05-21", dueDate: "2026-06-20", total: 22_000, balance: 22_000, lines: [{ id: "line-cpr-3", description: "Ridge apartments storm repair", quantity: 1, unitPrice: 22_000, amount: 22_000 }] },
  { id: "qb-cpr-90", customerId: "qb-customer-cpr-harbor", invoiceNumber: "ROOF-6068", issuedDate: "2026-04-15", dueDate: "2026-05-15", total: 25_000, balance: 25_000, lines: [{ id: "line-cpr-4", description: "Harbor warehouse reroof", quantity: 1, unitPrice: 25_000, amount: 25_000 }] },
];

export const scenario: ScenarioFixture = {
  manifest: { scenarioId: "05_COLLECTIONS_PROBLEM_ROOFING", scenarioName: "Collections Problem Roofing", industry: "Roofing contractor",
    companyName: "SummitShield Roofing LLC", dateRange: { start: "2026-04-01", end: "2026-08-31" }, connectedSources: ["quickbooks", "gmail"],
    businessStory: "Profitable completed work has turned into $75,000 of receivables, with $65,000 more than 30 days overdue.",
    expectedInsightKeys: ["contractor:overdue-receivables", "contractor:receivables-aging"], prohibitedInsightKeys: ["contractor:completed-work-unbilled", "negative-cash-movement"] },
  quickbooks: { invoices,
    deposits: [{ id: "qb-cpr-deposit", date: "2026-08-08", amount: 28_000, description: "Collected customer payments", classification: "business_income" }],
    purchases: [{ id: "qb-cpr-expense", date: "2026-08-12", amount: 17_000, vendor: "Roofing Supply Group", description: "Roofing materials and payroll" }] },
  plaid: { institutionName: "", accounts: [], transactions: [] },
  jobber: { clients: [], jobs: [], invoices: [] },
  gmail: { messages: [
    { id: "gmail-cpr-maple", threadId: "gmail-thread-cpr-maple", sender: "ap@mapleretail.example.test", recipient: "collections@summitshield.example.test", subject: "Payment status ROOF-6094", timestamp: "2026-08-24T16:00:00.000Z", textBody: "Invoice ROOF-6094 remains in approval. We expect payment next month.", attachments: [] },
    { id: "gmail-cpr-ridge", threadId: "gmail-thread-cpr-ridge", sender: "manager@ridgeapartments.example.test", recipient: "collections@summitshield.example.test", subject: "Re: overdue invoice ROOF-6082", timestamp: "2026-08-25T16:00:00.000Z", textBody: "We are reviewing the $22,000 balance on ROOF-6082.", attachments: [] },
    { id: "gmail-cpr-harbor", threadId: "gmail-thread-cpr-harbor", sender: "controller@harborwarehouse.example.test", recipient: "collections@summitshield.example.test", subject: "ROOF-6068 payment delay", timestamp: "2026-08-26T16:00:00.000Z", textBody: "The $25,000 invoice ROOF-6068 will not be released this week.", attachments: [] },
  ] },
};

export const answerKey: ScenarioAnswerKey = { completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0,
  financialFacts: { invoicedRevenue: 75_000, accountsReceivable: 75_000, jobValue: 0, accountingExpenses: 17_000,
    netIncome: 11_000, netCashMovement: 11_000, arOver30: 65_000, arOver60: 47_000, arOver90: 25_000 } };
