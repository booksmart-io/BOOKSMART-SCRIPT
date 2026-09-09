import type { ScenarioAnswerKey, ScenarioFixture } from "../types";

export const scenario: ScenarioFixture = {
  manifest: { scenarioId: "07_OWNER_SPENDING_MESS", scenarioName: "Owner Spending Mess", industry: "Independent creative services",
    companyName: "Juniper Creative Studio LLC", dateRange: { start: "2026-07-01", end: "2026-08-31" }, connectedSources: ["plaid", "gmail"],
    businessStory: "A profitable-looking owner-operated studio has recurring subscriptions, cash withdrawals, and ambiguous mixed-purpose spending that needs review without accusations.",
    expectedInsightKeys: ["negative-cash-movement"],
    prohibitedInsightKeys: ["contractor:completed-work-unbilled", "contractor:overdue-receivables", "contractor:completed-jobs-outstanding"] },
  quickbooks: { invoices: [], deposits: [], purchases: [] },
  plaid: { institutionName: "Synthetic Community Bank",
    accounts: [{ id: "plaid-account-osm-checking", name: "Juniper Operating", type: "depository", subtype: "checking", currentBalance: 4_050, availableBalance: 3_800 }],
    transactions: [
      { id: "plaid-osm-july-income", accountId: "plaid-account-osm-checking", date: "2026-07-08", amount: 14_000, merchant: "Client ACH", description: "July client payments" },
      { id: "plaid-osm-july-software", accountId: "plaid-account-osm-checking", date: "2026-07-12", amount: -300, merchant: "Design Cloud Pro", description: "Monthly subscription" },
      { id: "plaid-osm-july-storage", accountId: "plaid-account-osm-checking", date: "2026-07-16", amount: -180, merchant: "Cloud Storage Plus", description: "Monthly subscription" },
      { id: "plaid-osm-july-costs", accountId: "plaid-account-osm-checking", date: "2026-07-21", amount: -8_520, merchant: "Operating Vendors", description: "July operating expenses" },
      { id: "plaid-osm-aug-income", accountId: "plaid-account-osm-checking", date: "2026-08-06", amount: 12_000, merchant: "Client ACH", description: "August client payments" },
      { id: "plaid-osm-aug-software", accountId: "plaid-account-osm-checking", date: "2026-08-12", amount: -390, merchant: "Design Cloud Pro", description: "Monthly subscription price increase" },
      { id: "plaid-osm-aug-storage", accountId: "plaid-account-osm-checking", date: "2026-08-16", amount: -180, merchant: "Cloud Storage Plus", description: "Monthly subscription" },
      { id: "plaid-osm-atm-1", accountId: "plaid-account-osm-checking", date: "2026-08-18", amount: -2_000, merchant: "ATM Withdrawal", description: "Cash withdrawal" },
      { id: "plaid-osm-atm-2", accountId: "plaid-account-osm-checking", date: "2026-08-23", amount: -1_500, merchant: "ATM Withdrawal", description: "Cash withdrawal" },
      { id: "plaid-osm-retail", accountId: "plaid-account-osm-checking", date: "2026-08-20", amount: -1_430, merchant: "General Retail", description: "Purpose requires owner review" },
      { id: "plaid-osm-other", accountId: "plaid-account-osm-checking", date: "2026-08-25", amount: -9_000, merchant: "Operating Vendors", description: "Payroll rent contractors and operating costs" },
    ] },
  jobber: { clients: [], jobs: [], invoices: [] },
  gmail: { messages: [
    { id: "gmail-osm-design", threadId: "gmail-thread-osm-design", sender: "billing@designcloud.example.test", recipient: "owner@junipercreative.example.test", subject: "Design Cloud subscription increased", timestamp: "2026-08-11T16:00:00.000Z", textBody: "Your monthly plan increases from $300 to $390 beginning August 12.", attachments: [] },
    { id: "gmail-osm-storage", threadId: "gmail-thread-osm-storage", sender: "billing@cloudstorage.example.test", recipient: "owner@junipercreative.example.test", subject: "Cloud Storage monthly receipt", timestamp: "2026-08-16T16:00:00.000Z", textBody: "Monthly storage charge: $180.", attachments: [] },
  ] },
};

export const answerKey: ScenarioAnswerKey = { completedUnbilledJobs: [], completedUnbilledJobCount: 0, completedUnbilledValue: 0,
  bankFacts: { inflows: 26_000, outflows: 23_500, netCashMovement: 2_500, currentCash: 4_050, availableCash: 3_800 } };
