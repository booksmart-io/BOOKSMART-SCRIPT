/// Keys for detailed manual P&L (suffix `__col` added per period column).
/// Only used by manual AI-failure flow — does not change other screens.
class ManualPnlKeys {
  ManualPnlKeys._();

  static const salesRevenue = 'salesRevenue';
  static const serviceRevenue = 'serviceRevenue';
  static const otherRevenue = 'otherRevenue';
  static const interestIncome = 'interestIncome';
  static const totalRevenue = 'totalRevenue';

  static const cogsDirect = 'cogsDirect';
  static const directLabor = 'directLabor';
  static const materials = 'materials';
  static const otherDirectCosts = 'otherDirectCosts';
  static const totalCogs = 'totalCogs';

  static const advertising = 'advertising';
  static const bankCharges = 'bankCharges';
  static const commissionsAndFees = 'commissionsAndFees';
  static const duesAndSubscriptions = 'duesAndSubscriptions';
  static const insurance = 'insurance';
  static const legalAndProfessionalFees = 'legalAndProfessionalFees';
  static const meals = 'meals';
  static const officeExpenses = 'officeExpenses';
  static const rentOrLease = 'rentOrLease';
  static const repairsAndMaintenance = 'repairsAndMaintenance';
  static const software = 'software';
  static const supplies = 'supplies';
  static const taxesAndLicenses = 'taxesAndLicenses';
  static const travel = 'travel';
  static const utilities = 'utilities';
  static const wages = 'wages';
  static const otherExpenses = 'otherExpenses';
  static const totalOperatingExpenses = 'totalOperatingExpenses';

  static const grossProfit = 'grossProfit';
  static const taxRatePercent = 'taxRatePercent';
  static const ebitda = 'ebitda';
  static const depreciation = 'depreciation';
  static const amortization = 'amortization';
  static const interestExpense = 'interestExpense';
  static const taxExpense = 'taxExpense';
  static const netIncome = 'netIncome';

  static const revenueInputs = <String>[
    salesRevenue,
    serviceRevenue,
    otherRevenue,
    interestIncome,
  ];

  static const cogsInputs = <String>[
    cogsDirect,
    directLabor,
    materials,
    otherDirectCosts,
  ];

  static const opexInputs = <String>[
    advertising,
    bankCharges,
    commissionsAndFees,
    duesAndSubscriptions,
    insurance,
    legalAndProfessionalFees,
    meals,
    officeExpenses,
    rentOrLease,
    repairsAndMaintenance,
    software,
    supplies,
    taxesAndLicenses,
    travel,
    utilities,
    wages,
    otherExpenses,
  ];

  /// All keys that get a TextEditingController per column.
  static List<String> get allValueKeys => [
    ...revenueInputs,
    totalRevenue,
    ...cogsInputs,
    totalCogs,
    ...opexInputs,
    totalOperatingExpenses,
    grossProfit,
    taxRatePercent,
    ebitda,
    depreciation,
    amortization,
    interestExpense,
    taxExpense,
    netIncome,
  ];

  /// Auto-calculated keys that may be overridden by the user.
  static const autoKeys = <String>{
    totalRevenue,
    totalCogs,
    grossProfit,
    totalOperatingExpenses,
    ebitda,
    taxExpense,
    netIncome,
  };
}

/// UI rows (label + field base key). Section rows use key null.
typedef ManualPnlRowSpec = ({String label, String? key, bool isPercent});

/// Build row specs for the detailed manual P&L form (single source for labels).
List<ManualPnlRowSpec> manualPnlRowSpecs() {
  return [
    (label: '— Revenue —', key: null, isPercent: false),
    (label: 'Sales Revenue', key: ManualPnlKeys.salesRevenue, isPercent: false),
    (label: 'Service Revenue', key: ManualPnlKeys.serviceRevenue, isPercent: false),
    (label: 'Other Revenue', key: ManualPnlKeys.otherRevenue, isPercent: false),
    (label: 'Interest Income', key: ManualPnlKeys.interestIncome, isPercent: false),
    (label: 'Total Revenue', key: ManualPnlKeys.totalRevenue, isPercent: false),
    (label: '— Cost of Goods Sold —', key: null, isPercent: false),
    (label: 'Cost of Goods Sold', key: ManualPnlKeys.cogsDirect, isPercent: false),
    (label: 'Direct Labor', key: ManualPnlKeys.directLabor, isPercent: false),
    (label: 'Materials', key: ManualPnlKeys.materials, isPercent: false),
    (label: 'Other Direct Costs', key: ManualPnlKeys.otherDirectCosts, isPercent: false),
    (label: 'Total COGS', key: ManualPnlKeys.totalCogs, isPercent: false),
    (label: '— Operating Expenses —', key: null, isPercent: false),
    (label: 'Advertising', key: ManualPnlKeys.advertising, isPercent: false),
    (label: 'Bank Charges', key: ManualPnlKeys.bankCharges, isPercent: false),
    (label: 'Commissions and Fees', key: ManualPnlKeys.commissionsAndFees, isPercent: false),
    (label: 'Dues and Subscriptions', key: ManualPnlKeys.duesAndSubscriptions, isPercent: false),
    (label: 'Insurance', key: ManualPnlKeys.insurance, isPercent: false),
    (label: 'Legal and Professional Fees', key: ManualPnlKeys.legalAndProfessionalFees, isPercent: false),
    (label: 'Meals', key: ManualPnlKeys.meals, isPercent: false),
    (label: 'Office Expenses', key: ManualPnlKeys.officeExpenses, isPercent: false),
    (label: 'Rent or Lease', key: ManualPnlKeys.rentOrLease, isPercent: false),
    (label: 'Repairs and Maintenance', key: ManualPnlKeys.repairsAndMaintenance, isPercent: false),
    (label: 'Software', key: ManualPnlKeys.software, isPercent: false),
    (label: 'Supplies', key: ManualPnlKeys.supplies, isPercent: false),
    (label: 'Taxes and Licenses', key: ManualPnlKeys.taxesAndLicenses, isPercent: false),
    (label: 'Travel', key: ManualPnlKeys.travel, isPercent: false),
    (label: 'Utilities', key: ManualPnlKeys.utilities, isPercent: false),
    (label: 'Wages', key: ManualPnlKeys.wages, isPercent: false),
    (label: 'Other Expenses', key: ManualPnlKeys.otherExpenses, isPercent: false),
    (label: 'Total Operating Expenses', key: ManualPnlKeys.totalOperatingExpenses, isPercent: false),
    (label: 'Gross Profit', key: ManualPnlKeys.grossProfit, isPercent: false),
    (label: 'Taxes (rate %)', key: ManualPnlKeys.taxRatePercent, isPercent: true),
    (label: 'EBITDA', key: ManualPnlKeys.ebitda, isPercent: false),
    (label: '— Depreciation & Amortization —', key: null, isPercent: false),
    (label: 'Depreciation', key: ManualPnlKeys.depreciation, isPercent: false),
    (label: 'Amortization', key: ManualPnlKeys.amortization, isPercent: false),
    (label: '— Interest & Taxes —', key: null, isPercent: false),
    (label: 'Interest Expense', key: ManualPnlKeys.interestExpense, isPercent: false),
    (label: 'Tax Expense', key: ManualPnlKeys.taxExpense, isPercent: false),
    (label: 'Net Income', key: ManualPnlKeys.netIncome, isPercent: false),
  ];
}
