export type FinancialTransaction = {
  id: number;
  amount: number;
  date_time: string;
  title?: string | null;
  description?: string | null;
  type?: string | null;
  deductible?: boolean;
  category_id?: number | null;
  sub_category_id?: number | null;
  category_name?: string | null;
  category_type?: string | null;
  sub_category_name?: string | null;
};

export type FinancialCategory = {
  id: number;
  name: string;
  type?: string | null;
};

export type FinancialSubCategory = {
  id: number;
  name: string;
  category_id?: number | null;
};

export type FinancialReportInput = {
  transactions: FinancialTransaction[];
  start: Date;
  end: Date;
  categories?: FinancialCategory[];
  subCategories?: FinancialSubCategory[];
};

export type Classification =
  | "revenue"
  | "returns"
  | "discounts"
  | "cogs"
  | "opex"
  | "other_income"
  | "other_expense"
  | "income_tax"
  | "interest"
  | "depreciation"
  | "amortization"
  | "asset"
  | "liability"
  | "equity"
  | "transfer"
  | "unclassified";

export type ClassifiedTransaction = FinancialTransaction & {
  classification: Classification;
  balanceClass: BalanceClass | null;
  cashFlowClass: "operating" | "investing" | "financing" | null;
  isTransfer: boolean;
  text: string;
};

export type PnLResult = {
  grossRevenue: number;
  returns: number;
  discounts: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number | null;
  operatingExpenses: number;
  operatingIncome: number;
  operatingMarginPct: number | null;
  otherIncome: number;
  otherExpenses: number;
  incomeBeforeTax: number;
  incomeTaxExpense: number;
  netIncome: number;
  netProfitMarginPct: number | null;
  interest: number;
  depreciation: number;
  amortization: number;
  ebitda: number;
};

export type BalanceSheetResult = {
  cash: number;
  accountsReceivable: number;
  inventory: number;
  prepaids: number;
  shortTermInvestments: number;
  otherCurrentAssets: number;
  currentAssets: number;
  grossFixedAssets: number;
  accumulatedDepreciation: number;
  netFixedAssets: number;
  otherAssets: number;
  totalAssets: number;
  accountsPayable: number;
  creditCards: number;
  accruedExpenses: number;
  taxesPayable: number;
  currentDebt: number;
  otherCurrentLiabilities: number;
  currentLiabilities: number;
  longTermLiabilities: number;
  totalLiabilities: number;
  ownerContributions: number;
  beginningRetainedEarnings: number;
  cumulativeNetIncome: number;
  ownerDraws: number;
  dividends: number;
  retainedEarnings: number;
  totalEquity: number;
  liabilitiesAndEquity: number;
};

export type CashFlowResult = {
  netIncome: number;
  depreciation: number;
  amortization: number;
  otherNonCashAdjustments: number;
  accountsReceivableChange: number;
  inventoryChange: number;
  prepaidsChange: number;
  accountsPayableChange: number;
  accruedLiabilitiesChange: number;
  deferredRevenueChange: number;
  otherOperatingActivity: number;
  operatingCashFlow: number;
  assetSaleProceeds: number;
  capitalExpenditures: number;
  investmentActivity: number;
  investingCashFlow: number;
  loanProceeds: number;
  ownerContributions: number;
  principalPayments: number;
  ownerDraws: number;
  dividends: number;
  financingCashFlow: number;
  netChangeInCash: number;
  beginningCash: number;
  endingCash: number;
};

export type RatioResult = {
  currentRatio: number | null;
  quickRatio: number | null;
  workingCapital: number;
  debtToEquity: number | null;
  debtRatioPct: number | null;
  roaPct: number | null;
  roePct: number | null;
  freeCashFlow: number;
};

export type ReconciliationResult = {
  key:
    | "gross_profit"
    | "operating_income"
    | "balance_sheet"
    | "cash_rollforward"
    | "cash_to_balance_sheet"
    | "net_income";
  label: string;
  expected: number;
  actual: number;
  difference: number;
  reconciled: boolean;
};

export type FinancialReportResult = {
  start: Date;
  end: Date;
  pnl: PnLResult;
  balanceSheet: BalanceSheetResult;
  cashFlow: CashFlowResult;
  ratios: RatioResult;
  reconciliations: ReconciliationResult[];
  classifiedTransactions: ClassifiedTransaction[];
  unclassifiedAmount: number;
  unclassifiedTransactionIds: number[];
};

type BalanceClass =
  | "cash"
  | "ar"
  | "inventory"
  | "prepaids"
  | "short_term_investments"
  | "other_current_assets"
  | "fixed_assets"
  | "accumulated_depreciation"
  | "other_assets"
  | "ap"
  | "credit_card"
  | "accrued_expenses"
  | "taxes_payable"
  | "current_debt"
  | "other_current_liabilities"
  | "long_term_liabilities"
  | "deferred_revenue"
  | "owner_contribution"
  | "owner_draw"
  | "dividend";

const EPSILON = 0.005;

const includesAny = (text: string, terms: string[]) =>
  terms.some((term) => text.includes(term));
const safeDivide = (numerator: number, denominator: number) =>
  Math.abs(denominator) <= EPSILON ? null : numerator / denominator;
const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

function transactionText(
  tx: FinancialTransaction,
  categories: FinancialCategory[],
  subCategories: FinancialSubCategory[],
) {
  const category =
    tx.category_name ??
    categories.find((item) => item.id === tx.category_id)?.name ??
    "";
  const categoryType =
    tx.category_type ??
    categories.find((item) => item.id === tx.category_id)?.type ??
    "";
  const subCategory =
    tx.sub_category_name ??
    subCategories.find((item) => item.id === tx.sub_category_id)?.name ??
    "";
  return `${category} ${categoryType} ${subCategory} ${tx.title ?? ""} ${tx.description ?? ""} ${tx.type ?? ""}`
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findBalanceClass(text: string): BalanceClass | null {
  const assetTag = text.match(/\[asset\s*:\s*([^\]]+)\]/i)?.[1]?.trim() ?? "";
  const liabilityTag =
    text.match(/\[(?:liability|liab)\s*:\s*([^\]]+)\]/i)?.[1]?.trim() ?? "";
  const tagged = `${assetTag} ${liabilityTag}`.toLowerCase();
  if (tagged.includes("credit card")) return "credit_card";
  if (
    includesAny(tagged, ["receivable", "accounts receivable"]) ||
    /\bar\b/.test(tagged)
  )
    return "ar";
  if (tagged.includes("inventory")) return "inventory";
  if (includesAny(tagged, ["prepaid", "prepayment"])) return "prepaids";
  if (includesAny(tagged, ["short-term investment", "short term investment"]))
    return "short_term_investments";
  if (includesAny(tagged, ["fixed", "equipment", "ppe", "property"]))
    return "fixed_assets";
  if (tagged.includes("accumulated depreciation"))
    return "accumulated_depreciation";
  if (includesAny(tagged, ["other current"])) return "other_current_assets";
  if (
    assetTag &&
    includesAny(tagged, ["cash", "bank", "checking", "savings", "current"])
  )
    return "cash";
  if (assetTag) return "other_assets";
  if (includesAny(tagged, ["tax", "taxes payable"])) return "taxes_payable";
  if (tagged.includes("deferred revenue")) return "deferred_revenue";
  if (tagged.includes("accrued")) return "accrued_expenses";
  if (
    includesAny(tagged, ["accounts payable", "payable"]) ||
    /\bap\b/.test(tagged)
  )
    return "ap";
  if (
    includesAny(tagged, ["current debt", "short-term debt", "short term debt"])
  )
    return "current_debt";
  if (includesAny(tagged, ["long-term", "long term", "mortgage", "loan"]))
    return "long_term_liabilities";
  if (liabilityTag) return "other_current_liabilities";

  if (
    includesAny(text, [
      "owner draw",
      "owner withdrawal",
      "[equity:draw]",
      "[equity:distribution]",
    ])
  )
    return "owner_draw";
  if (includesAny(text, ["dividend", "[equity:dividend]"])) return "dividend";
  if (
    includesAny(text, [
      "owner contribution",
      "owner investment",
      "capital contribution",
      "[equity]",
    ])
  )
    return "owner_contribution";
  if (includesAny(text, ["accounts receivable", "customer receivable"]))
    return "ar";
  if (text.includes("inventory")) return "inventory";
  if (text.includes("prepaid")) return "prepaids";
  if (
    includesAny(text, [
      "equipment purchase",
      "fixed asset",
      "property purchase",
      "machinery purchase",
    ])
  )
    return "fixed_assets";
  if (text.includes("accumulated depreciation"))
    return "accumulated_depreciation";
  if (includesAny(text, ["accounts payable", "vendor payable"])) return "ap";
  if (includesAny(text, ["credit card balance", "credit card purchase"]))
    return "credit_card";
  if (text.includes("accrued")) return "accrued_expenses";
  if (text.includes("taxes payable")) return "taxes_payable";
  if (
    includesAny(text, [
      "loan proceeds",
      "loan repayment",
      "principal repayment",
      "mortgage",
    ])
  )
    return "long_term_liabilities";
  if (text.includes("deferred revenue")) return "deferred_revenue";
  return null;
}

export function classifyTransaction(
  tx: FinancialTransaction,
  categories: FinancialCategory[] = [],
  subCategories: FinancialSubCategory[] = [],
): ClassifiedTransaction {
  const text = transactionText(tx, categories, subCategories);
  const isTransfer = includesAny(text, [
    "credit card payment",
    "card payment",
    "internal transfer",
    "account transfer",
    "bank transfer",
    "transfer to",
    "transfer from",
    "savings transfer",
    "autopay",
  ]);
  const balanceClass = findBalanceClass(text);
  const cfTag = text
    .match(/\[cf\s*:\s*(operating|investing|financing)\]/i)?.[1]
    ?.toLowerCase();
  let cashFlowClass = (cfTag as ClassifiedTransaction["cashFlowClass"]) ?? null;
  if (!cashFlowClass && balanceClass === "fixed_assets")
    cashFlowClass = "investing";
  if (
    !cashFlowClass &&
    includesAny(balanceClass ?? "", [
      "long_term_liabilities",
      "current_debt",
      "owner_contribution",
      "owner_draw",
      "dividend",
    ])
  ) {
    cashFlowClass = "financing";
  }

  let classification: Classification = "unclassified";
  if (isTransfer) classification = "transfer";
  else if (
    includesAny(text, [
      "[revenue:return",
      "[returns]",
      "sales return",
      "customer refund",
      "revenue return",
    ])
  )
    classification = "returns";
  else if (
    includesAny(text, ["[revenue:discount", "[discount]", "sales discount"])
  )
    classification = "discounts";
  else if (
    includesAny(text, [
      "[cogs]",
      "cost of goods",
      "cost of sales",
      "direct labor",
      "direct material",
    ])
  )
    classification = "cogs";
  else if (includesAny(text, ["[tax]", "[income tax]", "income tax expense"]))
    classification = "income_tax";
  else if (includesAny(text, ["[depreciation]", "depreciation expense"]))
    classification = "depreciation";
  else if (includesAny(text, ["[amortization]", "amortization expense"]))
    classification = "amortization";
  else if (includesAny(text, ["[interest]", "interest expense"]))
    classification = "interest";
  else if (
    includesAny(text, [
      "[other income]",
      "other income",
      "gain on sale",
      "interest income",
    ])
  )
    classification = "other_income";
  else if (
    includesAny(text, ["[other expense]", "other expense", "loss on sale"])
  )
    classification = "other_expense";
  else if (
    text.includes("[revenue]") ||
    (!balanceClass &&
      includesAny(text, [
        "revenue",
        "sales income",
        "service income",
        "freelance income",
        "income",
      ]))
  )
    classification = tx.amount < 0 ? "returns" : "revenue";
  else if (includesAny(text, ["[opex]", "operating expense", "expense"]))
    classification = "opex";
  else if (balanceClass?.startsWith("owner_") || balanceClass === "dividend")
    classification = "equity";
  else if (
    balanceClass &&
    [
      "ap",
      "credit_card",
      "accrued_expenses",
      "taxes_payable",
      "current_debt",
      "other_current_liabilities",
      "long_term_liabilities",
      "deferred_revenue",
    ].includes(balanceClass)
  )
    classification = "liability";
  else if (balanceClass) classification = "asset";
  else if (tx.amount > 0) classification = "revenue";
  else if (tx.amount < 0) classification = "opex";

  return {
    ...tx,
    classification,
    balanceClass,
    cashFlowClass,
    isTransfer,
    text,
  };
}

function isInRange(dateValue: string, start: Date, end: Date) {
  const date = new Date(dateValue);
  return !Number.isNaN(date.getTime()) && date >= start && date <= end;
}

function balanceChange(tx: ClassifiedTransaction): number {
  const magnitude = Math.abs(tx.amount);
  const decreases = includesAny(tx.text, [
    "decrease",
    "repayment",
    "principal payment",
    "paid down",
  ]);
  if (tx.balanceClass === "fixed_assets")
    return decreases || includesAny(tx.text, ["sale", "disposed"])
      ? -magnitude
      : magnitude;
  if (tx.balanceClass === "accumulated_depreciation") return magnitude;
  if (tx.balanceClass === "owner_draw" || tx.balanceClass === "dividend")
    return magnitude;
  if (tx.balanceClass === "owner_contribution") return magnitude;
  if (
    [
      "ap",
      "credit_card",
      "accrued_expenses",
      "taxes_payable",
      "current_debt",
      "long_term_liabilities",
      "deferred_revenue",
    ].includes(tx.balanceClass ?? "")
  ) {
    return decreases ? -magnitude : magnitude;
  }
  return tx.amount;
}

function isNonCash(tx: ClassifiedTransaction) {
  if (!tx.balanceClass) return false;
  if (
    includesAny(tx.text, [
      "cash",
      "paid",
      "payment",
      "received",
      "collected",
      "receipt",
      "proceeds",
      "repayment",
    ])
  )
    return false;
  if (
    [
      "ap",
      "credit_card",
      "accrued_expenses",
      "taxes_payable",
      "deferred_revenue",
    ].includes(tx.balanceClass) &&
    includesAny(tx.text, ["purchase", "accrued", "increase", "unpaid"])
  )
    return true;
  if (
    includesAny(tx.text, [
      "purchase",
    ])
  )
    return false;
  return [
    "ar",
    "inventory",
    "prepaids",
    "ap",
    "accrued_expenses",
    "taxes_payable",
    "deferred_revenue",
  ].includes(tx.balanceClass);
}

function cashEffect(tx: ClassifiedTransaction) {
  if (
    tx.isTransfer ||
    isNonCash(tx) ||
    tx.classification === "depreciation" ||
    tx.classification === "amortization"
  )
    return 0;
  if (
    tx.balanceClass === "ar" &&
    tx.amount < 0 &&
    includesAny(tx.text, ["decrease", "payment", "received", "receipt"])
  )
    return Math.abs(tx.amount);
  return tx.amount;
}

function pnlFor(transactions: ClassifiedTransaction[]): PnLResult {
  let grossRevenue = 0;
  let returns = 0;
  let discounts = 0;
  let cogs = 0;
  let operatingExpenses = 0;
  let otherIncome = 0;
  let otherExpenses = 0;
  let incomeTaxExpense = 0;
  let interest = 0;
  let depreciation = 0;
  let amortization = 0;

  for (const tx of transactions) {
    const amount = Math.abs(tx.amount);
    const expenseAmount = -tx.amount;
    if (tx.classification === "revenue") grossRevenue += amount;
    else if (tx.classification === "returns") returns += amount;
    else if (tx.classification === "discounts") discounts += amount;
    else if (tx.classification === "cogs") cogs += expenseAmount;
    else if (tx.classification === "opex") operatingExpenses += expenseAmount;
    else if (tx.classification === "other_income") otherIncome += amount;
    else if (tx.classification === "other_expense")
      otherExpenses += expenseAmount;
    else if (tx.classification === "income_tax")
      incomeTaxExpense += expenseAmount;
    else if (tx.classification === "interest") {
      interest += expenseAmount;
      otherExpenses += expenseAmount;
    } else if (tx.classification === "depreciation") {
      depreciation += expenseAmount;
      operatingExpenses += expenseAmount;
    } else if (tx.classification === "amortization") {
      amortization += expenseAmount;
      operatingExpenses += expenseAmount;
    }
  }

  const netRevenue = grossRevenue - returns - discounts;
  const grossProfit = netRevenue - cogs;
  const operatingIncome = grossProfit - operatingExpenses;
  const incomeBeforeTax = operatingIncome + otherIncome - otherExpenses;
  const netIncome = incomeBeforeTax - incomeTaxExpense;
  return {
    grossRevenue: roundMoney(grossRevenue),
    returns: roundMoney(returns),
    discounts: roundMoney(discounts),
    netRevenue: roundMoney(netRevenue),
    cogs: roundMoney(cogs),
    grossProfit: roundMoney(grossProfit),
    grossMarginPct: safeDivide(grossProfit * 100, netRevenue),
    operatingExpenses: roundMoney(operatingExpenses),
    operatingIncome: roundMoney(operatingIncome),
    operatingMarginPct: safeDivide(operatingIncome * 100, netRevenue),
    otherIncome: roundMoney(otherIncome),
    otherExpenses: roundMoney(otherExpenses),
    incomeBeforeTax: roundMoney(incomeBeforeTax),
    incomeTaxExpense: roundMoney(incomeTaxExpense),
    netIncome: roundMoney(netIncome),
    netProfitMarginPct: safeDivide(netIncome * 100, netRevenue),
    interest: roundMoney(interest),
    depreciation: roundMoney(depreciation),
    amortization: roundMoney(amortization),
    ebitda: roundMoney(
      netIncome + interest + incomeTaxExpense + depreciation + amortization,
    ),
  };
}

function cumulativeBalanceSheet(
  allThroughEnd: ClassifiedTransaction[],
  cumulativePnl: PnLResult,
): BalanceSheetResult {
  const sums: Partial<Record<BalanceClass, number>> = {};
  let cash = 0;
  for (const tx of allThroughEnd) {
    cash += cashEffect(tx);
    if (tx.balanceClass)
      sums[tx.balanceClass] = (sums[tx.balanceClass] ?? 0) + balanceChange(tx);
  }
  const get = (key: BalanceClass) => roundMoney(sums[key] ?? 0);
  const accountsReceivable = get("ar");
  const inventory = get("inventory");
  const prepaids = get("prepaids");
  const shortTermInvestments = get("short_term_investments");
  const otherCurrentAssets = get("other_current_assets");
  const currentAssets =
    cash +
    accountsReceivable +
    inventory +
    prepaids +
    shortTermInvestments +
    otherCurrentAssets;
  const grossFixedAssets = get("fixed_assets");
  const accumulatedDepreciation = Math.max(
    get("accumulated_depreciation"),
    cumulativePnl.depreciation,
  );
  const netFixedAssets = grossFixedAssets - accumulatedDepreciation;
  const otherAssets = get("other_assets");
  const accountsPayable = get("ap");
  const creditCards = get("credit_card");
  const accruedExpenses = get("accrued_expenses") + get("deferred_revenue");
  const taxesPayable = get("taxes_payable");
  const currentDebt = get("current_debt");
  const otherCurrentLiabilities = get("other_current_liabilities");
  const currentLiabilities =
    accountsPayable +
    creditCards +
    accruedExpenses +
    taxesPayable +
    currentDebt +
    otherCurrentLiabilities;
  const longTermLiabilities = get("long_term_liabilities");
  const ownerContributions = get("owner_contribution");
  const ownerDraws = get("owner_draw");
  const dividends = get("dividend");
  const beginningRetainedEarnings = 0;
  const cumulativeNetIncome = cumulativePnl.netIncome;
  const retainedEarnings =
    beginningRetainedEarnings + cumulativeNetIncome - dividends;
  const totalEquity = ownerContributions + retainedEarnings - ownerDraws;
  const totalAssets = currentAssets + netFixedAssets + otherAssets;
  const totalLiabilities = currentLiabilities + longTermLiabilities;

  return {
    cash: roundMoney(cash),
    accountsReceivable,
    inventory,
    prepaids,
    shortTermInvestments,
    otherCurrentAssets,
    currentAssets: roundMoney(currentAssets),
    grossFixedAssets,
    accumulatedDepreciation: roundMoney(accumulatedDepreciation),
    netFixedAssets: roundMoney(netFixedAssets),
    otherAssets,
    totalAssets: roundMoney(totalAssets),
    accountsPayable,
    creditCards,
    accruedExpenses,
    taxesPayable,
    currentDebt,
    otherCurrentLiabilities,
    currentLiabilities: roundMoney(currentLiabilities),
    longTermLiabilities,
    totalLiabilities: roundMoney(totalLiabilities),
    ownerContributions,
    beginningRetainedEarnings,
    cumulativeNetIncome,
    ownerDraws,
    dividends,
    retainedEarnings: roundMoney(retainedEarnings),
    totalEquity: roundMoney(totalEquity),
    liabilitiesAndEquity: roundMoney(totalLiabilities + totalEquity),
  };
}

function cashFlowFor(
  periodTransactions: ClassifiedTransaction[],
  pnl: PnLResult,
  beginningCash: number,
): CashFlowResult {
  let arChange = 0;
  let inventoryChange = 0;
  let prepaidsChange = 0;
  let apChange = 0;
  let accruedChange = 0;
  let deferredRevenueChange = 0;
  let assetSaleProceeds = 0;
  let capitalExpenditures = 0;
  let investmentActivity = 0;
  let loanProceeds = 0;
  let principalPayments = 0;
  let ownerContributions = 0;
  let ownerDraws = 0;
  let dividends = 0;
  let explicitOtherOperating = 0;

  for (const tx of periodTransactions) {
    const change = balanceChange(tx);
    const amount = Math.abs(tx.amount);
    if (tx.balanceClass === "ar") arChange += change;
    if (tx.balanceClass === "inventory") inventoryChange += change;
    if (tx.balanceClass === "prepaids") prepaidsChange += change;
    if (tx.balanceClass === "ap") apChange += change;
    if (tx.balanceClass === "accrued_expenses") accruedChange += change;
    if (tx.balanceClass === "deferred_revenue") deferredRevenueChange += change;
    if (tx.balanceClass === "fixed_assets") {
      if (change < 0 || includesAny(tx.text, ["sale", "proceeds"]))
        assetSaleProceeds += amount;
      else capitalExpenditures += amount;
    } else if (tx.cashFlowClass === "investing") {
      investmentActivity += tx.amount;
    }
    if (
      ["long_term_liabilities", "current_debt"].includes(tx.balanceClass ?? "")
    ) {
      if (change >= 0) loanProceeds += amount;
      else principalPayments += amount;
    }
    if (tx.balanceClass === "owner_contribution") ownerContributions += amount;
    if (tx.balanceClass === "owner_draw") ownerDraws += amount;
    if (tx.balanceClass === "dividend") dividends += amount;
    if (
      tx.cashFlowClass === "operating" &&
      !["revenue", "cogs", "opex", "depreciation", "amortization"].includes(
        tx.classification,
      )
    ) {
      explicitOtherOperating += tx.amount;
    }
  }

  const operatingBeforeOther =
    pnl.netIncome +
    pnl.depreciation +
    pnl.amortization -
    arChange -
    inventoryChange -
    prepaidsChange +
    apChange +
    accruedChange +
    deferredRevenueChange;
  const operatingCashFlow = operatingBeforeOther + explicitOtherOperating;
  const investingCashFlow =
    assetSaleProceeds - capitalExpenditures + investmentActivity;
  const financingCashFlow =
    loanProceeds +
    ownerContributions -
    principalPayments -
    ownerDraws -
    dividends;
  const netChangeInCash =
    operatingCashFlow + investingCashFlow + financingCashFlow;
  return {
    netIncome: pnl.netIncome,
    depreciation: pnl.depreciation,
    amortization: pnl.amortization,
    otherNonCashAdjustments: 0,
    accountsReceivableChange: roundMoney(arChange),
    inventoryChange: roundMoney(inventoryChange),
    prepaidsChange: roundMoney(prepaidsChange),
    accountsPayableChange: roundMoney(apChange),
    accruedLiabilitiesChange: roundMoney(accruedChange),
    deferredRevenueChange: roundMoney(deferredRevenueChange),
    otherOperatingActivity: roundMoney(explicitOtherOperating),
    operatingCashFlow: roundMoney(operatingCashFlow),
    assetSaleProceeds: roundMoney(assetSaleProceeds),
    capitalExpenditures: roundMoney(capitalExpenditures),
    investmentActivity: roundMoney(investmentActivity),
    investingCashFlow: roundMoney(investingCashFlow),
    loanProceeds: roundMoney(loanProceeds),
    ownerContributions: roundMoney(ownerContributions),
    principalPayments: roundMoney(principalPayments),
    ownerDraws: roundMoney(ownerDraws),
    dividends: roundMoney(dividends),
    financingCashFlow: roundMoney(financingCashFlow),
    netChangeInCash: roundMoney(netChangeInCash),
    beginningCash: roundMoney(beginningCash),
    endingCash: roundMoney(beginningCash + netChangeInCash),
  };
}

function reconciliation(
  key: ReconciliationResult["key"],
  label: string,
  expected: number,
  actual: number,
): ReconciliationResult {
  const difference = roundMoney(actual - expected);
  return {
    key,
    label,
    expected: roundMoney(expected),
    actual: roundMoney(actual),
    difference,
    reconciled: Math.abs(difference) <= EPSILON,
  };
}

export function calculateFinancialReport(
  input: FinancialReportInput,
): FinancialReportResult {
  const categories = input.categories ?? [];
  const subCategories = input.subCategories ?? [];
  const classified = input.transactions.map((tx) =>
    classifyTransaction(tx, categories, subCategories),
  );
  const throughEnd = classified.filter(
    (tx) => new Date(tx.date_time) <= input.end,
  );
  const periodTransactions = classified.filter((tx) =>
    isInRange(tx.date_time, input.start, input.end),
  );
  const beforeStart = classified.filter(
    (tx) => new Date(tx.date_time) < input.start,
  );
  const periodPnl = pnlFor(periodTransactions);
  const cumulativePnl = pnlFor(throughEnd);
  const balanceSheet = cumulativeBalanceSheet(throughEnd, cumulativePnl);
  const beginningCash = beforeStart.reduce(
    (sum, tx) => sum + cashEffect(tx),
    0,
  );
  const cashFlow = cashFlowFor(periodTransactions, periodPnl, beginningCash);
  const priorBalanceSheet = cumulativeBalanceSheet(
    beforeStart,
    pnlFor(beforeStart),
  );
  const averageAssets =
    (priorBalanceSheet.totalAssets + balanceSheet.totalAssets) / 2;
  const averageEquity =
    (priorBalanceSheet.totalEquity + balanceSheet.totalEquity) / 2;
  const ratios: RatioResult = {
    currentRatio: safeDivide(
      balanceSheet.currentAssets,
      balanceSheet.currentLiabilities,
    ),
    quickRatio: safeDivide(
      balanceSheet.cash +
        balanceSheet.accountsReceivable +
        balanceSheet.shortTermInvestments,
      balanceSheet.currentLiabilities,
    ),
    workingCapital: roundMoney(
      balanceSheet.currentAssets - balanceSheet.currentLiabilities,
    ),
    debtToEquity: safeDivide(
      balanceSheet.totalLiabilities,
      balanceSheet.totalEquity,
    ),
    debtRatioPct: safeDivide(
      balanceSheet.totalLiabilities * 100,
      balanceSheet.totalAssets,
    ),
    roaPct: safeDivide(periodPnl.netIncome * 100, averageAssets),
    roePct: safeDivide(periodPnl.netIncome * 100, averageEquity),
    freeCashFlow: roundMoney(
      cashFlow.operatingCashFlow - cashFlow.capitalExpenditures,
    ),
  };
  const reconciliations = [
    reconciliation(
      "gross_profit",
      "Gross Profit = Net Revenue - COGS",
      periodPnl.netRevenue - periodPnl.cogs,
      periodPnl.grossProfit,
    ),
    reconciliation(
      "operating_income",
      "Operating Income = Gross Profit - Operating Expenses",
      periodPnl.grossProfit - periodPnl.operatingExpenses,
      periodPnl.operatingIncome,
    ),
    reconciliation(
      "balance_sheet",
      "Assets = Liabilities + Equity",
      balanceSheet.totalAssets,
      balanceSheet.liabilitiesAndEquity,
    ),
    reconciliation(
      "cash_rollforward",
      "Ending Cash = Beginning Cash + Net Change in Cash",
      cashFlow.beginningCash + cashFlow.netChangeInCash,
      cashFlow.endingCash,
    ),
    reconciliation(
      "cash_to_balance_sheet",
      "Cash Flow ending cash = Balance Sheet cash",
      balanceSheet.cash,
      cashFlow.endingCash,
    ),
    reconciliation(
      "net_income",
      "P&L Net Income = Cash Flow Net Income",
      periodPnl.netIncome,
      cashFlow.netIncome,
    ),
  ];
  const unclassified = periodTransactions.filter(
    (tx) => tx.classification === "unclassified",
  );
  return {
    start: input.start,
    end: input.end,
    pnl: periodPnl,
    balanceSheet,
    cashFlow,
    ratios,
    reconciliations,
    classifiedTransactions: periodTransactions,
    unclassifiedAmount: roundMoney(
      unclassified.reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
    ),
    unclassifiedTransactionIds: unclassified.map((tx) => tx.id),
  };
}

export function compareValues(current: number, previous: number) {
  const amount = roundMoney(current - previous);
  return {
    amount,
    percent:
      Math.abs(previous) <= EPSILON
        ? null
        : (amount / Math.abs(previous)) * 100,
  };
}

export type ChartGranularity = "daily" | "weekly" | "monthly" | "quarterly";

export function chartGranularity(start: Date, end: Date): ChartGranularity {
  const inclusiveDays =
    Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (inclusiveDays <= 31) return "daily";
  if (inclusiveDays <= 186) return "weekly";
  if (inclusiveDays <= 729) return "monthly";
  return "quarterly";
}

function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - day);
  return result;
}

export function chartBucket(date: Date, granularity: ChartGranularity) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (granularity === "daily")
    return {
      key: `${year}-${month}-${day}`,
      label: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    };
  if (granularity === "weekly") {
    const week = startOfWeek(date);
    return {
      key: `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, "0")}-${String(week.getDate()).padStart(2, "0")}`,
      label: `Week of ${week.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}`,
    };
  }
  if (granularity === "monthly")
    return {
      key: `${year}-${month}`,
      label: date.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      }),
    };
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return { key: `${year}-Q${quarter}`, label: `Q${quarter} ${year}` };
}

export function dynamicAxisBounds(values: number[]) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [-1, 1] as [number, number];
  let min = Math.min(0, ...finite);
  let max = Math.max(0, ...finite);
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1);
    return [min - pad, max + pad] as [number, number];
  }
  const pad = (max - min) * 0.1;
  min -= pad;
  max += pad;
  return [Math.floor(min), Math.ceil(max)] as [number, number];
}
