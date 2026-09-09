import { expect, test } from "./fixtures";

const configured = process.env.E2E_TARGET === "test" && Boolean(process.env.E2E_BASE_URL);

test.describe("07_OWNER_SPENDING_MESS", () => {
  test.skip(!configured, "Requires the isolated synthetic tenant and authenticated storage state.");
  test("reports cash pressure and review needs without accusations", async ({ page }) => {
    await page.addInitScript(() => { const userId = localStorage.getItem("booksmart_e2e_user_id"); if (userId) sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1"); });
    await page.goto("/user/insights");
    await expect(page.getByText("$12,000", { exact: true })).toBeVisible();
    await expect(page.getByText("$14,500", { exact: true })).toBeVisible();
    await expect(page.getByText("-$2,500", { exact: true })).toBeVisible();
    await expect(page.getByText(/Booksmart · Plaid/i)).toBeVisible();
    await page.getByRole("tab", { name: /insight feed/i }).click();
    await expect(page.getByText("Cash movement is negative", { exact: true })).toBeVisible();
    await expect(page.getByText("6 approved expenses are not assigned to a job", { exact: true })).toBeVisible();
    for (const accusation of [/fraud/i, /theft/i, /stolen/i, /embezz/i]) await expect(page.getByText(accusation)).toHaveCount(0);
    await expect(page.getByText(/completed job.*not been invoiced/i)).toHaveCount(0);
    await expect(page.getByText(/overdue receivables/i)).toHaveCount(0);
  });
});
