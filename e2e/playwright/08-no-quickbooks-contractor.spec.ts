import { expect, test } from "./fixtures";

const configured = process.env.E2E_TARGET === "test" && Boolean(process.env.E2E_BASE_URL);

test.describe("08_NO_QUICKBOOKS_CONTRACTOR", () => {
  test.skip(!configured, "Requires the isolated synthetic tenant and authenticated storage state.");

  test("provides useful cash and unbilled-work intelligence without QuickBooks", async ({ page }) => {
    await page.addInitScript(() => {
      const userId = window.localStorage.getItem("booksmart_e2e_user_id");
      if (userId) window.sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1");
    });
    await page.goto("/user/insights");
    await expect(page.getByRole("heading", { name: "Insights", exact: true })).toBeVisible();
    await expect(page.getByText("Revenue this month", { exact: true })).toBeVisible();
    await expect(page.getByText("$16,500", { exact: true })).toBeVisible();
    await expect(page.getByText("Expenses this month", { exact: true })).toBeVisible();
    await expect(page.getByText("$17,000", { exact: true })).toBeVisible();
    await expect(page.getByText("Net income this month", { exact: true })).toBeVisible();
    await expect(page.getByText("-$500", { exact: true })).toBeVisible();
    await expect(page.getByText(/Plaid/i)).toBeVisible();

    await page.getByRole("tab", { name: /insight feed/i }).click();
    await expect(page.getByText("3 completed jobs have not been invoiced", { exact: true })).toBeVisible();
    await expect(page.getByText("$12,600", { exact: true })).toBeVisible();
    await expect(page.getByText("Cash movement is negative", { exact: true })).toBeVisible();
    await expect(page.getByText("-$500", { exact: true })).toBeVisible();
    await expect(page.getByText(/overdue receivables/i)).toHaveCount(0);

    await page.getByRole("link", { name: "Review completed jobs", exact: true }).click();
    await page.getByRole("button", { name: "Jobs", exact: true }).click();
    await expect(page.getByText("4 Jobs", { exact: true })).toBeVisible();
    for (const jobNumber of ["RIVERA-501", "SUMMIT-118", "OAK-77"]) {
      await expect(page.getByText(`#${jobNumber}`, { exact: true })).toBeVisible();
    }
  });
});
