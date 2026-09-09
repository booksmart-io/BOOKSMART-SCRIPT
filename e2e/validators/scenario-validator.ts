import type { ScenarioAnswerKey, ScenarioFixture } from "../scenarios/types";

export type ValidationIssue = { path: string; message: string };

const cents = (value: number) => Math.round(value * 100);
const validDate = (value: string) => Number.isFinite(new Date(value).getTime());

export function validateScenario(fixture: ScenarioFixture, answerKey: ScenarioAnswerKey): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Map<string, string>();
  const addId = (id: string, path: string) => {
    const prior = ids.get(id);
    if (prior) issues.push({ path, message: `ID ${id} is already used at ${prior}` });
    else ids.set(id, path);
  };

  if (!/^\d{2}_[A-Z0-9_]+$/.test(fixture.manifest.scenarioId)) {
    issues.push({ path: "manifest.scenarioId", message: "must use NN_UPPER_SNAKE_CASE" });
  }
  if (!validDate(fixture.manifest.dateRange.start) || !validDate(fixture.manifest.dateRange.end)) {
    issues.push({ path: "manifest.dateRange", message: "contains an invalid date" });
  } else if (new Date(fixture.manifest.dateRange.start) > new Date(fixture.manifest.dateRange.end)) {
    issues.push({ path: "manifest.dateRange", message: "start must not be after end" });
  }
  if (new Set(fixture.manifest.connectedSources).size !== fixture.manifest.connectedSources.length) {
    issues.push({ path: "manifest.connectedSources", message: "must not contain duplicate providers" });
  }

  const clientIds = new Set(fixture.jobber.clients.map(client => client.id));
  for (const [index, client] of fixture.jobber.clients.entries()) {
    addId(client.id, `jobber.clients[${index}].id`);
    if (!client.email.endsWith(".test")) issues.push({ path: `jobber.clients[${index}].email`, message: "must use a test-safe domain" });
  }
  for (const [index, job] of fixture.jobber.jobs.entries()) {
    addId(job.id, `jobber.jobs[${index}].id`);
    if (!clientIds.has(job.clientId)) issues.push({ path: `jobber.jobs[${index}].clientId`, message: `unknown client ${job.clientId}` });
    const lineTotal = job.lineItems.reduce((sum, line, lineIndex) => {
      addId(line.id, `jobber.jobs[${index}].lineItems[${lineIndex}].id`);
      if (cents(line.quantity * line.unitPrice) !== cents(line.amount)) issues.push({ path: `jobber.jobs[${index}].lineItems[${lineIndex}]`, message: "quantity × unit price does not equal amount" });
      return sum + line.amount;
    }, 0);
    if (cents(lineTotal) !== cents(job.total)) issues.push({ path: `jobber.jobs[${index}].total`, message: "line items do not reconcile to job total" });
    if ((job.status === "completed" || job.status === "closed") && !job.completedAt) issues.push({ path: `jobber.jobs[${index}].completedAt`, message: "completed work requires a completion date" });
  }
  const jobIds = new Set(fixture.jobber.jobs.map(job => job.id));
  for (const [index, invoice] of (fixture.jobber.invoices ?? []).entries()) {
    addId(invoice.id, `jobber.invoices[${index}].id`);
    if (!clientIds.has(invoice.clientId)) issues.push({ path: `jobber.invoices[${index}].clientId`, message: `unknown client ${invoice.clientId}` });
    if (!jobIds.has(invoice.jobId)) issues.push({ path: `jobber.invoices[${index}].jobId`, message: `unknown job ${invoice.jobId}` });
    if (invoice.balance < 0 || cents(invoice.balance) > cents(invoice.total)) issues.push({ path: `jobber.invoices[${index}].balance`, message: "must be between zero and total" });
    if (new Date(invoice.dueDate) < new Date(invoice.issuedDate)) issues.push({ path: `jobber.invoices[${index}].dueDate`, message: "must not predate invoice" });
  }

  for (const [index, invoice] of fixture.quickbooks.invoices.entries()) {
    addId(invoice.id, `quickbooks.invoices[${index}].id`);
    const lineTotal = invoice.lines.reduce((sum, line, lineIndex) => {
      addId(line.id, `quickbooks.invoices[${index}].lines[${lineIndex}].id`);
      if (cents(line.quantity * line.unitPrice) !== cents(line.amount)) issues.push({ path: `quickbooks.invoices[${index}].lines[${lineIndex}]`, message: "quantity × unit price does not equal amount" });
      return sum + line.amount;
    }, 0);
    if (cents(lineTotal) !== cents(invoice.total)) issues.push({ path: `quickbooks.invoices[${index}].total`, message: "line items do not reconcile to invoice total" });
    if (invoice.balance < 0 || cents(invoice.balance) > cents(invoice.total)) issues.push({ path: `quickbooks.invoices[${index}].balance`, message: "must be between zero and total" });
    if (new Date(invoice.dueDate) < new Date(invoice.issuedDate)) issues.push({ path: `quickbooks.invoices[${index}].dueDate`, message: "must not predate invoice" });
  }
  for (const [index, deposit] of fixture.quickbooks.deposits.entries()) {
    addId(deposit.id, `quickbooks.deposits[${index}].id`);
    if (!validDate(deposit.date)) issues.push({ path: `quickbooks.deposits[${index}].date`, message: "invalid date" });
    if (deposit.amount <= 0) issues.push({ path: `quickbooks.deposits[${index}].amount`, message: "must be positive" });
  }
  for (const [index, purchase] of fixture.quickbooks.purchases.entries()) {
    addId(purchase.id, `quickbooks.purchases[${index}].id`);
    if (!validDate(purchase.date)) issues.push({ path: `quickbooks.purchases[${index}].date`, message: "invalid date" });
    if (purchase.amount <= 0) issues.push({ path: `quickbooks.purchases[${index}].amount`, message: "must be positive" });
  }
  const quickBooksInvoiceIds = new Set(fixture.quickbooks.invoices.map(invoice => invoice.id));
  const quickBooksPaymentIds = new Set((fixture.quickbooks.payments ?? []).map(payment => payment.id));
  for (const [index, payment] of (fixture.quickbooks.payments ?? []).entries()) {
    addId(payment.id, `quickbooks.payments[${index}].id`);
    if (!quickBooksInvoiceIds.has(payment.invoiceId)) issues.push({ path: `quickbooks.payments[${index}].invoiceId`, message: `unknown invoice ${payment.invoiceId}` });
    if (!validDate(payment.date)) issues.push({ path: `quickbooks.payments[${index}].date`, message: "invalid date" });
    if (payment.amount <= 0) issues.push({ path: `quickbooks.payments[${index}].amount`, message: "must be positive" });
  }
  for (const [index, credit] of (fixture.quickbooks.credits ?? []).entries()) {
    addId(credit.id, `quickbooks.credits[${index}].id`);
    if (credit.invoiceId && !quickBooksInvoiceIds.has(credit.invoiceId)) issues.push({ path: `quickbooks.credits[${index}].invoiceId`, message: `unknown invoice ${credit.invoiceId}` });
    if (credit.paymentId && !quickBooksPaymentIds.has(credit.paymentId)) issues.push({ path: `quickbooks.credits[${index}].paymentId`, message: `unknown payment ${credit.paymentId}` });
    if (!validDate(credit.date)) issues.push({ path: `quickbooks.credits[${index}].date`, message: "invalid date" });
    if (credit.amount <= 0) issues.push({ path: `quickbooks.credits[${index}].amount`, message: "must be positive" });
    if (!credit.invoiceId && !credit.paymentId) issues.push({ path: `quickbooks.credits[${index}]`, message: "must reference an invoice or payment" });
  }
  for (const [index, liability] of (fixture.quickbooks.liabilities ?? []).entries()) {
    addId(liability.id, `quickbooks.liabilities[${index}].id`);
    if (!validDate(liability.dueDate)) issues.push({ path: `quickbooks.liabilities[${index}].dueDate`, message: "invalid date" });
    if (liability.amount <= 0) issues.push({ path: `quickbooks.liabilities[${index}].amount`, message: "must be positive" });
  }
  for (const [index, message] of fixture.gmail.messages.entries()) {
    addId(message.id, `gmail.messages[${index}].id`);
    if (!message.sender.endsWith(".test") || !message.recipient.endsWith(".test")) issues.push({ path: `gmail.messages[${index}]`, message: "sender and recipient must use test-safe domains" });
    if (!validDate(message.timestamp)) issues.push({ path: `gmail.messages[${index}].timestamp`, message: "invalid timestamp" });
  }
  for (const [index, receipt] of (fixture.receipts ?? []).entries()) {
    addId(receipt.id, `receipts[${index}].id`);
    if (!validDate(receipt.date)) issues.push({ path: `receipts[${index}].date`, message: "invalid date" });
    if (cents(receipt.subtotal + receipt.tax) !== cents(receipt.total)) issues.push({ path: `receipts[${index}].total`, message: "subtotal plus tax does not equal total" });
    if (!/^\d{4}$/.test(receipt.paymentLastFour)) issues.push({ path: `receipts[${index}].paymentLastFour`, message: "must contain four digits" });
    const receiptLines = receipt.lineItems.reduce((sum, line) => sum + line.amount, 0);
    if (cents(receiptLines) !== cents(receipt.subtotal)) issues.push({ path: `receipts[${index}].lineItems`, message: "line items do not equal subtotal" });
  }
  const plaidAccountIds = new Set(fixture.plaid.accounts.map(account => account.id));
  for (const [index, account] of fixture.plaid.accounts.entries()) addId(account.id, `plaid.accounts[${index}].id`);
  for (const [index, transaction] of fixture.plaid.transactions.entries()) {
    addId(transaction.id, `plaid.transactions[${index}].id`);
    if (!plaidAccountIds.has(transaction.accountId)) issues.push({ path: `plaid.transactions[${index}].accountId`, message: `unknown account ${transaction.accountId}` });
    if (!validDate(transaction.date)) issues.push({ path: `plaid.transactions[${index}].date`, message: "invalid date" });
    if (transaction.amount === 0) issues.push({ path: `plaid.transactions[${index}].amount`, message: "must not be zero" });
  }
  if (fixture.plaid.syncedAt && !validDate(fixture.plaid.syncedAt)) issues.push({ path: "plaid.syncedAt", message: "invalid timestamp" });
  for (const [index, transaction] of (fixture.plaid.manualTransactions ?? []).entries()) {
    addId(transaction.id, `plaid.manualTransactions[${index}].id`);
    if (!plaidAccountIds.has(transaction.accountId)) issues.push({ path: `plaid.manualTransactions[${index}].accountId`, message: `unknown account ${transaction.accountId}` });
    if (!validDate(transaction.date)) issues.push({ path: `plaid.manualTransactions[${index}].date`, message: "invalid date" });
    if (transaction.amount === 0) issues.push({ path: `plaid.manualTransactions[${index}].amount`, message: "must not be zero" });
  }

  const knownRecordIds = new Set(ids.keys());
  for (const [index, match] of (answerKey.expectedMatches ?? []).entries()) {
    if (match.recordIds.length < 1) issues.push({ path: `answerKey.expectedMatches[${index}].recordIds`, message: "must identify at least one source record" });
    if (new Set(match.recordIds).size !== match.recordIds.length) issues.push({ path: `answerKey.expectedMatches[${index}].recordIds`, message: "must not contain duplicate record IDs" });
    for (const recordId of match.recordIds) if (!knownRecordIds.has(recordId)) issues.push({ path: `answerKey.expectedMatches[${index}].recordIds`, message: `unknown record ${recordId}` });
    if (match.expectedAmount != null && !Number.isFinite(match.expectedAmount)) issues.push({ path: `answerKey.expectedMatches[${index}].expectedAmount`, message: "must be finite" });
  }
  for (const [index, duplicate] of (answerKey.expectedDuplicates ?? []).entries()) {
    if (duplicate.expectedCount < 1 || !Number.isInteger(duplicate.expectedCount)) issues.push({ path: `answerKey.expectedDuplicates[${index}].expectedCount`, message: "must be a positive integer" });
    for (const recordId of duplicate.recordIds) if (!knownRecordIds.has(recordId)) issues.push({ path: `answerKey.expectedDuplicates[${index}].recordIds`, message: `unknown record ${recordId}` });
  }
  for (const [index, conflict] of (answerKey.expectedConflicts ?? []).entries()) {
    if (conflict.values.length < 2) issues.push({ path: `answerKey.expectedConflicts[${index}].values`, message: "must contain at least two conflicting values" });
    for (const recordId of conflict.recordIds) if (!knownRecordIds.has(recordId)) issues.push({ path: `answerKey.expectedConflicts[${index}].recordIds`, message: `unknown record ${recordId}` });
  }
  for (const [key, value] of Object.entries(answerKey.expectedNumericValues ?? {})) {
    if (!Number.isFinite(value)) issues.push({ path: `answerKey.expectedNumericValues.${key}`, message: "must be finite" });
  }
  for (const [insightIndex, insight] of (answerKey.expectedInsights ?? []).entries()) {
    for (const [evidenceIndex, evidence] of (insight.evidence ?? []).entries()) {
      if (evidence.role !== "missing" && !knownRecordIds.has(evidence.recordId)) issues.push({ path: `answerKey.expectedInsights[${insightIndex}].evidence[${evidenceIndex}].recordId`, message: `unknown record ${evidence.recordId}` });
    }
  }

  const invoicedProjectIds = new Set(fixture.quickbooks.invoices.map(invoice => invoice.projectId).filter(Boolean));
  const jobberInvoicedJobIds = new Set((fixture.jobber.invoices ?? []).map(invoice => invoice.jobId));
  const computed = fixture.jobber.jobs.filter(job => (job.status === "completed" || job.status === "closed") && !invoicedProjectIds.has(job.jobNumber) && !jobberInvoicedJobIds.has(job.id));
  const computedTotal = computed.reduce((sum, job) => sum + job.total, 0);
  if (computed.length !== answerKey.completedUnbilledJobCount) issues.push({ path: "answerKey.completedUnbilledJobCount", message: `expected ${answerKey.completedUnbilledJobCount}, mathematically proved ${computed.length}` });
  if (cents(computedTotal) !== cents(answerKey.completedUnbilledValue)) issues.push({ path: "answerKey.completedUnbilledValue", message: `expected ${answerKey.completedUnbilledValue}, mathematically proved ${computedTotal}` });
  const expectedIds = [...answerKey.completedUnbilledJobs].map(row => row.jobId).sort();
  const computedIds = computed.map(row => row.id).sort();
  if (expectedIds.join("|") !== computedIds.join("|")) issues.push({ path: "answerKey.completedUnbilledJobs", message: "job IDs do not match mathematically proved unbilled jobs" });
  if (answerKey.financialFacts) {
    const invoiceTotal = fixture.quickbooks.invoices.reduce((sum, invoice) => sum + invoice.total, 0);
    const arTotal = fixture.quickbooks.invoices.reduce((sum, invoice) => sum + invoice.balance, 0);
    const jobTotal = fixture.jobber.jobs.reduce((sum, job) => sum + job.total, 0);
    const depositTotal = fixture.quickbooks.deposits.reduce((sum, deposit) => sum + deposit.amount, 0);
    const purchaseTotal = fixture.quickbooks.purchases.reduce((sum, purchase) => sum + purchase.amount, 0);
    if (cents(invoiceTotal) !== cents(answerKey.financialFacts.invoicedRevenue)) issues.push({ path: "answerKey.financialFacts.invoicedRevenue", message: `expected ${answerKey.financialFacts.invoicedRevenue}, mathematically proved ${invoiceTotal}` });
    if (cents(arTotal) !== cents(answerKey.financialFacts.accountsReceivable)) issues.push({ path: "answerKey.financialFacts.accountsReceivable", message: `expected ${answerKey.financialFacts.accountsReceivable}, mathematically proved ${arTotal}` });
    const periodEnd = new Date(`${fixture.manifest.dateRange.end}T23:59:59.999Z`).getTime();
    const aged = (days: number) => fixture.quickbooks.invoices.filter(invoice => invoice.balance > 0 && (periodEnd - new Date(`${invoice.dueDate}T23:59:59.999Z`).getTime()) / 86_400_000 > days).reduce((sum, invoice) => sum + invoice.balance, 0);
    if (answerKey.financialFacts.arOver30 != null && cents(aged(30)) !== cents(answerKey.financialFacts.arOver30)) issues.push({ path: "answerKey.financialFacts.arOver30", message: `expected ${answerKey.financialFacts.arOver30}, mathematically proved ${aged(30)}` });
    if (answerKey.financialFacts.arOver60 != null && cents(aged(60)) !== cents(answerKey.financialFacts.arOver60)) issues.push({ path: "answerKey.financialFacts.arOver60", message: `expected ${answerKey.financialFacts.arOver60}, mathematically proved ${aged(60)}` });
    if (answerKey.financialFacts.arOver90 != null && cents(aged(90)) !== cents(answerKey.financialFacts.arOver90)) issues.push({ path: "answerKey.financialFacts.arOver90", message: `expected ${answerKey.financialFacts.arOver90}, mathematically proved ${aged(90)}` });
    if (cents(jobTotal) !== cents(answerKey.financialFacts.jobValue)) issues.push({ path: "answerKey.financialFacts.jobValue", message: `expected ${answerKey.financialFacts.jobValue}, mathematically proved ${jobTotal}` });
    if (answerKey.financialFacts.accountingExpenses != null && cents(purchaseTotal) !== cents(answerKey.financialFacts.accountingExpenses)) issues.push({ path: "answerKey.financialFacts.accountingExpenses", message: `expected ${answerKey.financialFacts.accountingExpenses}, mathematically proved ${purchaseTotal}` });
    const provedNet = depositTotal - purchaseTotal;
    if (answerKey.financialFacts.netIncome != null && cents(provedNet) !== cents(answerKey.financialFacts.netIncome)) issues.push({ path: "answerKey.financialFacts.netIncome", message: `expected ${answerKey.financialFacts.netIncome}, mathematically proved ${provedNet}` });
    if (answerKey.financialFacts.netCashMovement != null && cents(provedNet) !== cents(answerKey.financialFacts.netCashMovement)) issues.push({ path: "answerKey.financialFacts.netCashMovement", message: `expected ${answerKey.financialFacts.netCashMovement}, mathematically proved ${provedNet}` });
  }
  if (answerKey.bankFacts) {
    const inflows = fixture.plaid.transactions.filter(row => !row.pending && row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
    const outflows = Math.abs(fixture.plaid.transactions.filter(row => !row.pending && row.amount < 0).reduce((sum, row) => sum + row.amount, 0));
    const currentCash = fixture.plaid.accounts.reduce((sum, row) => sum + row.currentBalance, 0);
    const availableCash = fixture.plaid.accounts.reduce((sum, row) => sum + row.availableBalance, 0);
    if (cents(inflows) !== cents(answerKey.bankFacts.inflows)) issues.push({ path: "answerKey.bankFacts.inflows", message: `expected ${answerKey.bankFacts.inflows}, mathematically proved ${inflows}` });
    if (cents(outflows) !== cents(answerKey.bankFacts.outflows)) issues.push({ path: "answerKey.bankFacts.outflows", message: `expected ${answerKey.bankFacts.outflows}, mathematically proved ${outflows}` });
    if (cents(inflows - outflows) !== cents(answerKey.bankFacts.netCashMovement)) issues.push({ path: "answerKey.bankFacts.netCashMovement", message: `expected ${answerKey.bankFacts.netCashMovement}, mathematically proved ${inflows - outflows}` });
    if (cents(currentCash) !== cents(answerKey.bankFacts.currentCash)) issues.push({ path: "answerKey.bankFacts.currentCash", message: `expected ${answerKey.bankFacts.currentCash}, mathematically proved ${currentCash}` });
    if (cents(availableCash) !== cents(answerKey.bankFacts.availableCash)) issues.push({ path: "answerKey.bankFacts.availableCash", message: `expected ${answerKey.bankFacts.availableCash}, mathematically proved ${availableCash}` });
  }

  return issues;
}
