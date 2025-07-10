// List of US states for dropdown
const List<String> usStates = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
];

// Certification options
const List<String> cpaCertificationOptions = [
  'CPA',
  'EA',
  'CFP',
  'CMA',
  'CIA',
  'CGMA',
  'ChFC',
  'PFS',
  'Other',
];

// Specialty options
const List<String> cpaSpecialtyOptions = [
  'Individual Income Tax',
  'Small Business Tax',
  'Corporate Tax',
  'Partnership & LLC Tax',
  'Multi-State Taxation',
  'International Tax',
  'Trusts & Estates',
  'CFO Services',
  'Cryptocurrency Taxation',
  'Sales & Use Tax',
  'Payroll Tax Compliance',
  'Tax Strategy & Planning',
  'Bookkeeping & Accounting',
  'Audit & Assurance',
  'Financial Planning',
  'Estate Planning',
  'Business Valuation',
  'IRS Representation',
  'Non-Profit Accounting',
];

const List<String> cpaServices = [
  'Tax Preparation and Filing',
  'Tax Planning and Strategy',
  'Bookkeeping and Accounting',
  'CFO Services',
  'Financial Reporting/Valuation Services',
  'Corporate and Business Services',
  'Payroll and Employment Taxes',
  'Audit and Assurance',
  'International Tax Services',
  'Compliance and Regulatory',
  'Estate and Trust Tax Services',
  'Forensic Accounting',
  'Other',
];

const String personalTransactionType = "Personal";
const String businessTransactionType = "Business";

const List<String> transactionTypesList = [
  personalTransactionType,
  businessTransactionType,
];

// ─────────────────────────────────────────────
// US Tax Strategy Onboarding Constants
// ─────────────────────────────────────────────

// Screen 1 – Legal & Tax Identity
const List<String> filingStatusOptions = [
  'Single',
  'Married Filing Jointly',
  'Married Filing Separately',
  'Head of Household',
  'Qualifying Surviving Spouse',
];

const List<String> residencyStatusOptions = [
  'US Citizen',
  'Resident Alien',
  'Non-Resident Alien',
  'Dual-Status Alien',
];

// Screen 2 – Income Architecture
const List<String> incomeTypeOptions = [
  'W2 Employee',
  '1099 Contractor (Freelance)',
  'Single-Member LLC',
  'Multi-Member LLC',
  'S-Corp Owner',
  'C-Corp Owner',
  'Trust/Estate',
];

const List<String> passiveIncomeOptions = [
  'Dividend Income',
  'Capital Gains (Stocks)',
  'Cryptocurrency/Defi',
  'Rental Income',
  'Royalties',
  'Oil/Gas Rights',
];

// Screen 3 – Business Operations
const List<String> teamStructureOptions = [
  'Solo Operator',
  'Hire 1099 Contractors',
  'W2 Employees',
  'Employ Spouse',
  'Employ Children (under 18)',
  'No Help',
];

const List<String> accountingMethodOptions = [
  'Cash Basis (Standard)',
  'Accrual Basis',
  'Not Sure',
];

// Screen 4 – Vehicle & Logistics
const List<String> vehicleOwnershipOptions = [
  'Own Personally',
  'Lease Personally',
  'Company Owned',
  'Company Leased',
  'No Business Vehicle',
];

const List<String> vehicleUsageOptions = [
  'Standard Mileage Rate',
  'Actual Expenses (Gas, Repairs, Insurance)',
  'Commuting Only (Non-Deductible)',
];

// Screen 5 – Workspace & Infrastructure
const List<String> homeOfficeTypeOptions = [
  'No Home Office',
  'Dedicated Room (Exclusive Use)',
  'Shared Space (Non-Exclusive)',
  'Short-term/Coworking Space',
];

const List<String> homeStatusOptions = [
  'Own (Mortgage)',
  'Own (Paid Off)',
  'Rent',
  'Live with Family',
];

const List<String> techUsageOptions = [
  'Personal Phone for Business',
  'Home Internet for Business',
  'Premium Software Subscriptions',
  'Home Security (if home office)',
  'High-End Hardware/Server',
];

// Screen 6 – Real Estate Strategy
const List<String> realEstateInterestOptions = [
  'Primary Residence',
  'Second Home/Vacation Home',
  'Short-Term Rental (Airbnb/VRBO)',
  'Long-Term Rental',
  'Commercial Property',
  'Raw Land',
];

// Screen 7 – Household & Benefits
const List<String> healthInsuranceOptions = [
  'Employer Provided',
  'Marketplace (ACA) Plan',
  'High Deductible Plan (HDHP)',
  'Medicare',
  'Private/Self-Funded',
];

const List<String> healthSavingsOptions = [
  'HSA Contributor',
  'FSA Participant',
  'HRA (Health Reimbursement)',
  'None',
];

const List<String> familyEducationOptions = [
  'Paying Student Loans',
  'Child in Daycare',
  'K-12 Private Tuition',
  'College Tuition (Form 1098-T)',
  'Supporting Elderly Parents',
];

// Screen 8 – AI Strategy Alignment
const List<String> taxGoalOptions = [
  'Immediate Cash Flow (Pay less now)',
  'Long-term Wealth (Retirement focus)',
  'Audit Protection (Play it safe)',
  'Business Growth (Reinvestment focus)',
];

const List<String> retirementCurrentOptions = [
  'No Plan',
  'Maxing out 401k',
  'Backdoor Roth IRA',
  'Solo 401k/SEP IRA',
  'Pension/Defined Benefit',
];

const List<String> auditAppetiteOptions = [
  'Conservative (Low Risk)',
  'Moderate (Standard)',
  'Aggressive (Maximized Savings)',
];
