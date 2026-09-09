import type { ScenarioAnswerKey, ScenarioFixture } from "../types";

const clients = [
  { id: "jobber-client-rivera", name: "Rivera Residence", email: "rivera@example.test" },
  { id: "jobber-client-summit", name: "Summit Property Group", email: "ap@summitproperty.example.test" },
  { id: "jobber-client-oak", name: "Oak Street Cafe", email: "owner@oakstreetcafe.example.test" },
];

const jobs: ScenarioFixture["jobber"]["jobs"] = [
  { id: "job-nqb-rivera-501", clientId: "jobber-client-rivera", jobNumber: "RIVERA-501", title: "Water heater replacement", status: "completed", completedAt: "2026-08-12", total: 4_200, lineItems: [{ id: "line-nqb-1", description: "Water heater replacement", quantity: 1, unitPrice: 4_200, amount: 4_200 }] },
  { id: "job-nqb-summit-118", clientId: "jobber-client-summit", jobNumber: "SUMMIT-118", title: "Three-unit drain repair", status: "completed", completedAt: "2026-08-18", total: 5_600, lineItems: [{ id: "line-nqb-2", description: "Three-unit drain repair", quantity: 1, unitPrice: 5_600, amount: 5_600 }] },
  { id: "job-nqb-oak-77", clientId: "jobber-client-oak", jobNumber: "OAK-77", title: "Kitchen supply-line repair", status: "completed", completedAt: "2026-08-23", total: 2_800, lineItems: [{ id: "line-nqb-3", description: "Kitchen supply-line repair", quantity: 1, unitPrice: 2_800, amount: 2_800 }] },
  { id: "job-nqb-rivera-509", clientId: "jobber-client-rivera", jobNumber: "RIVERA-509", title: "Bathroom rough-in", status: "active", total: 6_900, lineItems: [{ id: "line-nqb-4", description: "Bathroom rough-in", quantity: 1, unitPrice: 6_900, amount: 6_900 }] },
];

export const scenario: ScenarioFixture = {
  manifest: {
    scenarioId: "08_NO_QUICKBOOKS_CONTRACTOR", scenarioName: "No QuickBooks Contractor", industry: "Plumbing contractor",
    companyName: "ClearFlow Plumbing LLC", dateRange: { start: "2026-07-01", end: "2026-08-31" },
    connectedSources: ["plaid", "jobber", "gmail"],
    businessStory: "A small contractor relies on bank activity, Jobber, and email. Cash outflow exceeds inflow while completed work remains unbilled.",
    expectedInsightKeys: ["negative-cash-movement", "contractor:completed-work-unbilled"],
    prohibitedInsightKeys: ["contractor:overdue-receivables", "contractor:completed-jobs-outstanding", "revenue-trend"],
  },
  quickbooks: { invoices: [], deposits: [], purchases: [] },
  plaid: {
    institutionName: "Synthetic Community Bank",
    accounts: [{ id: "plaid-account-nqb-checking", name: "ClearFlow Operating", type: "depository", subtype: "checking", currentBalance: 6_450, availableBalance: 6_200 }],
    transactions: [
      { id: "plaid-nqb-deposit-1", accountId: "plaid-account-nqb-checking", date: "2026-08-05", amount: 9_000, merchant: "Customer ACH Batch", description: "Customer payments" },
      { id: "plaid-nqb-deposit-2", accountId: "plaid-account-nqb-checking", date: "2026-08-20", amount: 7_500, merchant: "Customer ACH Batch", description: "Customer payments" },
      { id: "plaid-nqb-payroll", accountId: "plaid-account-nqb-checking", date: "2026-08-07", amount: -7_200, merchant: "Gusto Payroll", description: "Biweekly payroll" },
      { id: "plaid-nqb-supplier", accountId: "plaid-account-nqb-checking", date: "2026-08-10", amount: -4_800, merchant: "Ferguson Plumbing Supply", description: "Materials purchases" },
      { id: "plaid-nqb-utilities", accountId: "plaid-account-nqb-checking", date: "2026-08-14", amount: -900, merchant: "City Utilities", description: "Shop utilities" },
      { id: "plaid-nqb-insurance", accountId: "plaid-account-nqb-checking", date: "2026-08-16", amount: -1_200, merchant: "Contractor Mutual", description: "Insurance premium" },
      { id: "plaid-nqb-software", accountId: "plaid-account-nqb-checking", date: "2026-08-19", amount: -600, merchant: "Field Tools Software", description: "Recurring field software" },
      { id: "plaid-nqb-fuel", accountId: "plaid-account-nqb-checking", date: "2026-08-22", amount: -700, merchant: "Fleet Fuel Network", description: "Vehicle fuel" },
      { id: "plaid-nqb-loan", accountId: "plaid-account-nqb-checking", date: "2026-08-25", amount: -1_600, merchant: "Equipment Finance Co", description: "Monthly equipment payment" },
    ],
  },
  jobber: { clients, jobs },
  gmail: { messages: [
    { id: "gmail-nqb-payroll", threadId: "gmail-thread-nqb-payroll", sender: "payroll@gusto.example.test", recipient: "owner@clearflow.example.test", subject: "Upcoming payroll debit $7,200", timestamp: "2026-08-26T16:00:00.000Z", textBody: "Your next payroll debit of $7,200 is scheduled for August 31.", attachments: [] },
    { id: "gmail-nqb-supplier", threadId: "gmail-thread-nqb-supplier", sender: "billing@ferguson.example.test", recipient: "owner@clearflow.example.test", subject: "Supplier invoice due — SUMMIT-118", timestamp: "2026-08-25T15:00:00.000Z", textBody: "Invoice for $3,850 is due September 2. Reference SUMMIT-118.", attachments: [{ id: "attachment-nqb-supplier", filename: "invoice-SUMMIT-118.pdf", mimeType: "application/pdf" }] },
    { id: "gmail-nqb-complete", threadId: "gmail-thread-nqb-complete", sender: "ap@summitproperty.example.test", recipient: "owner@clearflow.example.test", subject: "Work accepted for SUMMIT-118", timestamp: "2026-08-19T18:00:00.000Z", textBody: "The completed work for SUMMIT-118 has been accepted. Please send the invoice.", attachments: [] },
  ] },
};

export const answerKey: ScenarioAnswerKey = {
  completedUnbilledJobs: jobs.filter(job => job.status === "completed").map(job => ({ jobId: job.id, jobNumber: job.jobNumber, value: job.total })),
  completedUnbilledJobCount: 3, completedUnbilledValue: 12_600,
  bankFacts: { inflows: 16_500, outflows: 17_000, netCashMovement: -500, currentCash: 6_450, availableCash: 6_200 },
};
