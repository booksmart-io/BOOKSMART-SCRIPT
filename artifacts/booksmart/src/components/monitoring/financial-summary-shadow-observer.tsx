import { useEffect, useRef } from "react";
import { authenticatedApi } from "@/lib/authenticated-api";

type Values = { revenue: number; accountingExpenses: number; netIncome: number; moneyIn: number; moneyOut: number; netCashMovement: number; healthScore: number };
type Sources = { pnl: string; balanceSheet: string; cashFlow: string };
const localDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function FinancialSummaryShadowObserver({ organizationId, surface, start, end, values, sources }: {
  organizationId: number; surface: "home" | "reports"; start: Date; end: Date; values: Values; sources: Sources;
}) {
  const lastPayload = useRef("");
  useEffect(() => {
    const enabled = import.meta.env.DEV || import.meta.env.VITE_FINANCIAL_SUMMARY_SHADOW === "true";
    if (!enabled) return;
    const payload = JSON.stringify({ surface, start: localDate(start), end: localDate(end), startInstant: start.toISOString(), endInstant: end.toISOString(), values, sources });
    if (payload === lastPayload.current) return;
    const timer = window.setTimeout(() => {
      lastPayload.current = payload;
      void authenticatedApi(`/api/organizations/${organizationId}/financial-summary/shadow`, { method: "POST", body: payload })
        .then(response => { if (!response.ok) console.warn("[financial-summary-shadow] comparison was not recorded", response.status); })
        .catch(error => console.warn("[financial-summary-shadow] comparison failed", error));
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [end, organizationId, sources, start, surface, values]);
  return null;
}
