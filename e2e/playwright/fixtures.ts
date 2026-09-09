import { expect, test as base } from "@playwright/test";

// Legacy synthetic fixtures declare an August 2026 reporting period. Keep the
// browser's reporting clock on that period so "this month" remains reproducible.
export const test = base.extend<{ syntheticReportingClock: void }>({
  syntheticReportingClock: [async ({ page }, use) => {
    await page.clock.setFixedTime(new Date("2026-08-31T12:00:00-07:00"));
    await use();
  }, { auto: true }],
});

export { expect };
