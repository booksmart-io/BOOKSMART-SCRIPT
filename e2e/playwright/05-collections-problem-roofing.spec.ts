import { expect, test } from "./fixtures";

const configured = process.env.E2E_TARGET === "test" && Boolean(process.env.E2E_BASE_URL);

test.describe("05_COLLECTIONS_PROBLEM_ROOFING", () => {
  test.skip(!configured, "Requires the isolated synthetic tenant and authenticated storage state.");

  test("shows exact QuickBooks receivables and aging without treating invoices as cash", async ({ page }) => {
    await page.addInitScript(() => {
      const userId = window.localStorage.getItem("booksmart_e2e_user_id");
      if (userId) window.sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1");
    });
    await page.goto("/user/insights");
    await expect(page.getByText("$28,000", { exact: true })).toBeVisible();
    await expect(page.getByText("$17,000", { exact: true })).toBeVisible();
    await expect(page.getByText("$11,000", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /insight feed/i }).click();
    await expect(page.getByText("3 QuickBooks invoices are overdue", { exact: true })).toBeVisible();
    await expect(page.getByText("$65,000 is over 30 days past due", { exact: true })).toBeVisible();
    await expect(page.getByText(/31–60 days: \$18,000 · 61–90 days: \$22,000 · Over 90 days: \$25,000/)).toBeVisible();
    await expect(page.getByText("$65,000", { exact: true })).toHaveCount(2);
    await expect(page.getByText(/not added to accounting revenue/i)).toBeVisible();
    await expect(page.getByText(/completed job.*not been invoiced/i)).toHaveCount(0);
    await expect(page.getByText("Cash movement is negative", { exact: true })).toHaveCount(0);
    await page.locator("details").evaluateAll(details => details.forEach(detail => { detail.open = true; }));
    await expect(page.locator("span:visible").filter({ hasText: /^Source records: 3$/ }).first()).toBeVisible();
  });
});
