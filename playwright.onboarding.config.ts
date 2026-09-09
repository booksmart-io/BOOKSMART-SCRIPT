import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/onboarding",
  outputDir: "./test-results/onboarding",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "onboarding-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
    channel: process.env.E2E_BROWSER_CHANNEL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "on",
  },
  expect: { timeout: 10_000 },
  timeout: 60_000,
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
