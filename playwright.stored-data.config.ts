import { defineConfig } from "@playwright/test";
import security from "./playwright.security.config";

export default defineConfig(security, {
  testMatch: ["tenant-isolation.spec.ts", "stored-data.spec.ts"],
  outputDir: "./test-results/stored-data",
  reporter: [["list"], ["html", { outputFolder: "stored-data-report", open: "never" }]],
  use: {
    trace: "off",
    video: "off",
    screenshot: "off",
  },
});
