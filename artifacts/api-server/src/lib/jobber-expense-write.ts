export type JobberExpenseDraft = { title: string; description: string; date: string; total: number; linkedJobId: string };

export function jobberExpenseWriteEnabled(organizationId: number, env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  if (env.JOBBER_EXPENSE_WRITE_ENABLED !== "true") return false;
  const allowed = new Set(String(env.JOBBER_EXPENSE_WRITE_ORGANIZATION_IDS ?? "").split(",").map(value => Number(value.trim())).filter(value => Number.isSafeInteger(value) && value > 0));
  return allowed.has(organizationId);
}

export function buildJobberExpenseDraft(input: { assignmentId: number; transactionTitle?: string | null; transactionDescription?: string | null; transactionDate: string; amount: number; jobberJobId: string; jobLabel?: string | null }): JobberExpenseDraft {
  if (!Number.isSafeInteger(input.assignmentId) || input.assignmentId <= 0) throw new Error("Invalid confirmed assignment.");
  if (!input.jobberJobId.trim()) throw new Error("The Jobber job is missing.");
  const total = Math.round(Math.abs(Number(input.amount)) * 100) / 100;
  if (!Number.isFinite(total) || total <= 0) throw new Error("The expense amount must be greater than zero.");
  const date = new Date(input.transactionDate);
  if (Number.isNaN(date.getTime())) throw new Error("The expense date is invalid.");
  const sourceTitle = input.transactionTitle?.trim() || input.transactionDescription?.trim() || "BookSmart job cost";
  return { title: sourceTitle.slice(0, 200), description: `Confirmed in BookSmart${input.jobLabel?.trim() ? ` for ${input.jobLabel.trim()}` : ""}. Assignment ${input.assignmentId}.`.slice(0, 500), date: date.toISOString(), total, linkedJobId: input.jobberJobId.trim() };
}

export const JOBBER_EXPENSE_CREATE_MUTATION = `mutation BookSmartExpenseCreate($input: ExpenseCreateInput!) { expenseCreate(input: $input) { expense { id title total } userErrors { message path } } }`;

export function parseJobberExpenseCreate(result: { expenseCreate?: { expense?: { id?: string; title?: string; total?: number } | null; userErrors?: Array<{ message?: string }> } }) {
  const errors = result.expenseCreate?.userErrors?.map(error => error.message).filter(Boolean) ?? [];
  if (errors.length) throw new Error(errors.join(" "));
  const expense = result.expenseCreate?.expense;
  if (!expense?.id) throw new Error("Jobber did not return the created expense.");
  return expense;
}
