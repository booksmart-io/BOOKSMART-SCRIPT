import type { ScenarioAnswerKey, ScenarioFixture } from "../types";
const clients = [{ id: "jobber-client-dip", name: "Conflicted Customer", email: "customer@example.test" }];
const jobs: ScenarioFixture["jobber"]["jobs"] = [{ id: "job-dip-1201", clientId: clients[0].id, jobNumber: "DIP-1201", title: "Office repair",
  status: "completed", completedAt: "2026-08-10", total: 10_000, lineItems: [{ id: "line-dip-1", description: "Office repair", quantity: 1, unitPrice: 10_000, amount: 10_000 }] }];
export const scenario: ScenarioFixture = {
  manifest: { scenarioId: "12_DATA_INTEGRATION_PROBLEM", scenarioName: "Data / Integration Problem", industry: "General contractor",
    companyName: "SignalCheck Contracting LLC", dateRange: { start: "2026-08-01", end: "2026-08-31" }, connectedSources: ["quickbooks", "jobber", "gmail"],
    businessStory: "Source data is stale and conflicting, with a duplicate purchase and an invoice shown unpaid in QuickBooks but paid in Jobber.",
    expectedInsightKeys: ["duplicate-expense", "contractor:invoice-status-conflict:DIP-9001"], prohibitedInsightKeys: ["negative-cash-movement"],
    sourceHealth: { quickbooks: { stale: true } } },
  quickbooks: { invoices: [{ id: "qb-dip-invoice", customerId: "qb-dip-customer", invoiceNumber: "DIP-9001", projectId: "DIP-1201",
    issuedDate: "2026-08-10", dueDate: "2026-08-20", total: 10_000, balance: 5_000,
    lines: [{ id: "qb-dip-line", description: "Office repair", quantity: 1, unitPrice: 10_000, amount: 10_000 }] }],
    deposits: [{ id: "qb-dip-deposit", date: "2026-08-15", amount: 15_000, description: "Customer receipts", classification: "business_income" }],
    purchases: [
      { id: "qb-dip-duplicate-a", date: "2026-08-18", amount: 2_000, vendor: "Building Supply", description: "Receipt DUP-77 duplicate import" },
      { id: "qb-dip-duplicate-b", date: "2026-08-18", amount: 2_000, vendor: "Building Supply", description: "Receipt DUP-77 duplicate import" },
      { id: "qb-dip-ambiguous", date: "2026-08-22", amount: 1_000, vendor: "Unclear Merchant", description: "Classification missing" },
    ] },
  plaid: { institutionName: "", accounts: [], transactions: [] },
  jobber: { clients, jobs, invoices: [{ id: "jobber-dip-invoice", clientId: clients[0].id, jobId: jobs[0].id, invoiceNumber: "DIP-9001", status: "paid",
    issuedDate: "2026-08-10", dueDate: "2026-08-20", total: 10_000, balance: 0 }] },
  gmail: { messages: [{ id: "gmail-dip-conflict", threadId: "gmail-thread-dip", sender: "customer@example.test", recipient: "billing@signalcheck.example.test",
    subject: "Payment confirmation DIP-9001", timestamp: "2026-08-21T16:00:00.000Z", textBody: "Our records show invoice DIP-9001 was paid in full.", attachments: [] }] },
};
export const answerKey: ScenarioAnswerKey = { completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0,
  financialFacts: { invoicedRevenue: 10_000, accountsReceivable: 5_000, jobValue: 10_000, accountingExpenses: 5_000, netIncome: 10_000, netCashMovement: 10_000 } };
