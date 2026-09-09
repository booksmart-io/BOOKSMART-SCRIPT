import type { ScenarioAnswerKey, ScenarioFixture } from "../types";

const clients = [
  { id: "jobber-client-bbb-harbor", name: "Harbor Apartments", email: "ap@harborapartments.example.test" },
  { id: "jobber-client-bbb-pine", name: "Pine Medical Center", email: "billing@pinemedical.example.test" },
  { id: "jobber-client-bbb-wells", name: "Wells Residence", email: "wells@example.test" },
];
const jobs: ScenarioFixture["jobber"]["jobs"] = [
  { id: "job-bbb-401", clientId: "jobber-client-bbb-harbor", jobNumber: "HARBOR-401", title: "Building repipe phase one", status: "completed", completedAt: "2026-08-04", total: 14_000, lineItems: [{ id: "line-bbb-1", description: "Building repipe phase one", quantity: 1, unitPrice: 14_000, amount: 14_000 }] },
  { id: "job-bbb-402", clientId: "jobber-client-bbb-pine", jobNumber: "PINE-402", title: "Backflow replacement", status: "completed", completedAt: "2026-08-09", total: 9_000, lineItems: [{ id: "line-bbb-2", description: "Backflow replacement", quantity: 1, unitPrice: 9_000, amount: 9_000 }] },
  { id: "job-bbb-403", clientId: "jobber-client-bbb-wells", jobNumber: "WELLS-403", title: "Sewer-line repair", status: "completed", completedAt: "2026-08-14", total: 7_000, lineItems: [{ id: "line-bbb-3", description: "Sewer-line repair", quantity: 1, unitPrice: 7_000, amount: 7_000 }] },
];
const invoices: ScenarioFixture["quickbooks"]["invoices"] = jobs.map((job, index) => ({ id: `qb-bbb-invoice-${index + 1}`,
  customerId: `qb-bbb-customer-${index + 1}`, invoiceNumber: `BBB-${2001 + index}`, projectId: job.jobNumber,
  issuedDate: job.completedAt!, dueDate: ["2026-08-12", "2026-08-17", "2026-08-22"][index]!, total: job.total,
  balance: [12_000, 8_000, 5_000][index]!, lines: [{ id: `qb-bbb-line-${index + 1}`, description: job.title, quantity: 1, unitPrice: job.total, amount: job.total }] }));

export const scenario: ScenarioFixture = {
  manifest: { scenarioId: "02_BUSY_BUT_BROKE_PLUMBING", scenarioName: "Busy But Broke Plumbing", industry: "Plumbing contractor",
    companyName: "RapidRoot Plumbing LLC", dateRange: { start: "2026-07-01", end: "2026-08-31" }, connectedSources: ["quickbooks", "jobber", "gmail"],
    businessStory: "Sales are growing, but slow collections and a heavy expense month create negative cash movement.",
    expectedInsightKeys: ["contractor:overdue-receivables", "contractor:completed-jobs-outstanding", "negative-cash-movement"],
    prohibitedInsightKeys: ["contractor:completed-work-unbilled"] },
  quickbooks: { invoices,
    deposits: [
      { id: "qb-bbb-deposit-july", date: "2026-07-15", amount: 25_000, description: "July customer collections", classification: "business_income" },
      { id: "qb-bbb-deposit-aug", date: "2026-08-06", amount: 30_000, description: "August customer collections", classification: "business_income" },
    ],
    purchases: [
      { id: "qb-bbb-exp-july", date: "2026-07-18", amount: 20_000, vendor: "Operating vendors", description: "July operating costs" },
      { id: "qb-bbb-exp-payroll", date: "2026-08-08", amount: 18_000, vendor: "Gusto Payroll", description: "Payroll" },
      { id: "qb-bbb-exp-supply", date: "2026-08-11", amount: 12_000, vendor: "Ferguson Plumbing Supply", description: "Job materials" },
      { id: "qb-bbb-exp-fixed", date: "2026-08-19", amount: 6_000, vendor: "Operating costs", description: "Rent insurance vehicles" },
    ] },
  plaid: { institutionName: "", accounts: [], transactions: [] },
  jobber: { clients, jobs, invoices: jobs.map((job, index) => ({ id: `jobber-bbb-invoice-${index + 1}`, clientId: job.clientId, jobId: job.id,
    invoiceNumber: `J-${3001 + index}`, status: "past_due", issuedDate: job.completedAt!, dueDate: invoices[index]!.dueDate,
    total: job.total, balance: invoices[index]!.balance })) },
  gmail: { messages: [
    { id: "gmail-bbb-harbor", threadId: "gmail-thread-bbb-harbor", sender: "ap@harborapartments.example.test", recipient: "billing@rapidroot.example.test", subject: "Payment timing for HARBOR-401", timestamp: "2026-08-24T15:00:00.000Z", textBody: "Invoice J-3001 is approved but payment will be delayed until September 15.", attachments: [] },
    { id: "gmail-bbb-payroll", threadId: "gmail-thread-bbb-payroll", sender: "payroll@gusto.example.test", recipient: "owner@rapidroot.example.test", subject: "Upcoming payroll debit $18,000", timestamp: "2026-08-26T15:00:00.000Z", textBody: "The next payroll debit of $18,000 is scheduled for August 31.", attachments: [] },
    { id: "gmail-bbb-vendor", threadId: "gmail-thread-bbb-vendor", sender: "credit@ferguson.example.test", recipient: "owner@rapidroot.example.test", subject: "Vendor balance due", timestamp: "2026-08-25T16:00:00.000Z", textBody: "Your $12,000 supplier balance is due September 1.", attachments: [] },
  ] },
};

export const answerKey: ScenarioAnswerKey = { completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0,
  financialFacts: { invoicedRevenue: 30_000, accountsReceivable: 25_000, jobValue: 30_000, accountingExpenses: 56_000, netIncome: -1_000, netCashMovement: -1_000 } };
