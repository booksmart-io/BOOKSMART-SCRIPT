import type { ScenarioAnswerKey, ScenarioFixture } from "../types";

const clients = [{ id: "jobber-client-scp-commercial", name: "Commercial Service Portfolio", email: "service@example.test" }];
const jobDefinitions = [
  ["july-1", "JULY-801", "July installation one", 12_000, "2026-07-05"], ["july-2", "JULY-802", "July installation two", 11_000, "2026-07-11"],
  ["july-3", "JULY-803", "July installation three", 10_000, "2026-07-18"], ["july-4", "JULY-804", "July installation four", 9_000, "2026-07-25"],
  ["aug-1", "AUG-811", "August service project", 14_000, "2026-08-08"], ["aug-2", "AUG-812", "August service project two", 11_000, "2026-08-20"],
] as const;
const jobs: ScenarioFixture["jobber"]["jobs"] = jobDefinitions.map(([id, number, title, total, date]) => ({ id: `job-scp-${id}`, clientId: clients[0].id,
  jobNumber: number, title, status: "completed", completedAt: date, total, lineItems: [{ id: `line-scp-${id}`, description: title, quantity: 1, unitPrice: total, amount: total }] }));
const invoices: ScenarioFixture["quickbooks"]["invoices"] = jobs.map((job, index) => ({ id: `qb-scp-invoice-${index + 1}`, customerId: "qb-scp-customer",
  invoiceNumber: `SCP-${8001 + index}`, projectId: job.jobNumber, issuedDate: job.completedAt!, dueDate: "2026-09-15", total: job.total, balance: 0,
  lines: [{ id: `qb-scp-line-${index + 1}`, description: job.title, quantity: 1, unitPrice: job.total, amount: job.total }] }));

export const scenario: ScenarioFixture = {
  manifest: { scenarioId: "10_SEASONAL_CASH_PRESSURE", scenarioName: "Seasonal Cash Pressure", industry: "Mechanical contractor",
    companyName: "Four Seasons Mechanical LLC", dateRange: { start: "2026-07-01", end: "2026-08-31" }, connectedSources: ["quickbooks", "jobber"],
    businessStory: "A historically healthy contractor enters a seasonal slowdown while fixed payroll, rent, debt, and supplier costs continue.",
    expectedInsightKeys: ["revenue-trend", "negative-cash-movement"],
    prohibitedInsightKeys: ["contractor:completed-work-unbilled", "contractor:overdue-receivables", "contractor:completed-jobs-outstanding"] },
  quickbooks: { invoices,
    deposits: [{ id: "qb-scp-deposit-july", date: "2026-07-10", amount: 60_000, description: "July customer receipts", classification: "business_income" },
      { id: "qb-scp-deposit-aug", date: "2026-08-10", amount: 25_000, description: "August customer receipts", classification: "business_income" }],
    purchases: [{ id: "qb-scp-july-costs", date: "2026-07-15", amount: 35_000, vendor: "Operating costs", description: "July payroll materials rent and debt" },
      { id: "qb-scp-aug-payroll", date: "2026-08-08", amount: 20_000, vendor: "Payroll", description: "August payroll" },
      { id: "qb-scp-aug-supplier", date: "2026-08-14", amount: 9_000, vendor: "Mechanical Supply", description: "Supplier payment" },
      { id: "qb-scp-aug-fixed", date: "2026-08-20", amount: 9_000, vendor: "Fixed obligations", description: "Rent loan insurance vehicles" }] },
  plaid: { institutionName: "", accounts: [], transactions: [] },
  jobber: { clients, jobs, invoices: jobs.map((job, index) => ({ id: `jobber-scp-invoice-${index + 1}`, clientId: job.clientId, jobId: job.id,
    invoiceNumber: `J-SCP-${index + 1}`, status: "paid", issuedDate: job.completedAt!, dueDate: "2026-09-15", total: job.total, balance: 0 })) },
  gmail: { messages: [] },
};
export const answerKey: ScenarioAnswerKey = { completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0,
  financialFacts: { invoicedRevenue: 67_000, accountsReceivable: 0, jobValue: 67_000, accountingExpenses: 73_000, netIncome: 12_000, netCashMovement: 12_000 } };
