export type Provider = "quickbooks" | "jobber" | "gmail" | "plaid" | "receipts";

export type ScenarioManifest = {
  scenarioId: string;
  scenarioName: string;
  industry: string;
  companyName: string;
  dateRange: { start: string; end: string };
  connectedSources: Provider[];
  businessStory: string;
  expectedInsightKeys: string[];
  prohibitedInsightKeys: string[];
  sourceHealth?: Partial<Record<Provider, { stale?: boolean; status?: "active" | "error" }>>;
};

export type QuickBooksInvoice = {
  id: string;
  customerId: string;
  invoiceNumber: string;
  projectId?: string;
  issuedDate: string;
  dueDate: string;
  lines: Array<{ id: string; description: string; quantity: number; unitPrice: number; amount: number }>;
  total: number;
  balance: number;
};
export type QuickBooksDeposit = { id: string; date: string; amount: number; description: string; classification: "business_income" };
export type QuickBooksPurchase = { id: string; date: string; amount: number; vendor: string; description: string; jobNumber?: string };
export type QuickBooksPayment = { id: string; invoiceId: string; date: string; amount: number; customerName: string; reference?: string };
export type QuickBooksCredit = { id: string; invoiceId?: string; paymentId?: string; date: string; amount: number; customerName: string; reason: "refund" | "credit" | "reversal"; reference?: string };
export type QuickBooksLiability = { id: string; dueDate: string; amount: number; payee: string; kind: "payroll" | "vendor" | "insurance" | "tax" | "other"; status: "open" | "paid" };
export type PlaidTransaction = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  merchant: string;
  description: string;
  pending?: boolean;
  kind?: "customer_payment" | "business_expense" | "internal_transfer" | "personal_transfer" | "refund" | "cash_withdrawal" | "unknown";
  relatedTransactionId?: string;
};
export type PlaidAccount = { id: string; name: string; type: "depository"; subtype: "checking" | "savings"; currentBalance: number; availableBalance: number };
export type ManualBankTransaction = PlaidTransaction & { statementId: string; originalTransactionId?: string };

export type JobberClient = { id: string; name: string; email: string };
export type JobberJob = {
  id: string;
  clientId: string;
  jobNumber: string;
  title: string;
  status: "draft" | "active" | "completed" | "closed";
  completedAt?: string;
  lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number; amount: number }>;
  total: number;
  estimatedCosts?: { materials: number; labor: number };
};
export type JobberInvoice = { id: string; clientId: string; jobId: string; invoiceNumber: string; status: "awaiting_payment" | "past_due" | "sent_not_due" | "paid"; issuedDate: string; dueDate: string; total: number; balance: number };
export type GmailMessage = {
  id: string;
  threadId: string;
  sender: string;
  recipient: string;
  subject: string;
  timestamp: string;
  textBody: string;
  htmlBody?: string;
  attachments: Array<{ id: string; filename: string; mimeType: string }>;
};
export type SyntheticReceipt = { id: string; vendor: string; date: string; subtotal: number; tax: number; total: number; paymentLastFour: string; poNumber?: string; jobNumber?: string; customerOrProject?: string; receiptNumber: string; lineItems: Array<{ sku?: string; description: string; quantity: number; amount: number }> };

export type ScenarioFixture = {
  manifest: ScenarioManifest;
  quickbooks: { invoices: QuickBooksInvoice[]; deposits: QuickBooksDeposit[]; purchases: QuickBooksPurchase[]; payments?: QuickBooksPayment[]; credits?: QuickBooksCredit[]; liabilities?: QuickBooksLiability[] };
  plaid: { institutionName: string; accounts: PlaidAccount[]; transactions: PlaidTransaction[]; manualTransactions?: ManualBankTransaction[]; syncedAt?: string };
  jobber: { clients: JobberClient[]; jobs: JobberJob[]; invoices?: JobberInvoice[] };
  gmail: { messages: GmailMessage[] };
  receipts?: SyntheticReceipt[];
};

export type ExpectedEvidenceReference = {
  provider: Provider | "manual_bank_statement";
  recordId: string;
  role: "primary" | "supporting" | "conflicting" | "missing" | "candidate";
};

export type ExpectedCrossSourceMatch = {
  id: string;
  recordIds: string[];
  economicEvent: "revenue" | "expense" | "transfer" | "refund" | "invoice" | "job_cost" | "obligation";
  expectedAmount?: number;
  confidence: "high" | "medium" | "low" | "ambiguous";
  disposition: "matched" | "duplicate" | "conflict" | "unmatched" | "manual_review";
};

export type ExpectedConflict = {
  id: string;
  recordIds: string[];
  field: string;
  values: Array<string | number | boolean | null>;
  requiredDisposition: "surface_for_review" | "wait_for_freshness" | "preserve_accounting_authority";
};

export type ExpectedInsight = {
  key: string;
  title?: string;
  numericValues?: Record<string, number>;
  evidence?: ExpectedEvidenceReference[];
  confidence?: "high" | "medium" | "low" | "limited";
};

export type ScenarioAnswerKey = {
  completedUnbilledJobs: Array<{ jobId: string; jobNumber: string; value: number }>;
  completedUnbilledJobCount: number;
  completedUnbilledValue: number;
  financialFacts?: {
    invoicedRevenue: number;
    accountsReceivable: number;
    jobValue: number;
    accountingExpenses?: number;
    netIncome?: number;
    netCashMovement?: number;
    arOver30?: number;
    arOver60?: number;
    arOver90?: number;
  };
  bankFacts?: { inflows: number; outflows: number; netCashMovement: number; currentCash: number; availableCash: number };
  expectedInsights?: ExpectedInsight[];
  expectedNumericValues?: Record<string, number>;
  expectedMatches?: ExpectedCrossSourceMatch[];
  expectedDuplicates?: Array<{ economicEvent: string; recordIds: string[]; expectedCount: number }>;
  expectedConflicts?: ExpectedConflict[];
  expectedMissingInsights?: string[];
  prohibitedConclusions?: string[];
  expectedConfidenceIssues?: Array<{ subject: string; expected: "medium" | "low" | "limited" | "ambiguous"; reason: string }>;
  recommendedFix?: string;
  severity?: "Critical" | "High" | "Medium" | "Low";
};
