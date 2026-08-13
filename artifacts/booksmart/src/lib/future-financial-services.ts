export type AvailabilityResult<T> = ({ available: true; calculatedAt: string; confidence: number } & T)
  | { available: false; calculatedAt: string; confidence: 0; missingInputs: string[] };

export type SafeToSpendInputs = {
  cashAvailable?: number;
  balanceFresh?: boolean;
  knownObligations?: number;
  payrollRequirement?: number;
  taxReserveRequirement?: number;
  operatingBuffer?: number;
};

export function calculateSafeToSpend(input: SafeToSpendInputs): AvailabilityResult<{
  cashAvailable: number; knownObligations: number; payrollRequirement: number;
  taxReserveRequirement: number; operatingBuffer: number; safeToSpend: number; rawAvailableCash: number; shortfall: number;
}> {
  const required: Array<keyof SafeToSpendInputs> = ["cashAvailable", "knownObligations", "payrollRequirement", "taxReserveRequirement", "operatingBuffer"];
  const missingInputs = required.filter(key => input[key] == null).map(String);
  if (input.balanceFresh !== true) missingInputs.push("fresh_account_balance");
  const calculatedAt = new Date().toISOString();
  if (missingInputs.length) return { available: false, calculatedAt, confidence: 0, missingInputs };
  const rawAvailableCash = input.cashAvailable! - input.knownObligations! - input.payrollRequirement! - input.taxReserveRequirement! - input.operatingBuffer!;
  const safeToSpend = Math.max(0, rawAvailableCash);
  return { available: true, calculatedAt, confidence: 1, cashAvailable: input.cashAvailable!, knownObligations: input.knownObligations!, payrollRequirement: input.payrollRequirement!, taxReserveRequirement: input.taxReserveRequirement!, operatingBuffer: input.operatingBuffer!, safeToSpend, rawAvailableCash, shortfall: Math.max(0, -rawAvailableCash) };
}

export function taxReserveAvailability(input: { taxStrategyConfigured: boolean; effectiveRate?: number; projectedTaxableIncome?: number; amountSetAside?: number }) {
  const missingInputs: string[] = [];
  if (!input.taxStrategyConfigured) missingInputs.push("tax_strategy");
  if (input.effectiveRate == null) missingInputs.push("effective_rate");
  if (input.projectedTaxableIncome == null) missingInputs.push("projected_taxable_income");
  if (input.amountSetAside == null) missingInputs.push("reserved_funds");
  const estimatedReserve = missingInputs.length ? null : input.projectedTaxableIncome! * input.effectiveRate! / 100;
  return { available: missingInputs.length === 0, missingInputs, calculatedAt: new Date().toISOString(), estimatedReserve, amountSetAside: missingInputs.length ? null : input.amountSetAside!, remainingReserve: estimatedReserve === null ? null : Math.max(0, estimatedReserve - input.amountSetAside!), disclaimer: "Monitoring estimate only; not licensed tax advice." };
}

export function forecastAvailability(input: { recurringTransactions: boolean; knownObligations: boolean; payroll: boolean; receivables: boolean }) {
  const missingInputs = Object.entries(input).filter(([, available]) => !available).map(([key]) => key);
  return { available: missingInputs.length === 0, missingInputs, calculatedAt: new Date().toISOString() };
}

export type ForecastPlanningItem = { id: number; itemType: "obligation" | "receivable" | "filing_schedule"; name: string; amount: number; dueDate: string; recurrence: "none" | "weekly" | "monthly" | "quarterly" | "yearly" };
export type ForecastEvent = { key: string; date: string; label: string; type: "receivable" | "obligation" | "payroll" | "tax_payment"; amount: number; projectedBalance: number };

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
function nextOccurrence(date: Date, recurrence: ForecastPlanningItem["recurrence"]) {
  const next = new Date(date); if (recurrence === "weekly") next.setUTCDate(next.getUTCDate() + 7); else if (recurrence === "monthly") next.setUTCMonth(next.getUTCMonth() + 1); else if (recurrence === "quarterly") next.setUTCMonth(next.getUTCMonth() + 3); else if (recurrence === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1); return next;
}

export function calculateThirtyDayForecast(input: {
  openingCash?: number; balanceFresh?: boolean; items: ForecastPlanningItem[];
  payrollAmount?: number; payrollCadence?: "weekly" | "biweekly" | "semimonthly" | "monthly"; nextPayrollDate?: string;
  start?: Date;
}): AvailabilityResult<{ openingCash: number; endingCash: number; lowestBalance: number; lowestBalanceDate: string; totalCashIn: number; totalCashOut: number; shortfall: number; shortfallDate: string | null; events: ForecastEvent[] }> {
  const calculatedAt = new Date().toISOString(); const missingInputs: string[] = [];
  if (input.openingCash == null) missingInputs.push("cashAvailable"); if (input.balanceFresh !== true) missingInputs.push("fresh_account_balance");
  if (input.payrollAmount == null || !input.payrollCadence || !input.nextPayrollDate) missingInputs.push("payroll");
  if (!input.items.some(item => item.itemType === "obligation")) missingInputs.push("knownObligations");
  if (!input.items.some(item => item.itemType === "receivable")) missingInputs.push("receivables");
  if (missingInputs.length) return { available: false, calculatedAt, confidence: 0, missingInputs: [...new Set(missingInputs)] };
  const start = new Date(input.start ?? new Date()); start.setUTCHours(0, 0, 0, 0); const end = new Date(start); end.setUTCDate(end.getUTCDate() + 30);
  const pending: Array<Omit<ForecastEvent, "projectedBalance">> = [];
  for (const item of input.items) {
    if (!Number.isFinite(item.amount) || item.amount < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)) continue;
    let date = new Date(`${item.dueDate}T00:00:00.000Z`); let occurrence = 0;
    while (date < start && item.recurrence !== "none" && occurrence++ < 1000) date = nextOccurrence(date, item.recurrence);
    while (date <= end && occurrence++ < 1000) {
      if (date >= start) pending.push({ key: `item:${item.id}:${isoDay(date)}`, date: isoDay(date), label: item.name, type: item.itemType === "receivable" ? "receivable" : item.itemType === "filing_schedule" ? "tax_payment" : "obligation", amount: item.itemType === "receivable" ? item.amount : -item.amount });
      if (item.recurrence === "none") break; date = nextOccurrence(date, item.recurrence);
    }
  }
  let payrollDate = new Date(`${input.nextPayrollDate}T00:00:00.000Z`); const payrollDays = input.payrollCadence === "weekly" ? 7 : ["biweekly", "semimonthly"].includes(input.payrollCadence!) ? (input.payrollCadence === "biweekly" ? 14 : 15) : null; let payrollIndex = 0;
  while (payrollDate < start && payrollIndex++ < 1000) { if (payrollDays) payrollDate.setUTCDate(payrollDate.getUTCDate() + payrollDays); else payrollDate.setUTCMonth(payrollDate.getUTCMonth() + 1); }
  while (payrollDate <= end && payrollIndex++ < 1000) { pending.push({ key: `payroll:${isoDay(payrollDate)}`, date: isoDay(payrollDate), label: "Payroll", type: "payroll", amount: -input.payrollAmount! }); if (payrollDays) payrollDate.setUTCDate(payrollDate.getUTCDate() + payrollDays); else payrollDate.setUTCMonth(payrollDate.getUTCMonth() + 1); }
  pending.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount || a.key.localeCompare(b.key));
  let balance = input.openingCash!; let lowestBalance = balance; let lowestBalanceDate = isoDay(start); let totalCashIn = 0; let totalCashOut = 0; let shortfallDate: string | null = null;
  const events: ForecastEvent[] = pending.map(event => { balance += event.amount; if (event.amount >= 0) totalCashIn += event.amount; else totalCashOut += Math.abs(event.amount); if (balance < lowestBalance) { lowestBalance = balance; lowestBalanceDate = event.date; } if (balance < 0 && shortfallDate === null) shortfallDate = event.date; return { ...event, projectedBalance: balance }; });
  return { available: true, calculatedAt, confidence: 1, openingCash: input.openingCash!, endingCash: balance, lowestBalance, lowestBalanceDate, totalCashIn, totalCashOut, shortfall: Math.max(0, -lowestBalance), shortfallDate, events };
}
