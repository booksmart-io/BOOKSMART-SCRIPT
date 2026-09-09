import type { ScenarioAnswerKey, ScenarioFixture } from "../types";

const clients = [
  { id: "jobber-client-oak", name: "Oak Street Residence", email: "oak.owner@example.test" },
  { id: "jobber-client-maple", name: "Maple Grove HOA", email: "manager@maplegrove.example.test" },
  { id: "jobber-client-river", name: "River Bend Offices", email: "facilities@riverbend.example.test" },
];

const jobs: ScenarioFixture["jobber"]["jobs"] = [
  ["job-oak-1042", "jobber-client-oak", "OAK-1042", "Backyard drainage and grading", 4200, "2026-07-08"],
  ["job-maple-218", "jobber-client-maple", "MAPLE-218", "Irrigation zone replacement", 3650, "2026-07-15"],
  ["job-river-771", "jobber-client-river", "RIVER-771", "Commercial landscape refresh", 5100, "2026-07-22"],
  ["job-oak-1055", "jobber-client-oak", "OAK-1055", "Retaining wall repair", 2950, "2026-08-03"],
  ["job-maple-231", "jobber-client-maple", "MAPLE-231", "Tree trimming and cleanup", 2550, "2026-08-11"],
].map(([id, clientId, jobNumber, title, total, completedAt]) => ({
  id: String(id), clientId: String(clientId), jobNumber: String(jobNumber), title: String(title), status: "completed",
  completedAt: String(completedAt), total: Number(total),
  lineItems: [{ id: `line-${id}`, description: String(title), quantity: 1, unitPrice: Number(total), amount: Number(total) }],
}));

export const scenario: ScenarioFixture = {
  manifest: {
    scenarioId: "04_UNBILLED_LANDSCAPING",
    scenarioName: "Unbilled Landscaping",
    industry: "Landscaping contractor",
    companyName: "Evergreen Works Landscaping LLC",
    dateRange: { start: "2026-07-01", end: "2026-08-31" },
    connectedSources: ["quickbooks", "jobber", "gmail"],
    businessStory: "Five completed landscaping jobs have not been matched to accounting invoices.",
    expectedInsightKeys: ["contractor:completed-work-unbilled"],
    prohibitedInsightKeys: ["contractor:cash-pressure"],
  },
  quickbooks: { deposits: [], purchases: [],
    invoices: [{
      id: "qb-invoice-maint-9001", customerId: "qb-customer-maple-grove", invoiceNumber: "INV-9001", projectId: "MAPLE-MAINT",
      issuedDate: "2026-08-01", dueDate: "2026-08-31", total: 1800, balance: 0,
      lines: [{ id: "qb-line-maint-9001", description: "Monthly grounds maintenance", quantity: 1, unitPrice: 1800, amount: 1800 }],
    }],
  },
  plaid: { institutionName: "", accounts: [], transactions: [] },
  jobber: { clients, jobs },
  gmail: {
    messages: jobs.map((job, index) => ({
      id: `gmail-completion-${index + 1}`, threadId: `gmail-thread-${job.jobNumber.toLowerCase()}`,
      sender: "dispatch@evergreenworks.example.test", recipient: clients.find(client => client.id === job.clientId)!.email,
      subject: `Work completed — ${job.jobNumber}`, timestamp: `${job.completedAt}T17:30:00.000Z`,
      textBody: `The work for job ${job.jobNumber} is complete. Thank you for choosing Evergreen Works.`, attachments: [],
    })),
  },
};

export const answerKey: ScenarioAnswerKey = {
  completedUnbilledJobCount: 5,
  completedUnbilledValue: 18_450,
  completedUnbilledJobs: jobs.map(job => ({ jobId: job.id, jobNumber: job.jobNumber, value: job.total })),
};
