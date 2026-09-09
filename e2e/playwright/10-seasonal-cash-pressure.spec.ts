import { expect, test } from "./fixtures";
const configured = process.env.E2E_TARGET === "test" && Boolean(process.env.E2E_BASE_URL);
test.describe("10_SEASONAL_CASH_PRESSURE", () => {
  test.skip(!configured, "Requires the isolated synthetic tenant and authenticated storage state.");
  test("detects a seasonal revenue decline and current cash shortfall", async ({ page }) => {
    await page.addInitScript(() => { const userId = localStorage.getItem("booksmart_e2e_user_id"); if (userId) sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1"); });
    await page.goto("/user/insights");
    await expect(page.getByText("$25,000", { exact: true })).toBeVisible();
    await expect(page.getByText("$38,000", { exact: true })).toBeVisible();
    await expect(page.getByText("-$13,000", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: /insight feed/i }).click();
    await expect(page.getByText("Revenue has decreased", { exact: true })).toBeVisible();
    await expect(page.getByText(/recognized revenue is 58\.3% below/i)).toBeVisible();
    await expect(page.getByText("Cash movement is negative", { exact: true })).toBeVisible();
    await expect(page.getByText("Net income declined", { exact: true })).toBeVisible();
    for (const falseClaim of [/not been invoiced/i, /overdue receivables/i, /outstanding balance/i]) await expect(page.getByText(falseClaim)).toHaveCount(0);
    await page.goto("/user/jobber-records?object_type=jobs");
    await page.getByRole("button", { name: "Jobs", exact: true }).click();
    await expect(page.getByText("6 Jobs", { exact: true })).toBeVisible();
  });
});
