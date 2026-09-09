import type { ScenarioAnswerKey, ScenarioFixture } from "../types";
const amounts = [48_000, 22_000, 18_000, 12_000];
const clients = amounts.map((_, index) => ({ id: `jobber-client-cc-${index + 1}`, name: index === 0 ? "Anchor Property Group" : `Customer ${index + 1}`, email: `customer${index + 1}@example.test` }));
const jobs: ScenarioFixture["jobber"]["jobs"] = amounts.map((total, index) => ({ id: `job-cc-${index + 1}`, clientId: clients[index].id, jobNumber: `CC-${901 + index}`,
  title: `Commercial project ${index + 1}`, status: "completed", completedAt: `2026-08-${String(5 + index * 5).padStart(2, "0")}`, total,
  lineItems: [{ id: `line-cc-${index + 1}`, description: `Commercial project ${index + 1}`, quantity: 1, unitPrice: total, amount: total }] }));
const invoices: ScenarioFixture["quickbooks"]["invoices"] = jobs.map((job, index) => ({ id: `qb-cc-invoice-${index + 1}`, customerId: `qb-cc-customer-${index + 1}`,
  invoiceNumber: `CC-${9001 + index}`, projectId: job.jobNumber, issuedDate: job.completedAt!, dueDate: "2026-09-30", total: job.total, balance: 0,
  lines: [{ id: `qb-cc-line-${index + 1}`, description: job.title, quantity: 1, unitPrice: job.total, amount: job.total }] }));
export const scenario: ScenarioFixture = {
  manifest: { scenarioId: "11_CUSTOMER_CONCENTRATION", scenarioName: "Customer Concentration", industry: "Commercial contractor", companyName: "Keystone Commercial Services LLC",
    dateRange: { start: "2026-08-01", end: "2026-08-31" }, connectedSources: ["quickbooks", "jobber"],
    businessStory: "One customer represents exactly 48% of tracked invoiced activity despite otherwise healthy cash and collections.",
    expectedInsightKeys: ["contractor:customer-concentration"], prohibitedInsightKeys: ["contractor:completed-work-unbilled", "contractor:overdue-receivables", "negative-cash-movement"] },
  quickbooks: { invoices, deposits: [{ id: "qb-cc-deposit", date: "2026-08-25", amount: 100_000, description: "Customer collections", classification: "business_income" }],
    purchases: [{ id: "qb-cc-expenses", date: "2026-08-20", amount: 50_000, vendor: "Operating vendors", description: "Materials labor and overhead" }] },
  plaid: { institutionName: "", accounts: [], transactions: [] },
  jobber: { clients, jobs, invoices: jobs.map((job, index) => ({ id: `jobber-cc-invoice-${index + 1}`, clientId: job.clientId, jobId: job.id,
    invoiceNumber: `J-CC-${index + 1}`, status: "paid", issuedDate: job.completedAt!, dueDate: "2026-09-30", total: job.total, balance: 0 })) }, gmail: { messages: [] },
};
export const answerKey: ScenarioAnswerKey = { completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0,
  financialFacts: { invoicedRevenue: 100_000, accountsReceivable: 0, jobValue: 100_000, accountingExpenses: 50_000, netIncome: 50_000, netCashMovement: 50_000 } };
