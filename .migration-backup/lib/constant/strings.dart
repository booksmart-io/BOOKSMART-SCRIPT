// strings.dart
import 'package:booksmart/constant/exports.dart';

class Strings {
  // App title
  static const String appTitle = 'BOOKSMART';

  // Dashboard screen
  static const String goodScore = 'GOOD';
  static const String date = 'Feb 25, 2024';
  static const String cashFlowTitle = "This Month's Cash Flow";
  static const String cashFlowAmount = '+\$12,540';
  static const String cashFlowDetail = 'Inflow: \$24,000   |   \$11,460';

  // Menu items
  static const String reviewFinancials = 'Review Financials';
  static const String fileTaxes = 'File Taxes';
  static const String creditMonitor = 'Credit Monitor';
  static const String loansAndInsurance =
      'Loans & Lines\nInsurance & Home Loans';

  // Quick insights
  static const String insight1 = 'You saved \$3,200 in deductions this month';
  static const String insight2 =
      'Estimated Tax Due: \$4,580 - Want to reduce it?';

  // strings.dart - Add these to your existing Strings class
  static const String profitLoss = 'Profit & Loss';
  static const String thisMonth = 'This Month';
  static const String exportCSV = 'Export CSV';
  static const String totalIncome = 'Total Income';
  static const String totalExpenses = 'Total Expenses';
  static const String netProfit = 'P&L Report';
  static const String income = 'Income';
  static const String expenses = 'Expenses';
  static const String sales = 'Sales';
  static const String rentalIncome = 'Rental Income';
  static const String mealsEntertainment = 'Meals & Entertainment';
  static const String travel = 'Travel';

  // Month abbreviations
  static const List<String> months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  // strings.dart - Add these to your existing Strings class
  static const String cashFlowStatement = 'Cash Flow Statement';
  static const String monthly = 'Monthly';
  static const String quarterly = 'Quarterly';
  static const String yearly = 'Yearly';
  static const String operating = 'Operating';
  static const String investing = 'Investing';
  static const String financing = 'Financing';
  static const String netIncome = 'Net Income';
  static const String adjustments = 'Adjustments';
  static const String changesInWorkingCapital = 'Changes in Working Capital';
  static const String operatingCashFlow = 'Operating Cash Flow';
  static const String fixedAssetPurchases = 'Fixed Asset Purchases';
  static const String otherInvestments = 'Other Investments';
  static const String investingCashFlow = 'Investing Cash Flow';
  static const String ownersContributions = 'Owner\'s Contributions';
  static const String loanPayments = 'Loan Payments';
}

// Dummy data
final deductions = [
  {
    "icon": Icons.restaurant,
    "title": "Meals",
    "amount": "\$1,200",
    "status": true,
    "items": [
      {"name": "Uber Eats", "amount": "\$450"},
      {"name": "Cafe Le Monde", "amount": "\$300", "date": "Mar 20, 2023"},
      {"name": "Pizza Palace", "amount": "\$250", "date": "Feb 5, 2023"},
      {"name": "Sandwich Spot", "amount": "\$200", "date": "Jan 10, 2023"},
    ],
  },
  {
    "icon": Icons.home,
    "title": "Home Office",
    "amount": "\$900",
    "status": false,
    "items": [
      {"name": "Laptop Desk", "amount": "\$500"},
      {"name": "Office Chair", "amount": "\$400"},
    ],
  },
  {
    "icon": Icons.directions_car,
    "title": "Auto & Travel",
    "amount": "\$1,580",
    "status": false,
    "items": [
      {"name": "Fuel", "amount": "\$600"},
      {"name": "Hotel Stay", "amount": "\$500"},
      {"name": "Flight", "amount": "\$480"},
    ],
  },
  {
    "icon": Icons.work,
    "title": "Miscellaneous",
    "amount": "\$600",
    "status": false,
    "items": [
      {"name": "Stationery", "amount": "\$200"},
      {"name": "Software", "amount": "\$400"},
    ],
  },
];

class DropdownData {
  // A. Filing Type Options
  static const List<Map<String, String>> filingTypeOptions = [
    {'value': 'Sole Proprietorship', 'label': 'Sole Proprietorship'},
    {'value': 'Partnership', 'label': 'Partnership'},
    {
      'value': 'Limited Liability Company (LLC)',
      'label': 'Limited Liability Company (LLC)',
    },
    {'value': 'S-Corporation', 'label': 'S-Corporation'},
    {'value': 'C-Corporation', 'label': 'C-Corporation'},
    {'value': 'Nonprofit', 'label': 'Nonprofit'},
  ];

  // B. Industry/Work Type Options
  static const List<Map<String, String>> industryOptions = [
    {'value': 'Agency or Sales House', 'label': 'Agency or Sales House'},
    {'value': 'Agriculture', 'label': 'Agriculture'},
    {'value': 'Art and Design', 'label': 'Art and Design'},
    {'value': 'Automotive', 'label': 'Automotive'},
    {'value': 'Construction', 'label': 'Construction'},
    {'value': 'Consulting', 'label': 'Consulting'},
    {'value': 'Consumer Packaged Goods', 'label': 'Consumer Packaged Goods'},
    {'value': 'Education', 'label': 'Education'},
    {'value': 'Engineering', 'label': 'Engineering'},
    {'value': 'Entertainment', 'label': 'Entertainment'},
    {'value': 'Financial Services', 'label': 'Financial Services'},
    {
      'value': 'Food Services (Restaurants/Fast Food)',
      'label': 'Food Services (Restaurants/Fast Food)',
    },
    {'value': 'Gaming', 'label': 'Gaming'},
    {'value': 'Gigs', 'label': 'Gigs'},
    {'value': 'Government', 'label': 'Government'},
    {'value': 'Health Care', 'label': 'Health Care'},
    {'value': 'Interior Design', 'label': 'Interior Design'},
    {'value': 'Internal', 'label': 'Internal'},
    {'value': 'Legal', 'label': 'Legal'},
    {'value': 'Manufacturing', 'label': 'Manufacturing'},
    {'value': 'Marketing', 'label': 'Marketing'},
    {'value': 'Mining and Logistics', 'label': 'Mining and Logistics'},
    {'value': 'Non-Profit', 'label': 'Non-Profit'},
    {'value': 'Publishing and Web Media', 'label': 'Publishing and Web Media'},
    {'value': 'Real Estate', 'label': 'Real Estate'},
    {
      'value': 'Retail (E-Commerce and Offline)',
      'label': 'Retail (E-Commerce and Offline)',
    },
    {'value': 'Rideshare', 'label': 'Rideshare'},
    {'value': 'Services', 'label': 'Services'},
    {'value': 'Technology', 'label': 'Technology'},
    {'value': 'Telecommunications', 'label': 'Telecommunications'},
    {'value': 'Travel/Hospitality', 'label': 'Travel/Hospitality'},
    {
      'value': 'Venture Capital/Private Equity',
      'label': 'Venture Capital/Private Equity',
    },
    {'value': 'Web Designing', 'label': 'Web Designing'},
    {'value': 'Web Development', 'label': 'Web Development'},
    {'value': 'Writers', 'label': 'Writers'},
  ];

  // C. State of Residence Options
  static const List<Map<String, String>> stateOptions = [
    // States
    {'value': 'AL', 'label': 'Alabama (AL)'},
    {'value': 'AK', 'label': 'Alaska (AK)'},
    {'value': 'AZ', 'label': 'Arizona (AZ)'},
    {'value': 'AR', 'label': 'Arkansas (AR)'},
    {'value': 'CA', 'label': 'California (CA)'},
    {'value': 'CO', 'label': 'Colorado (CO)'},
    {'value': 'CT', 'label': 'Connecticut (CT)'},
    {'value': 'DE', 'label': 'Delaware (DE)'},
    {'value': 'DC', 'label': 'District of Columbia (DC)'},
    {'value': 'FL', 'label': 'Florida (FL)'},
    {'value': 'GA', 'label': 'Georgia (GA)'},
    {'value': 'HI', 'label': 'Hawaii (HI)'},
    {'value': 'ID', 'label': 'Idaho (ID)'},
    {'value': 'IL', 'label': 'Illinois (IL)'},
    {'value': 'IN', 'label': 'Indiana (IN)'},
    {'value': 'IA', 'label': 'Iowa (IA)'},
    {'value': 'KS', 'label': 'Kansas (KS)'},
    {'value': 'KY', 'label': 'Kentucky (KY)'},
    {'value': 'LA', 'label': 'Louisiana (LA)'},
    {'value': 'ME', 'label': 'Maine (ME)'},
    {'value': 'MD', 'label': 'Maryland (MD)'},
    {'value': 'MA', 'label': 'Massachusetts (MA)'},
    {'value': 'MI', 'label': 'Michigan (MI)'},
    {'value': 'MN', 'label': 'Minnesota (MN)'},
    {'value': 'MS', 'label': 'Mississippi (MS)'},
    {'value': 'MO', 'label': 'Missouri (MO)'},
    {'value': 'MT', 'label': 'Montana (MT)'},
    {'value': 'NE', 'label': 'Nebraska (NE)'},
    {'value': 'NV', 'label': 'Nevada (NV)'},
    {'value': 'NH', 'label': 'New Hampshire (NH)'},
    {'value': 'NJ', 'label': 'New Jersey (NJ)'},
    {'value': 'NM', 'label': 'New Mexico (NM)'},
    {'value': 'NY', 'label': 'New York (NY)'},
    {'value': 'NC', 'label': 'North Carolina (NC)'},
    {'value': 'ND', 'label': 'North Dakota (ND)'},
    {'value': 'OH', 'label': 'Ohio (OH)'},
    {'value': 'OK', 'label': 'Oklahoma (OK)'},
    {'value': 'OR', 'label': 'Oregon (OR)'},
    {'value': 'PA', 'label': 'Pennsylvania (PA)'},
    {'value': 'RI', 'label': 'Rhode Island (RI)'},
    {'value': 'SC', 'label': 'South Carolina (SC)'},
    {'value': 'SD', 'label': 'South Dakota (SD)'},
    {'value': 'TN', 'label': 'Tennessee (TN)'},
    {'value': 'TX', 'label': 'Texas (TX)'},
    {'value': 'UT', 'label': 'Utah (UT)'},
    {'value': 'VT', 'label': 'Vermont (VT)'},
    {'value': 'VA', 'label': 'Virginia (VA)'},
    {'value': 'WA', 'label': 'Washington (WA)'},
    {'value': 'WV', 'label': 'West Virginia (WV)'},
    {'value': 'WI', 'label': 'Wisconsin (WI)'},
    {'value': 'WY', 'label': 'Wyoming (WY)'},
    // Territories
    {'value': 'AS', 'label': 'American Samoa (AS)'},
    {'value': 'GU', 'label': 'Guam (GU)'},
    {'value': 'MP', 'label': 'Northern Mariana Islands (MP)'},
    {'value': 'PR', 'label': 'Puerto Rico (PR)'},
    {'value': 'VI', 'label': 'Virgin Islands (VI)'},
  ];

  // D. Income Range Options
  static const List<Map<String, String>> incomeRangeOptions = [
    {'value': '\$0 - \$25K', 'label': '\$0 - \$25K'},
    {'value': '\$25K - \$100K', 'label': '\$25K - \$100K'},
    {'value': '\$100K - \$250K', 'label': '\$100K - \$250K'},
    {'value': '\$250K - \$450K', 'label': '\$250K - \$450K'},
    {'value': '\$450K - \$750K', 'label': '\$450K - \$750K'},
    {'value': 'Over \$750K', 'label': 'Over \$750K'},
  ];
}

class CategoryData {
  static final List<Map<String, dynamic>> categories = [
    {
      'name': 'Expense',
      'subcategories': [
        'Advertising',
        'Bad Debts',
        'Bank Charges',
        'Commissions & Fees',
        'Cost of Labor - COS',
        'Disposal Fees',
        'Dues & Subscriptions',
        'Freight & Delivery',
        'Legal & Professional Fees',
        'Meals and Entertainment',
        'Miscellaneous',
        'Office Expenses',
        'Promotional',
        'Rent or Lease',
        'Repair & Maintenance',
        'Shipping & Delivery Expense',
        'Stationery & Printing',
        'Subcontractors',
        'Supplies',
        'Taxes & Licenses',
        'Tools',
        'Travel',
        'Travel Meals',
        'Utilities',
      ],
    },
    {
      'name': 'Other Expense',
      'subcategories': ['Penalties & Settlements'],
    },
    {
      'name': 'Income',
      'subcategories': [
        'Billable Expense Income',
        'Discounts',
        'Gross Receipts',
        'Interest Earned',
        'Refunds-Allowances',
        'Sales',
        'Shipping & Delivery Income',
        'Uncategorized Income',
      ],
    },
    {
      'name': 'Cost of Goods Sold (COS)',
      'subcategories': [
        'Cost of Labor - COS',
        'Freight & Delivery - COS',
        'Other Costs - COS',
        'Purchases - COS',
        'Subcontractors - COS',
        'Supplies & Materials - COGS',
      ],
    },
    {
      'name': 'Other Current Asset',
      'subcategories': [
        'Prepaid Expenses',
        'Uncategorized Asset',
        'Undeposited Funds',
      ],
    },
    {
      'name': 'Equity',
      'subcategories': ['Retained Earnings'],
    },
  ];

  static List<String> getAllCategories() {
    return categories.map((cat) => cat['name'] as String).toList();
  }

  static List<String> getSubcategories(String category) {
    final categoryData = categories.firstWhere(
      (cat) => cat['name'] == category,
      orElse: () => {'subcategories': []},
    );
    return List<String>.from(categoryData['subcategories'] ?? []);
  }

  static List<String> getAllSubcategories() {
    List<String> allSubcategories = [];
    for (var category in categories) {
      allSubcategories.addAll(category['subcategories'] as List<String>);
    }
    return allSubcategories;
  }
}
