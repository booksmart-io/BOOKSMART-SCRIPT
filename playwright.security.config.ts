import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/security",
  outputDir: "./test-results/security",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "security-report", open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
    ...devices["Desktop Chrome"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "on",
  },
  expect: { timeout: 10_000 },
  timeout: 60_000,
});
