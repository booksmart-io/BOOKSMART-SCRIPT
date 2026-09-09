import { expect, test } from "./fixtures";
const configured = process.env.E2E_TARGET === "test" && Boolean(process.env.E2E_BASE_URL);
test.describe("11_CUSTOMER_CONCENTRATION", () => {
  test.skip(!configured, "Requires the isolated synthetic tenant and authenticated storage state.");
  test("calculates exact customer concentration with invoice evidence", async ({ page }) => {
    await page.addInitScript(() => { const userId = localStorage.getItem("booksmart_e2e_user_id"); if (userId) sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1"); });
    await page.goto("/user/insights");
    await expect(page.getByText("$100,000", { exact: true })).toBeVisible();
    await expect(page.getByText("$50,000", { exact: true })).toHaveCount(2);
    await page.getByRole("tab", { name: /insight feed/i }).click();
    await expect(page.getByText("One customer represents 48% of tracked invoiced activity", { exact: true })).toBeVisible();
    await expect(page.getByText("$48,000", { exact: true })).toBeVisible();
    await expect(page.getByText(/of \$100,000(?:\.00)? in explicit Jobber invoices/i)).toBeVisible();
    await expect(page.getByText(/not additional accounting revenue/i)).toBeVisible();
    for (const falseClaim of [/not been invoiced/i, /overdue receivables/i, /cash movement is negative/i]) await expect(page.getByText(falseClaim)).toHaveCount(0);
    await page.locator("details").evaluateAll(details => details.forEach(detail => { detail.open = true; }));
    await expect(page.locator("span:visible").filter({ hasText: /^Source records: 1$/ }).first()).toBeVisible();
  });
});
