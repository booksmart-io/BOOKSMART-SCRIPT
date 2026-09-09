import type { ScenarioAnswerKey, ScenarioFixture } from "../types";

const clients = [
  { id: "jobber-client-carter", name: "Carter Residence", email: "morgan.carter@example.test" },
  { id: "jobber-client-lakeview", name: "Lakeview Dental", email: "office@lakeviewdental.example.test" },
  { id: "jobber-client-northwind", name: "Northwind Market", email: "manager@northwindmarket.example.test" },
];

const jobs: ScenarioFixture["jobber"]["jobs"] = [
  ["job-carter-310", "jobber-client-carter", "CARTER-310", "Heat pump installation", 8_400, "2026-07-09"],
  ["job-lakeview-88", "jobber-client-lakeview", "LAKEVIEW-88", "Rooftop unit maintenance", 3_200, "2026-08-03"],
  ["job-northwind-204", "jobber-client-northwind", "NORTHWIND-204", "Walk-in cooler repair", 4_750, "2026-08-04"],
  ["job-carter-322", "jobber-client-carter", "CARTER-322", "Duct sealing and balancing", 2_600, "2026-08-07"],
  ["job-lakeview-93", "jobber-client-lakeview", "LAKEVIEW-93", "Thermostat and controls upgrade", 2_250, "2026-07-25"],
].map(([id, clientId, jobNumber, title, total, completedAt]) => ({
  id: String(id), clientId: String(clientId), jobNumber: String(jobNumber), title: String(title), status: "completed",
  completedAt: String(completedAt), total: Number(total),
  lineItems: [{ id: `line-${id}`, description: String(title), quantity: 1, unitPrice: Number(total), amount: Number(total) }],
}));

const customerIds: Record<string, string> = {
  "jobber-client-carter": "qb-customer-morgan-carter-home",
  "jobber-client-lakeview": "qb-customer-lakeview-dental-pllc",
  "jobber-client-northwind": "qb-customer-northwind-market-inc",
};

const invoices: ScenarioFixture["quickbooks"]["invoices"] = jobs.map((job, index) => ({
  id: `qb-invoice-hvac-${index + 1}`, customerId: customerIds[job.clientId], invoiceNumber: `HVAC-${8101 + index}`,
  projectId: job.jobNumber, issuedDate: job.completedAt!, dueDate: new Date(`${job.completedAt}T00:00:00Z`).toISOString().slice(0, 10),
  total: job.total, balance: 0,
  lines: [{ id: `qb-line-hvac-${index + 1}`, description: job.title, quantity: 1, unitPrice: job.total, amount: job.total }],
}));

export const scenario: ScenarioFixture = {
  manifest: {
    scenarioId: "01_HEALTHY_HVAC", scenarioName: "Healthy HVAC", industry: "HVAC contractor",
    companyName: "Northstar Heating and Air LLC", dateRange: { start: "2026-07-01", end: "2026-08-31" },
    connectedSources: ["quickbooks", "jobber", "gmail"],
    businessStory: "A healthy HVAC operator completes, invoices, and collects its work promptly with no manufactured crisis.",
    expectedInsightKeys: [],
    prohibitedInsightKeys: [
      "contractor:completed-work-unbilled", "contractor:overdue-receivables", "contractor:completed-jobs-outstanding",
      "contractor:cash-pressure", "revenue-trend",
    ],
  },
  quickbooks: {
    invoices,
    deposits: invoices.map((invoice, index) => ({ id: `qb-deposit-hvac-${index + 1}`, date: invoice.issuedDate,
      amount: invoice.total, description: `Customer payment ${invoice.invoiceNumber}`, classification: "business_income" })),
    purchases: [
      { id: "qb-purchase-hvac-1", date: "2026-07-05", amount: 4_200, vendor: "Carrier Supply", description: "Heat pump equipment", jobNumber: "CARTER-310" },
      { id: "qb-purchase-hvac-2", date: "2026-08-02", amount: 1_350, vendor: "HVAC Parts Depot", description: "Filters belts and service materials", jobNumber: "LAKEVIEW-88" },
      { id: "qb-purchase-hvac-3", date: "2026-08-04", amount: 2_100, vendor: "Refrigeration Supply Co", description: "Cooler compressor and refrigerant", jobNumber: "NORTHWIND-204" },
      { id: "qb-purchase-hvac-4", date: "2026-08-04", amount: 1_050, vendor: "Airflow Wholesale", description: "Duct sealing materials", jobNumber: "CARTER-322" },
      { id: "qb-purchase-hvac-5", date: "2026-07-22", amount: 900, vendor: "Controls Warehouse", description: "Thermostat and control board", jobNumber: "LAKEVIEW-93" },
      { id: "qb-purchase-hvac-6", date: "2026-07-20", amount: 2_650, vendor: "Northstar Payroll", description: "Operating payroll and vehicle costs" },
    ],
  },
  plaid: { institutionName: "", accounts: [], transactions: [] },
  jobber: { clients, jobs },
  gmail: { messages: jobs.map((job, index) => ({
    id: `gmail-hvac-payment-${index + 1}`, threadId: `gmail-hvac-thread-${index + 1}`,
    sender: clients.find(client => client.id === job.clientId)!.email, recipient: "billing@northstarhvac.example.test",
    subject: `Payment confirmation for ${job.jobNumber}`, timestamp: `${job.completedAt}T20:00:00.000Z`,
    textBody: `Payment for invoice ${invoices[index].invoiceNumber} and job ${job.jobNumber} has been sent in full.`, attachments: [],
  })) },
};

export const answerKey: ScenarioAnswerKey = {
  completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0,
  financialFacts: { invoicedRevenue: 21_200, accountsReceivable: 0, jobValue: 21_200,
    accountingExpenses: 12_250, netIncome: 8_950, netCashMovement: 8_950 },
};
