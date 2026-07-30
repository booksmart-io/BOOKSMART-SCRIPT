import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "outputs/survey-questions-current";

const sections = [
  ["Tax & Business Basics", [
    ["tax.filing_status", "How do you file your personal tax return?", "Single select", ["Single","Married Filing Jointly","Married Filing Separately","Head of Household","Qualifying Surviving Spouse"], "Always"],
    ["tax.primary_business_state", "What is your primary business state?", "Single select", ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"], "Always"],
    ["tax.residency_status", "What is your U.S. residency status?", "Single select", ["US Citizen","Resident Alien","Non-Resident Alien","Dual-Status Alien"], "Always"],
    ["tax.multi_state_activity", "Do you operate, work, or own property in multiple states?", "Yes/No", ["Yes","No"], "Always"],
    ["income.primary_types", "What income types apply to you?", "Multi-select", ["W2 Employee","1099 Contractor (Freelance)","Single-Member LLC","Multi-Member LLC","S-Corp Owner","C-Corp Owner","Trust/Estate"], "Always"],
    ["income.passive_types", "Do you have passive or investment income?", "Multi-select", ["Dividend Income","Capital Gains (Stocks)","Cryptocurrency/Defi","Rental Income","Royalties","Oil/Gas Rights"], "Always"],
  ]],
  ["Business Profile & Goals", [
    ["business.activity_model", "What does your business primarily sell?", "Single select", ["Products","Services","Both products and services","Other"], "Always"],
    ["tax.issues_1099s", "Do you make payments that may require Forms 1099?", "Single select", ["Yes","No","Not sure"], "Always"],
    ["accounting.software", "Which accounting software do you currently use?", "Single select", ["QuickBooks","Xero","Wave","FreshBooks","Zoho","Sage","Other","None"], "Always"],
    ["strategy.business_goals", "What are your main business goals right now?", "Multi-select", ["Improve bookkeeping and recordkeeping","Improve cash flow","Build a budget","Reduce taxes","Prepare for funding","Build business credit","Improve financial forecasting","Grow or expand the business"], "Always"],
    ["funding.interest", "Are you interested in capital for your business?", "Single select", ["Yes","No","Maybe / exploring options"], "Always"],
    ["funding.purposes", "What would you use the funding for?", "Multi-select", ["Working capital","Equipment","Vehicle","Commercial property","Expansion","Startup costs","Inventory","Refinance existing debt","Other"], "Funding interest is Yes or Maybe / exploring options"],
  ]],
  ["Team & Accounting", [
    ["team.structure", "Who helps run the business?", "Multi-select", ["Solo Operator","Hire 1099 Contractors","W2 Employees","Employ Spouse","Employ Children (under 18)","No Help"], "Always"],
    ["accounting.method", "What accounting method do you use?", "Single select", ["Cash Basis (Standard)","Accrual Basis","Not Sure"], "Always"],
  ]],
  ["Workspace & Property", [
    ["workspace.primary_work_location", "Where do you primarily work from?", "Single select", ["My Home","Commercial Office","Both (Home & Office)"], "Always"],
    ["workspace.home_office_type", "What type of workspace do you use?", "Single select", ["No Home Office","Dedicated Room (Exclusive Use)","Shared Space (Non-Exclusive)","Short-term/Coworking Space"], "Always"],
    ["workspace.home_status", "What is your home status?", "Single select", ["Own (Mortgage)","Own (Paid Off)","Rent","Live with Family"], "Home workspace is Dedicated Room or Shared Space"],
    ["workspace.tech_usage", "Which technology costs support your business?", "Multi-select", ["Personal Phone for Business","Home Internet for Business","Premium Software Subscriptions","Home Security (if home office)","High-End Hardware/Server"], "Always"],
    ["workspace.total_home_sqft", "What is the total square footage of your home?", "Number", ["Numeric entry (square feet; minimum 0)"], "Home workspace is Dedicated Room or Shared Space"],
    ["workspace.home_allocation_percent", "What percentage of your home is used regularly for business?", "Percentage slider", ["0%–100%"], "Home workspace is Dedicated Room or Shared Space"],
    ["property.interests", "Which property types apply to you?", "Multi-select", ["Primary Residence","Second Home/Vacation Home","Short-Term Rental (Airbnb/VRBO)","Long-Term Rental","Commercial Property","Raw Land"], "Always"],
    ["property.hosts_home_meetings", "Do you host business meetings or corporate minutes at home?", "Yes/No", ["Yes","No"], "Home workspace is Dedicated Room or Shared Space"],
    ["workspace.phone_business_use_percent", "What percentage of your phone service is used for business?", "Percentage slider", ["0%–100%"], "Technology costs includes Personal Phone for Business"],
    ["workspace.internet_business_use_percent", "What percentage of your internet service is used for business?", "Percentage slider", ["0%–100%"], "Technology costs includes Home Internet for Business"],
    ["workspace.balance_utility_percent", "What percentage of your household utilities support your business activities?", "Percentage slider", ["0%–100%"], "Home workspace is Dedicated Room or Shared Space"],
  ]],
  ["Vehicle", [
    ["vehicle.ownership", "How is your business vehicle owned or leased?", "Single select", ["Own Personally","Lease Personally","Company Owned","Company Leased","No Business Vehicle"], "Always"],
    ["vehicle.deduction_method", "How do you track vehicle deductions?", "Single select", ["Standard Mileage Rate","Actual Expenses (Gas, Repairs, Insurance)","Commuting Only (Non-Deductible)"], "A business vehicle is selected"],
    ["vehicle.over_6000_lbs", "Is the vehicle over 6,000 lbs?", "Yes/No", ["Yes","No"], "A business vehicle is selected"],
    ["vehicle.balance_business_use_percent", "How much of your vehicle use is for business?", "Percentage slider", ["0%–100%"], "A business vehicle is selected"],
  ]],
  ["Equipment & Assets", [
    ["equipment.ownership", "Do you own business equipment?", "Yes/No", ["Yes","No"], "Always"],
    ["equipment.spending_this_year", "How much did you spend on business equipment this year?", "Currency/number", ["Dollar amount (minimum 0)"], "Business equipment ownership is Yes"],
    ["equipment.current_value", "What is the estimated value of your equipment?", "Currency/number", ["Dollar amount (minimum 0)"], "Business equipment ownership is Yes"],
    ["assets.has_receivables", "Does anyone owe your business money?", "Yes/No", ["Yes","No"], "Always"],
    ["assets.has_inventory", "Do you keep inventory or products for sale?", "Yes/No", ["Yes","No"], "Always"],
  ]],
  ["Debts & Owner Equity", [
    ["liabilities.has_debt", "Does your business owe money to anyone?", "Yes/No", ["Yes","No"], "Always"],
    ["liabilities.selected", "Which business debts or liabilities do you have?", "Multi-select", ["Credit Cards","SBA Loans","Vehicle Loans","Equipment Loans","Taxes Owed","Payroll Liabilities","Other"], "Business owes money is Yes"],
    ["liabilities.balances", "Enter the current balances for the selected items.", "Currency/number per selected debt", ["Dollar amount for each selected debt type (minimum 0)"], "At least one debt type is selected"],
    ["equity.owner_contributed", "Have you put personal money into the business?", "Yes/No", ["Yes","No"], "Always"],
    ["equity.owner_contribution_details", "How much did you contribute and when?", "Currency and date", ["Contribution amount (minimum 0)","Most recent contribution date"], "Owner contributed personal money is Yes"],
    ["equity.owner_draws", "Have you taken money out of the business for personal use?", "Yes/No", ["Yes","No"], "Always"],
  ]],
  ["Tax Strategy Preferences", [
    ["health.insurance", "What health insurance do you use?", "Single select", ["Employer Provided","Marketplace (ACA) Plan","High Deductible Plan (HDHP)","Medicare","Private/Self-Funded"], "Always"],
    ["health.savings", "Do you use any health savings accounts?", "Multi-select", ["HSA Contributor","FSA Participant","HRA (Health Reimbursement)","None"], "Always"],
    ["family.education_support", "Any education or family support costs?", "Multi-select", ["Paying Student Loans","Child in Daycare","K-12 Private Tuition","College Tuition (Form 1098-T)","Supporting Elderly Parents"], "Always"],
    ["strategy.tax_goal", "What is your main tax goal?", "Single select", ["Immediate Cash Flow (Pay less now)","Long-term Wealth (Retirement focus)","Audit Protection (Play it safe)","Business Growth (Reinvestment focus)"], "Always"],
    ["strategy.retirement", "What retirement setup do you currently have?", "Multi-select", ["No Plan","Maxing out 401k","Backdoor Roth IRA","Solo 401k/SEP IRA","Pension/Defined Benefit"], "Always"],
    ["strategy.audit_appetite", "What is your audit-risk appetite?", "Single select", ["Conservative (Low Risk)","Moderate (Standard)","Aggressive (Maximized Savings)"], "Always"],
  ]],
];

const questions = [];
const choices = [];
let number = 1;
for (const [section, rows] of sections) {
  for (const [key, question, type, options, condition] of rows) {
    questions.push([number, section, question, type, options.join(" • "), condition, key]);
    options.forEach((option, i) => choices.push([number, section, question, i + 1, option, key]));
    number++;
  }
}

const workbook = Workbook.create();
const main = workbook.worksheets.add("Survey Questions");
const detail = workbook.worksheets.add("Answer Choices");
main.showGridLines = false;
detail.showGridLines = false;

main.getRange("A1:G1").merge();
main.getRange("A1").values = [["BookSmart Survey Questions & Answer Choices"]];
main.getRange("A2:G2").merge();
main.getRange("A2").values = [["Current Survey v2 • 46 registered questions • Conditional questions are identified below"]];
main.getRange("A4:G4").values = [["#","Section","Question","Answer Type","Answer Choices / Accepted Input","Display Condition","System Key"]];
main.getRange(`A5:G${questions.length + 4}`).values = questions;
main.tables.add(`A4:G${questions.length + 4}`, true, "SurveyQuestionsTable").style = "TableStyleMedium2";
main.freezePanes.freezeRows(4);
main.getRange("A1:G1").format = { fill: "#102A43", font: { bold: true, color: "#FFFFFF", size: 18 }, verticalAlignment: "center" };
main.getRange("A2:G2").format = { fill: "#D9EAF7", font: { color: "#334E68", italic: true }, verticalAlignment: "center" };
main.getRange("A4:G4").format = { fill: "#146C94", font: { bold: true, color: "#FFFFFF" }, wrapText: true, verticalAlignment: "center" };
main.getRange(`A5:G${questions.length + 4}`).format = { verticalAlignment: "top", wrapText: true, font: { size: 10 } };
main.getRange(`A5:A${questions.length + 4}`).format.horizontalAlignment = "center";
main.getRange(`A5:A${questions.length + 4}`).format.numberFormat = "0";
main.getRange("A:A").format.columnWidth = 5;
main.getRange("B:B").format.columnWidth = 24;
main.getRange("C:C").format.columnWidth = 43;
main.getRange("D:D").format.columnWidth = 20;
main.getRange("E:E").format.columnWidth = 48;
main.getRange("F:F").format.columnWidth = 39;
main.getRange("G:G").format.columnWidth = 34;
main.getRange("1:1").format.rowHeight = 32;
main.getRange("2:2").format.rowHeight = 24;
main.getRange("4:4").format.rowHeight = 30;
questions.forEach((row, index) => {
  const estimatedLines = Math.max(2, Math.ceil(String(row[4]).length / 58), Math.ceil(String(row[2]).length / 48), Math.ceil(String(row[5]).length / 44));
  main.getRange(`${index + 5}:${index + 5}`).format.rowHeight = Math.min(180, 18 + estimatedLines * 14);
});

detail.getRange("A1:F1").merge();
detail.getRange("A1").values = [["Normalized Answer Choices"]];
detail.getRange("A2:F2").merge();
detail.getRange("A2").values = [["One row per configured option or accepted input; useful for filtering, imports, and implementation review."]];
detail.getRange("A4:F4").values = [["Question #","Section","Question","Choice Order","Answer Choice / Input","System Key"]];
detail.getRange(`A5:F${choices.length + 4}`).values = choices;
detail.tables.add(`A4:F${choices.length + 4}`, true, "AnswerChoicesTable").style = "TableStyleMedium2";
detail.freezePanes.freezeRows(4);
detail.getRange("A1:F1").format = { fill: "#102A43", font: { bold: true, color: "#FFFFFF", size: 18 }, verticalAlignment: "center" };
detail.getRange("A2:F2").format = { fill: "#D9EAF7", font: { color: "#334E68", italic: true }, verticalAlignment: "center" };
detail.getRange("A4:F4").format = { fill: "#146C94", font: { bold: true, color: "#FFFFFF" }, wrapText: true, verticalAlignment: "center" };
detail.getRange(`A5:F${choices.length + 4}`).format = { verticalAlignment: "top", wrapText: true, font: { size: 10 } };
detail.getRange("A:A").format.columnWidth = 12;
detail.getRange("B:B").format.columnWidth = 24;
detail.getRange("C:C").format.columnWidth = 43;
detail.getRange("D:D").format.columnWidth = 13;
detail.getRange("E:E").format.columnWidth = 48;
detail.getRange("F:F").format.columnWidth = 34;
detail.getRange("1:1").format.rowHeight = 32;
detail.getRange("2:2").format.rowHeight = 24;
detail.getRange("4:4").format.rowHeight = 30;

await fs.mkdir(outputDir, { recursive: true });
const preview1 = await workbook.render({ sheetName: "Survey Questions", range: "A1:G18", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/survey-questions-preview.png`, new Uint8Array(await preview1.arrayBuffer()));
const preview2 = await workbook.render({ sheetName: "Answer Choices", range: "A1:F22", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/answer-choices-preview.png`, new Uint8Array(await preview2.arrayBuffer()));

console.log((await workbook.inspect({ kind: "table", range: "Survey Questions!A1:G12", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 7 })).ndjson);
console.log((await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 50 }, summary: "final formula error scan" })).ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/booksmart-survey-questions-and-answers.xlsx`);
console.log(`Wrote ${questions.length} questions and ${choices.length} normalized answer rows.`);
