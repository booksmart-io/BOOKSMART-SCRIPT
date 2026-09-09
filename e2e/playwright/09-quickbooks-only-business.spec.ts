import { expect, test } from "./fixtures";

const configured = process.env.E2E_TARGET === "test" && Boolean(process.env.E2E_BASE_URL);
test.describe("09_QUICKBOOKS_ONLY_BUSINESS", () => {
  test.skip(!configured, "Requires the isolated synthetic tenant and authenticated storage state.");
  test("provides collections and trend intelligence without Jobber", async ({ page }) => {
    await page.addInitScript(() => { const userId = localStorage.getItem("booksmart_e2e_user_id"); if (userId) sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1"); });
    await page.goto("/user/insights");
    await expect(page.getByText("$28,000", { exact: true })).toBeVisible();
    await expect(page.getByText("$14,000", { exact: true })).toHaveCount(2);
    await page.getByRole("tab", { name: /insight feed/i }).click();
    await expect(page.getByText("1 QuickBooks invoice is overdue", { exact: true })).toBeVisible();
    await expect(page.getByText("$12,000", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("One customer represents 67% of outstanding receivables", { exact: true })).toBeVisible();
    await expect(page.getByText("Expenses increased 40%", { exact: true })).toBeVisible();
    await expect(page.getByText("Revenue is trending up", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review receivables", exact: true })).toHaveAttribute("href", "/user/money");
    for (const falseClaim of [/completed job/i, /not been invoiced/i, /job margin/i]) await expect(page.getByText(falseClaim)).toHaveCount(0);
  });
});
