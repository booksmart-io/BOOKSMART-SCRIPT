# 🇺🇸 US Tax Strategy Onboarding (Expert Version)

### Screen 1: The Foundation
*Title: Legal & Tax Identity*
* **Filing Status:** (Single Selection)
  * `List<String> filingStatus = ['Single', 'Married Filing Jointly', 'Married Filing Separately', 'Head of Household', 'Qualifying Surviving Spouse'];`
* **Primary State:** (Text Input)
* **Residency Status:** (Single Selection)
  * `List<String> residencyStatus = ['US Citizen', 'Resident Alien', 'Non-Resident Alien', 'Dual-Status Alien'];`
* **Multi-State Activity:** Did you work or own property in more than one state? (Yes/No)

---

### Screen 2: Income Architecture
*Title: Income Streams & Entity Structure*
* **Primary Income Type:** (Multiple Selection)
  * `List<String> incomeTypes = ['W2 Employee', '1099 Contractor (Freelance)', 'Single-Member LLC', 'Multi-Member LLC', 'S-Corp Owner', 'C-Corp Owner', 'Trust/Estate'];`
* **Industry/Niche:** (Text Input - e.g., Software, Construction, Real Estate)
* **Passive Income:** (Multiple Selection)
  * `List<String> passiveIncome = ['Dividend Income', 'Capital Gains (Stocks)', 'Cryptocurrency/Defi', 'Rental Income', 'Royalties', 'Oil/Gas Rights'];`

---

### Screen 3: Business Operations (The "Audit-Proof" Section)
*Title: Operational Footprint*
* **Team & Payroll:** (Multiple Selection)
  * `List<String> teamStructure = ['Solo Operator', 'Hire 1099 Contractors', 'W2 Employees', 'Employ Spouse', 'Employ Children (under 18)', 'No Help'];`
* **Accounting Method:** (Single Selection)
  * `List<String> accountingMethod = ['Cash Basis (Standard)', 'Accrual Basis', 'Not Sure'];`
* **Major Equipment:** Did you purchase machinery, heavy tech, or equipment over $2,500 this year? (Yes/No)
  * *AI Insight:* This triggers **Section 179** or **Bonus Depreciation** strategies.

---

### Screen 4: Lifestyle Deductions (Vehicle)
*Title: Vehicle & Logistics*
* **Vehicle Ownership:** (Single Selection)
  * `List<String> vehicleOwnership = ['Own Personally', 'Lease Personally', 'Company Owned', 'Company Leased', 'No Business Vehicle'];`
* **Primary Usage Method:** (Single Selection)
  * `List<String> vehicleUsage = ['Standard Mileage Rate', 'Actual Expenses (Gas, Repairs, Insurance)', 'Commuting Only (Non-Deductible)'];`
* **Vehicle Weight:** Is the vehicle over 6,000 lbs? (SUV/Truck) (Yes/No)
  * *AI Insight:* This triggers the "Hummer Tax Loophole" (Heavy vehicle depreciation).

---

### Screen 5: The "Home & Tech" Office
*Title: Workspace & Infrastructure*
* **Home Office Setup:** (Single Selection)
  * `List<String> homeOfficeType = ['No Home Office', 'Dedicated Room (Exclusive Use)', 'Shared Space (Non-Exclusive)', 'Short-term/Coworking Space'];`
* **Home Ownership Status:** (Single Selection)
  * `List<String> homeStatus = ['Own (Mortgage)', 'Own (Paid Off)', 'Rent', 'Live with Family'];`
* **Tech & Digital Usage:** (Multiple Selection)
  * `List<String> techUsage = ['Personal Phone for Business', 'Home Internet for Business', 'Premium Software Subscriptions', 'Home Security (if home office)', 'High-End Hardware/Server'];`

---

### Screen 6: Real Estate & The Augusta Rule
*Title: Real Estate Strategy*
* **Real Estate Interests:** (Multiple Selection)
  * `List<String> realEstateInterests = ['Primary Residence', 'Second Home/Vacation Home', 'Short-Term Rental (Airbnb/VRBO)', 'Long-Term Rental', 'Commercial Property', 'Raw Land'];`
* **Meeting Strategy:** Do you host business meetings or "Corporate Minutes" at your home? (Yes/No)
  * *AI Insight:* This identifies eligibility for the **Augusta Rule** (14 days of tax-free rental income).

---

### Screen 7: Family, Health & Education
*Title: Household & Benefits*
* **Health Insurance Type:** (Single Selection)
  * `List<String> healthInsurance = ['Employer Provided', 'Marketplace (ACA) Plan', 'High Deductible Plan (HDHP)', 'Medicare', 'Private/Self-Funded'];`
* **Health Savings:** (Multiple Selection)
  * `List<String> healthSavings = ['HSA Contributor', 'FSA Participant', 'HRA (Health Reimbursement)', 'None'];`
* **Education & Family:** (Multiple Selection)
  * `List<String> familyEducation = ['Paying Student Loans', 'Child in Daycare', 'K-12 Private Tuition', 'College Tuition (Form 1098-T)', 'Supporting Elderly Parents'];`

---

### Screen 8: Future Goals & Risk Profile
*Title: AI Strategy Alignment*
* **Primary Tax Goal:** (Single Selection)
  * `List<String> taxGoals = ['Immediate Cash Flow (Pay less now)', 'Long-term Wealth (Retirement focus)', 'Audit Protection (Play it safe)', 'Business Growth (Reinvestment focus)'];`
* **Retirement Readiness:** (Multiple Selection)
  * `List<String> retirementCurrent = ['No Plan', 'Maxing out 401k', 'Backdoor Roth IRA', 'Solo 401k/SEP IRA', 'Pension/Defined Benefit'];`
* **Audit Appetite:** (Single Selection)
  * `List<String> auditAppetite = ['Conservative (Low Risk)', 'Moderate (Standard)', 'Aggressive (Maximized Savings)'];`
