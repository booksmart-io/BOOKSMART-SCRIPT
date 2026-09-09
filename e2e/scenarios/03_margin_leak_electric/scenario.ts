import type { ScenarioAnswerKey, ScenarioFixture } from "../types";

const clients = [
  { id: "jobber-client-mle-cedar", name: "Cedar Offices", email: "facilities@cedaroffices.example.test" },
  { id: "jobber-client-mle-union", name: "Union Market", email: "manager@unionmarket.example.test" },
  { id: "jobber-client-mle-hill", name: "Hill Residence", email: "hill@example.test" },
];
const jobs: ScenarioFixture["jobber"]["jobs"] = [
  { id: "job-mle-cedar-210", clientId: "jobber-client-mle-cedar", jobNumber: "CEDAR-210", title: "Panel and feeder upgrade", status: "completed", completedAt: "2026-08-06", total: 20_000, lineItems: [{ id: "line-mle-1", description: "Panel and feeder upgrade", quantity: 1, unitPrice: 20_000, amount: 20_000 }] },
  { id: "job-mle-union-84", clientId: "jobber-client-mle-union", jobNumber: "UNION-84", title: "Commercial lighting retrofit", status: "completed", completedAt: "2026-08-13", total: 15_000, lineItems: [{ id: "line-mle-2", description: "Commercial lighting retrofit", quantity: 1, unitPrice: 15_000, amount: 15_000 }] },
  { id: "job-mle-hill-319", clientId: "jobber-client-mle-hill", jobNumber: "HILL-319", title: "Service relocation", status: "completed", completedAt: "2026-08-21", total: 12_000, lineItems: [{ id: "line-mle-3", description: "Service relocation", quantity: 1, unitPrice: 12_000, amount: 12_000 }] },
];
const invoices: ScenarioFixture["quickbooks"]["invoices"] = jobs.map((job, index) => ({ id: `qb-mle-invoice-${index + 1}`, customerId: `qb-mle-customer-${index + 1}`,
  invoiceNumber: `MLE-${4101 + index}`, projectId: job.jobNumber, issuedDate: job.completedAt!, dueDate: "2026-09-15", total: job.total, balance: 0,
  lines: [{ id: `qb-mle-line-${index + 1}`, description: job.title, quantity: 1, unitPrice: job.total, amount: job.total }] }));

export const scenario: ScenarioFixture = {
  manifest: { scenarioId: "03_MARGIN_LEAK_ELECTRIC", scenarioName: "Margin Leak Electric", industry: "Electrical contractor",
    companyName: "BrightWire Electric LLC", dateRange: { start: "2026-07-01", end: "2026-08-31" }, connectedSources: ["quickbooks", "jobber", "gmail"],
    businessStory: "Revenue is strong, but sharply higher material and labor costs push two completed jobs near or below break-even.",
    expectedInsightKeys: ["contractor:job-margin:job-mle-cedar-210", "contractor:job-margin:job-mle-union-84", "expense-trend"],
    prohibitedInsightKeys: ["contractor:completed-work-unbilled", "contractor:overdue-receivables", "negative-cash-movement"] },
  quickbooks: { invoices,
    deposits: [
      { id: "qb-mle-deposit-july", date: "2026-07-14", amount: 40_000, description: "July customer receipts", classification: "business_income" },
      { id: "qb-mle-deposit-cedar", date: "2026-08-08", amount: 20_000, description: "Payment MLE-4101", classification: "business_income" },
      { id: "qb-mle-deposit-union", date: "2026-08-15", amount: 15_000, description: "Payment MLE-4102", classification: "business_income" },
      { id: "qb-mle-deposit-hill", date: "2026-08-23", amount: 12_000, description: "Payment MLE-4103", classification: "business_income" },
    ], purchases: [
      { id: "qb-mle-july-cost", date: "2026-07-18", amount: 15_000, vendor: "Electrical Supply Cooperative", description: "July materials and field labor" },
      { id: "qb-mle-cedar-material", date: "2026-08-04", amount: 12_500, vendor: "Electrical Supply Cooperative", description: "CEDAR-210 switchgear and copper", jobNumber: "CEDAR-210" },
      { id: "qb-mle-cedar-labor", date: "2026-08-07", amount: 6_000, vendor: "BrightWire Field Payroll", description: "CEDAR-210 field labor", jobNumber: "CEDAR-210" },
      { id: "qb-mle-union-material", date: "2026-08-10", amount: 11_000, vendor: "Commercial Lighting Depot", description: "UNION-84 fixtures", jobNumber: "UNION-84" },
      { id: "qb-mle-union-labor", date: "2026-08-14", amount: 5_000, vendor: "BrightWire Field Payroll", description: "UNION-84 field labor", jobNumber: "UNION-84" },
      { id: "qb-mle-hill-material", date: "2026-08-19", amount: 4_000, vendor: "Electrical Supply Cooperative", description: "HILL-319 materials", jobNumber: "HILL-319" },
      { id: "qb-mle-hill-labor", date: "2026-08-22", amount: 2_000, vendor: "BrightWire Field Payroll", description: "HILL-319 field labor", jobNumber: "HILL-319" },
    ] },
  plaid: { institutionName: "", accounts: [], transactions: [] },
  jobber: { clients, jobs, invoices: jobs.map((job, index) => ({ id: `jobber-mle-invoice-${index + 1}`, clientId: job.clientId, jobId: job.id,
    invoiceNumber: `J-MLE-${index + 1}`, status: "paid", issuedDate: job.completedAt!, dueDate: "2026-09-15", total: job.total, balance: 0 })) },
  gmail: { messages: [
    { id: "gmail-mle-copper", threadId: "gmail-thread-mle-copper", sender: "pricing@electricalsupply.example.test", recipient: "purchasing@brightwire.example.test", subject: "Copper pricing adjustment", timestamp: "2026-08-03T15:00:00.000Z", textBody: "Copper and switchgear pricing increased this month. Order reference CEDAR-210.", attachments: [] },
    { id: "gmail-mle-union", threadId: "gmail-thread-mle-union", sender: "billing@lightingdepot.example.test", recipient: "purchasing@brightwire.example.test", subject: "Invoice for UNION-84 fixtures", timestamp: "2026-08-11T15:00:00.000Z", textBody: "Commercial fixtures for UNION-84 total $11,000.", attachments: [{ id: "attachment-mle-union", filename: "UNION-84-invoice.pdf", mimeType: "application/pdf" }] },
  ] },
};

export const answerKey: ScenarioAnswerKey = { completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0,
  financialFacts: { invoicedRevenue: 47_000, accountsReceivable: 0, jobValue: 47_000, accountingExpenses: 55_500, netIncome: 31_500, netCashMovement: 31_500 } };
