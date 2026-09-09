import type { ScenarioAnswerKey, ScenarioFixture } from "../types";

const clients = [
  { id: "jobber-client-hdh-smith", name: "Smith Residence", email: "james.smith@example.test" },
  { id: "jobber-client-hdh-park", name: "Parkside Offices", email: "facilities@parkside.example.test" },
  { id: "jobber-client-hdh-lee", name: "Lee Residence", email: "lee@example.test" },
];
const jobs: ScenarioFixture["jobber"]["jobs"] = [
  { id: "job-hdh-smith-402", clientId: "jobber-client-hdh-smith", jobNumber: "SMITH-402", title: "Kitchen renovation", status: "completed", completedAt: "2026-08-09", total: 12_000, lineItems: [{ id: "line-hdh-1", description: "Kitchen renovation", quantity: 1, unitPrice: 12_000, amount: 12_000 }] },
  { id: "job-hdh-park-115", clientId: "jobber-client-hdh-park", jobNumber: "PARK-115", title: "Office repairs", status: "completed", completedAt: "2026-08-16", total: 8_000, lineItems: [{ id: "line-hdh-2", description: "Office repairs", quantity: 1, unitPrice: 8_000, amount: 8_000 }] },
  { id: "job-hdh-lee-230", clientId: "jobber-client-hdh-lee", jobNumber: "LEE-230", title: "Bathroom renovation", status: "completed", completedAt: "2026-08-22", total: 10_000, lineItems: [{ id: "line-hdh-3", description: "Bathroom renovation", quantity: 1, unitPrice: 10_000, amount: 10_000 }] },
];
const invoices: ScenarioFixture["quickbooks"]["invoices"] = jobs.map((job, index) => ({ id: `qb-hdh-invoice-${index + 1}`, customerId: `qb-hdh-customer-${index + 1}`,
  invoiceNumber: `HDH-${5101 + index}`, projectId: job.jobNumber, issuedDate: job.completedAt!, dueDate: "2026-09-15", total: job.total, balance: 0,
  lines: [{ id: `qb-hdh-line-${index + 1}`, description: job.title, quantity: 1, unitPrice: job.total, amount: job.total }] }));

export const scenario: ScenarioFixture = {
  manifest: { scenarioId: "06_HOME_DEPOT_HEAVY_CONTRACTOR", scenarioName: "Home Depot Heavy Contractor", industry: "General contractor",
    companyName: "BuildRight Renovations LLC", dateRange: { start: "2026-08-01", end: "2026-08-31" }, connectedSources: ["quickbooks", "jobber", "gmail", "receipts"],
    businessStory: "A contractor makes several similar Home Depot purchases. Some have exact PO/job evidence, one is legitimate repeat work, one is unassigned, and one transaction is a true duplicate.",
    expectedInsightKeys: ["contractor:unassigned-job-expenses"], prohibitedInsightKeys: ["contractor:completed-work-unbilled", "negative-cash-movement"] },
  quickbooks: { invoices,
    deposits: [{ id: "qb-hdh-deposit", date: "2026-08-25", amount: 30_000, description: "Customer collections", classification: "business_income" }],
    purchases: [
      { id: "qb-hdh-smith", date: "2026-08-05", amount: 1_250, vendor: "The Home Depot", description: "Receipt HD1001 PO SMITH-402", jobNumber: "SMITH-402" },
      { id: "qb-hdh-park", date: "2026-08-12", amount: 980, vendor: "The Home Depot", description: "Receipt HD1002 PO PARK-115", jobNumber: "PARK-115" },
      { id: "qb-hdh-unassigned", date: "2026-08-14", amount: 640, vendor: "The Home Depot", description: "General shop materials" },
      { id: "qb-hdh-lee-repeat", date: "2026-08-18", amount: 1_250, vendor: "The Home Depot", description: "Receipt HD1003 PO LEE-230 legitimate separate purchase", jobNumber: "LEE-230" },
      { id: "qb-hdh-duplicate-a", date: "2026-08-20", amount: 775, vendor: "The Home Depot", description: "Receipt HD1004 duplicate import" },
      { id: "qb-hdh-duplicate-b", date: "2026-08-20", amount: 775, vendor: "The Home Depot", description: "Receipt HD1004 duplicate import" },
    ] },
  plaid: { institutionName: "", accounts: [], transactions: [] },
  jobber: { clients, jobs, invoices: jobs.map((job, index) => ({ id: `jobber-hdh-invoice-${index + 1}`, clientId: job.clientId, jobId: job.id,
    invoiceNumber: `J-HDH-${index + 1}`, status: "paid", issuedDate: job.completedAt!, dueDate: "2026-09-15", total: job.total, balance: 0 })) },
  gmail: { messages: [
    { id: "gmail-hdh-smith", threadId: "gmail-thread-hdh-smith", sender: "receipts@homedepot.example.test", recipient: "purchases@buildright.example.test", subject: "Home Depot receipt HD1001 — SMITH-402", timestamp: "2026-08-05T18:00:00.000Z", textBody: "Home Depot purchase $1,250.00. PO SMITH-402.", attachments: [{ id: "att-hdh-1", filename: "HD1001.pdf", mimeType: "application/pdf" }] },
    { id: "gmail-hdh-park", threadId: "gmail-thread-hdh-park", sender: "receipts@homedepot.example.test", recipient: "purchases@buildright.example.test", subject: "Home Depot receipt HD1002 — PARK-115", timestamp: "2026-08-12T18:00:00.000Z", textBody: "Home Depot purchase $980.00. PO PARK-115.", attachments: [{ id: "att-hdh-2", filename: "HD1002.pdf", mimeType: "application/pdf" }] },
    { id: "gmail-hdh-lee", threadId: "gmail-thread-hdh-lee", sender: "receipts@homedepot.example.test", recipient: "purchases@buildright.example.test", subject: "Home Depot receipt HD1003 — LEE-230", timestamp: "2026-08-18T18:00:00.000Z", textBody: "Home Depot purchase $1,250.00. PO LEE-230.", attachments: [{ id: "att-hdh-3", filename: "HD1003.pdf", mimeType: "application/pdf" }] },
  ] },
  receipts: [
    { id: "gmail:gmail-hdh-smith:attachment:att-hdh-1", vendor: "The Home Depot", date: "2026-08-05", subtotal: 1_160, tax: 90, total: 1_250, paymentLastFour: "4242", poNumber: "SMITH-402", jobNumber: "SMITH-402", customerOrProject: "Smith Residence", receiptNumber: "HD1001", lineItems: [{ description: "Renovation materials", quantity: 1, amount: 1_160 }] },
    { id: "gmail:gmail-hdh-park:attachment:att-hdh-2", vendor: "The Home Depot", date: "2026-08-12", subtotal: 910, tax: 70, total: 980, paymentLastFour: "4242", poNumber: "PARK-115", jobNumber: "PARK-115", customerOrProject: "Parkside Offices", receiptNumber: "HD1002", lineItems: [{ description: "Repair materials", quantity: 1, amount: 910 }] },
    { id: "gmail:gmail-hdh-lee:attachment:att-hdh-3", vendor: "The Home Depot", date: "2026-08-18", subtotal: 1_160, tax: 90, total: 1_250, paymentLastFour: "4242", poNumber: "LEE-230", jobNumber: "LEE-230", customerOrProject: "Lee Residence", receiptNumber: "HD1003", lineItems: [{ description: "Bathroom materials", quantity: 1, amount: 1_160 }] },
  ],
};

export const answerKey: ScenarioAnswerKey = { completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0,
  financialFacts: { invoicedRevenue: 30_000, accountsReceivable: 0, jobValue: 30_000, accountingExpenses: 5_670, netIncome: 24_330, netCashMovement: 24_330 } };
