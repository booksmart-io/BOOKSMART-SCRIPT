import { defineConfig, devices } from "@playwright/test";
const scenarioProjects = [
  ["01-healthy-hvac", "01_HEALTHY_HVAC", "01-healthy-hvac.json"], ["02-busy-but-broke-plumbing", "02_BUSY_BUT_BROKE_PLUMBING", "02-busy-but-broke-plumbing.json"],
  ["03-margin-leak-electric", "03_MARGIN_LEAK_ELECTRIC", "03-margin-leak-electric.json"], ["04-unbilled-landscaping", "04_UNBILLED_LANDSCAPING", "scenario-04.json"],
  ["05-collections-problem-roofing", "05_COLLECTIONS_PROBLEM_ROOFING", "05-collections-problem-roofing.json"], ["06-home-depot-heavy-contractor", "06_HOME_DEPOT_HEAVY_CONTRACTOR", "06-home-depot-heavy-contractor.json"],
  ["07-owner-spending-mess", "07_OWNER_SPENDING_MESS", "07-owner-spending-mess.json"], ["08-no-quickbooks-contractor", "08_NO_QUICKBOOKS_CONTRACTOR", "08-no-quickbooks-contractor.json"],
  ["09-quickbooks-only-business", "09_QUICKBOOKS_ONLY_BUSINESS", "09-quickbooks-only-business.json"], ["10-seasonal-cash-pressure", "10_SEASONAL_CASH_PRESSURE", "10-seasonal-cash-pressure.json"],
  ["11-customer-concentration", "11_CUSTOMER_CONCENTRATION", "11-customer-concentration.json"], ["12-data-integration-problem", "12_DATA_INTEGRATION_PROBLEM", "12-data-integration-problem.json"],
  ["13-upcoming-cash-shortfall", "13_UPCOMING_CASH_SHORTFALL", "13-upcoming-cash-shortfall.json"],
] as const;

export default defineConfig({
  testDir: "./e2e/playwright",
  outputDir: "./test-results/playwright",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
    channel: process.env.E2E_BROWSER_CHANNEL,
    storageState: process.env.E2E_STORAGE_STATE,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "on",
  },
  expect: { timeout: 10_000 },
  timeout: 60_000,
  projects: process.env.E2E_STORAGE_STATE ? [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
    : scenarioProjects.map(([name, grep, state]) => ({ name, grep: new RegExp(grep), use: { ...devices["Desktop Chrome"], storageState: `e2e/.auth/${state}` } })),
});
