import { calculateSafeToSpend, calculateThirtyDayForecast, taxReserveAvailability, type ForecastPlanningItem } from "../../../booksmart/src/lib/future-financial-services";
import { verifiedCashBalance, type BalanceSnapshot } from "./verified-cash-balance";

export const FINANCIAL_PLANNING_SUMMARY_VERSION = "financial-planning-v1" as const;

export type PlanningSettings = {
  payroll_amount?: number | string | null; payroll_cadence?: "weekly" | "biweekly" | "semimonthly" | "monthly" | null;
  next_payroll_date?: string | null; operating_buffer?: number | string | null; tax_effective_rate?: number | string | null;
  projected_taxable_income?: number | string | null; tax_amount_set_aside?: number | string | null;
  [key: string]: unknown;
};
export type PlanningItem = {
  id: number | string; item_type: ForecastPlanningItem["itemType"]; name: string; amount: number | string | null;
  due_date: string; recurrence: ForecastPlanningItem["recurrence"]; status?: string | null; [key: string]: unknown;
};
export type PlanningConnection = { status?: string | null; last_sync_status?: string | null };

const optionalNumber = (value: number | string | null | undefined) => value == null ? undefined : Number(value);

export function buildFinancialPlanningSummary(input: {
  settings?: PlanningSettings | null; items: PlanningItem[]; snapshots: BalanceSnapshot[];
  connections: PlanningConnection[]; now?: Date;
}) {
  const settings = input.settings ?? {};
  const active = input.items.filter(row => row.status == null || row.status === "active");
  const obligations = active.filter(row => row.item_type === "obligation");
  const filings = active.filter(row => row.item_type === "filing_schedule");
  const knownObligations = obligations.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const effectiveRate = optionalNumber(settings.tax_effective_rate);
  const projectedIncome = optionalNumber(settings.projected_taxable_income);
  const setAside = optionalNumber(settings.tax_amount_set_aside);
  const taxReserveRequirement = effectiveRate == null || projectedIncome == null || setAside == null
    ? undefined : Math.max(0, projectedIncome * effectiveRate / 100 - setAside);
  const cash = verifiedCashBalance({
    snapshots: input.snapshots,
    hasHealthyPlaidConnection: input.connections.some(row => row.status === "active" && row.last_sync_status !== "failed"),
    now: input.now,
  });
  const forecastItems = active.map(row => ({
    id: Number(row.id), itemType: row.item_type, name: row.name, amount: Number(row.amount ?? 0),
    dueDate: row.due_date, recurrence: row.recurrence,
  }));
  return {
    calculation_version: FINANCIAL_PLANNING_SUMMARY_VERSION,
    settings: input.settings ?? null,
    items: input.items,
    verified_cash: { available: cash.available, amount: cash.cashAvailable ?? null, account_count: cash.accountCount, refreshed_at: cash.latestBalanceAt, freshness_hours: 24 },
    readiness: {
      safe_to_spend: calculateSafeToSpend({
        cashAvailable: cash.cashAvailable, balanceFresh: cash.balanceFresh,
        knownObligations: obligations.length ? knownObligations : undefined,
        payrollRequirement: optionalNumber(settings.payroll_amount), taxReserveRequirement,
        operatingBuffer: optionalNumber(settings.operating_buffer),
      }),
      tax_reserve: taxReserveAvailability({
        taxStrategyConfigured: filings.length > 0, effectiveRate, projectedTaxableIncome: projectedIncome, amountSetAside: setAside,
      }),
      forecast: calculateThirtyDayForecast({
        openingCash: cash.cashAvailable, balanceFresh: cash.balanceFresh,
        payrollAmount: optionalNumber(settings.payroll_amount), payrollCadence: settings.payroll_cadence ?? undefined,
        nextPayrollDate: settings.next_payroll_date ?? undefined, items: forecastItems, start: input.now,
      }),
    },
  };
}
