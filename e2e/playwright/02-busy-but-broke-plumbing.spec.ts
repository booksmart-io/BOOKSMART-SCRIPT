import { expect, test } from "./fixtures";

const configured = process.env.E2E_TARGET === "test" && Boolean(process.env.E2E_BASE_URL);

test.describe("02_BUSY_BUT_BROKE_PLUMBING", () => {
  test.skip(!configured, "Requires the isolated synthetic tenant and authenticated storage state.");

  test("finds collections and cash pressure despite growing revenue", async ({ page }) => {
    await page.addInitScript(() => {
      const userId = window.localStorage.getItem("booksmart_e2e_user_id");
      if (userId) window.sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1");
    });
    await page.goto("/user/insights");
    await expect(page.getByText("Revenue this month", { exact: true })).toBeVisible();
    await expect(page.getByText("$30,000", { exact: true })).toBeVisible();
    await expect(page.getByText("Expenses this month", { exact: true })).toBeVisible();
    await expect(page.getByText("$36,000", { exact: true })).toBeVisible();
    await expect(page.getByText("Net income this month", { exact: true })).toBeVisible();
    await expect(page.getByText("-$6,000", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /insight feed/i }).click();
    await expect(page.getByText("3 Jobber invoices are overdue", { exact: true })).toBeVisible();
    await expect(page.getByText("3 completed-job invoices have an outstanding balance", { exact: true })).toBeVisible();
    await expect(page.getByText("Cash movement is negative", { exact: true })).toBeVisible();
    await expect(page.getByText("Revenue is trending up", { exact: true })).toBeVisible();
    await expect(page.getByText("Expenses increased 80%", { exact: true })).toBeVisible();
    await expect(page.getByText("$25,000", { exact: true })).toHaveCount(2);
    await expect(page.getByText(/completed job.*not been invoiced/i)).toHaveCount(0);

    await page.getByRole("link", { name: "Review receivables", exact: true }).first().click();
    await page.getByRole("button", { name: "Invoices", exact: true }).click();
    for (const invoiceNumber of ["J-3001", "J-3002", "J-3003"]) {
      await expect(page.getByText(`#${invoiceNumber}`, { exact: true })).toBeVisible();
    }
  });
});
