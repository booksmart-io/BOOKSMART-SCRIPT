import { createHash } from "node:crypto";

export type StatementType = "pnl" | "bs" | "cf";
export type StatementLifecycle =
  | "uploaded"
  | "extracting"
  | "needs_review"
  | "confirmed"
  | "failed"
  | "abandoned";
export type StatementScale = "ones" | "thousands" | "millions";

export type Evidence = {
  field: string;
  page: number | null;
  location: string | null;
  excerpt: string | null;
};

export type StatementMetadata = {
  statement_type: StatementType;
  entity_name: string | null;
  period_start: string | null;
  period_end: string | null;
  as_of_date: string | null;
  currency: string;
  scale: StatementScale;
  comparative_periods: Array<{
    label: string;
    period_start: string | null;
    period_end: string | null;
    as_of_date: string | null;
  }>;
};

export type CanonicalValues = Record<string, number | null>;

export type NormalizedStatement = {
  metadata: StatementMetadata;
  values: CanonicalValues;
  evidence: Evidence[];
  warnings: string[];
  confidence: number | null;
};

export type ValidationFinding = {
  code: string;
  severity: "error" | "warning";
  message: string;
  expected: number | null;
  actual: number | null;
  difference: number | null;
  tolerance: number;
};

const FIELDS: Record<StatementType, readonly string[]> = {
  pnl: [
    "revenue", "cost_of_goods_sold", "gross_profit", "operating_expenses",
    "operating_income", "interest_expense", "tax_expense", "net_income",
  ],
  bs: [
    "cash", "current_assets", "non_current_assets", "total_assets",
    "current_liabilities", "long_term_liabilities", "total_liabilities",
    "equity", "total_liabilities_and_equity",
  ],
  cf: [
    "beginning_cash", "operating_activities", "investing_activities",
    "financing_activities", "net_cash_change", "ending_cash",
  ],
};

const REQUIRED: Record<StatementType, readonly string[]> = {
  pnl: ["revenue", "cost_of_goods_sold", "gross_profit", "operating_expenses", "net_income"],
  bs: ["current_assets", "non_current_assets", "total_assets", "current_liabilities", "long_term_liabilities", "total_liabilities", "equity"],
  cf: ["operating_activities", "investing_activities", "financing_activities", "net_cash_change"],
};

export const STATEMENT_SCHEMA_VERSION = "financial-statement-v2";
export const STATEMENT_PROMPT_VERSION = "financial-statement-extraction-2026-07-23";

export function normalizeStatementType(value: unknown): StatementType | null {
  const s = String(value ?? "").trim().toLowerCase();
  if (["pnl", "pl", "profit_loss", "profit & loss", "income statement"].includes(s)) return "pnl";
  if (["bs", "balance_sheet", "balance sheet"].includes(s)) return "bs";
  if (["cf", "cash_flow", "cash flow statement", "cashflow"].includes(s)) return "cf";
  return null;
}

export function statementFields(type: StatementType): readonly string[] {
  return FIELDS[type];
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function validateIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function finiteNullable(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

export function parseStructuredStatement(
  raw: unknown,
  requestedType: StatementType,
): NormalizedStatement {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("AI response must be a JSON object.");
  }
  const root = raw as Record<string, unknown>;
  const metadata = root.metadata;
  const values = root.values;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("AI response is missing metadata.");
  }
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("AI response is missing values.");
  }
  const m = metadata as Record<string, unknown>;
  const statementType = normalizeStatementType(m.statement_type);
  if (statementType !== requestedType) {
    throw new Error(`Statement type mismatch: expected ${requestedType}.`);
  }
  const currency = String(m.currency ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be an ISO 4217 code.");
  const scale = m.scale;
  if (!["ones", "thousands", "millions"].includes(String(scale))) {
    throw new Error("Scale must be ones, thousands, or millions.");
  }
  const normalizedValues: CanonicalValues = {};
  const inputValues = values as Record<string, unknown>;
  for (const field of FIELDS[requestedType]) {
    const value = inputValues[field];
    if (!finiteNullable(value)) throw new Error(`${field} must be a finite number or null.`);
    normalizedValues[field] = value;
  }
  for (const field of REQUIRED[requestedType]) {
    if (!(field in inputValues)) throw new Error(`Missing required field ${field}.`);
  }
  const periodStart = m.period_start;
  const periodEnd = m.period_end;
  const asOf = m.as_of_date;
  if (requestedType === "bs") {
    if (!validateIsoDate(asOf)) throw new Error("Balance Sheet requires as_of_date.");
  } else if (!validateIsoDate(periodStart) || !validateIsoDate(periodEnd) || periodEnd < periodStart) {
    throw new Error("Statement requires a valid period_start and period_end.");
  }
  const evidence = Array.isArray(root.evidence)
    ? root.evidence.flatMap((item): Evidence[] => {
        if (!item || typeof item !== "object") return [];
        const e = item as Record<string, unknown>;
        if (!FIELDS[requestedType].includes(String(e.field))) return [];
        return [{
          field: String(e.field),
          page: typeof e.page === "number" && Number.isInteger(e.page) && e.page > 0 ? e.page : null,
          location: typeof e.location === "string" ? e.location.slice(0, 200) : null,
          excerpt: typeof e.excerpt === "string" ? e.excerpt.slice(0, 500) : null,
        }];
      })
    : [];
  return {
    metadata: {
      statement_type: requestedType,
      entity_name: typeof m.entity_name === "string" && m.entity_name.trim() ? m.entity_name.trim().slice(0, 300) : null,
      period_start: requestedType === "bs" ? null : String(periodStart),
      period_end: requestedType === "bs" ? null : String(periodEnd),
      as_of_date: requestedType === "bs" ? String(asOf) : null,
      currency,
      scale: scale as StatementScale,
      comparative_periods: Array.isArray(m.comparative_periods) ? m.comparative_periods.slice(0, 12) as StatementMetadata["comparative_periods"] : [],
    },
    values: normalizedValues,
    evidence,
    warnings: Array.isArray(root.warnings) ? root.warnings.filter((v): v is string => typeof v === "string").map(v => v.slice(0, 500)) : [],
    confidence: typeof root.confidence === "number" && root.confidence >= 0 && root.confidence <= 1 ? root.confidence : null,
  };
}

function compare(
  code: string,
  message: string,
  expected: number | null,
  actual: number | null,
  tolerance: number,
): ValidationFinding | null {
  if (expected === null || actual === null) return null;
  const difference = Math.round((actual - expected) * 100) / 100;
  if (Math.abs(difference) <= tolerance) return null;
  return { code, severity: "warning", message, expected, actual, difference, tolerance };
}

export function validateAccounting(
  statement: NormalizedStatement,
  tolerance = 1,
): ValidationFinding[] {
  const v = statement.values;
  const findings: ValidationFinding[] = [];
  const add = (finding: ValidationFinding | null) => { if (finding) findings.push(finding); };
  for (const [field, value] of Object.entries(v)) {
    if (!finiteNullable(value)) {
      findings.push({ code: `invalid_${field}`, severity: "error", message: `${field} is not a finite number.`, expected: null, actual: null, difference: null, tolerance });
    }
  }
  if (statement.metadata.statement_type === "pnl") {
    add(compare("pnl_gross_profit", "Gross profit differs from revenue minus cost of goods sold.",
      v.revenue === null || v.cost_of_goods_sold === null ? null : v.revenue - v.cost_of_goods_sold,
      v.gross_profit, tolerance));
    add(compare("pnl_operating_income", "Operating income differs from gross profit minus operating expenses.",
      v.gross_profit === null || v.operating_expenses === null ? null : v.gross_profit - v.operating_expenses,
      v.operating_income, tolerance));
    add(compare("pnl_net_income", "Net income differs from operating income less interest and tax expense.",
      [v.operating_income, v.interest_expense, v.tax_expense].some(x => x === null) ? null :
        (v.operating_income as number) - (v.interest_expense as number) - (v.tax_expense as number),
      v.net_income, tolerance));
  } else if (statement.metadata.statement_type === "bs") {
    add(compare("bs_total_assets", "Total assets differ from current plus non-current assets.",
      v.current_assets === null || v.non_current_assets === null ? null : v.current_assets + v.non_current_assets,
      v.total_assets, tolerance));
    add(compare("bs_total_liabilities", "Total liabilities differ from current plus long-term liabilities.",
      v.current_liabilities === null || v.long_term_liabilities === null ? null : v.current_liabilities + v.long_term_liabilities,
      v.total_liabilities, tolerance));
    add(compare("bs_equation", "Assets differ from liabilities plus equity.",
      v.total_liabilities === null || v.equity === null ? null : v.total_liabilities + v.equity,
      v.total_assets, tolerance));
  } else {
    add(compare("cf_net_change", "Net cash change differs from operating plus investing plus financing activities.",
      [v.operating_activities, v.investing_activities, v.financing_activities].some(x => x === null) ? null :
        (v.operating_activities as number) + (v.investing_activities as number) + (v.financing_activities as number),
      v.net_cash_change, tolerance));
    add(compare("cf_rollforward", "Ending cash differs from beginning cash plus net cash change.",
      v.beginning_cash === null || v.net_cash_change === null ? null : v.beginning_cash + v.net_cash_change,
      v.ending_cash, tolerance));
  }
  return findings;
}

export function hasAnyNonZeroValue(statement: NormalizedStatement): boolean {
  return Object.values(statement.values).some(value => typeof value === "number" && value !== 0);
}

export function periodsOverlap(
  type: StatementType,
  a: Pick<StatementMetadata, "period_start" | "period_end" | "as_of_date">,
  b: Pick<StatementMetadata, "period_start" | "period_end" | "as_of_date">,
): boolean {
  if (type === "bs") return a.as_of_date !== null && a.as_of_date === b.as_of_date;
  if (!a.period_start || !a.period_end || !b.period_start || !b.period_end) return false;
  return a.period_start <= b.period_end && b.period_start <= a.period_end;
}
