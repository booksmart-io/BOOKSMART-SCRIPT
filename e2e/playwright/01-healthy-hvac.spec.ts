import { expect, test } from "./fixtures";

const configured = process.env.E2E_TARGET === "test" && Boolean(process.env.E2E_BASE_URL);

test.describe("01_HEALTHY_HVAC", () => {
  test.skip(!configured, "Requires the isolated synthetic tenant and authenticated storage state.");

  test("does not manufacture crisis insights for a healthy operator", async ({ page }) => {
    await page.addInitScript(() => {
      const userId = window.localStorage.getItem("booksmart_e2e_user_id");
      if (userId) window.sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1");
    });
    await page.goto("/user/insights");
    await expect(page.getByRole("heading", { name: "Insights", exact: true })).toBeVisible();
    await expect(page.getByText("Revenue this month", { exact: true })).toBeVisible();
    await expect(page.getByText("$10,550", { exact: true })).toBeVisible();
    await expect(page.getByText("Expenses this month", { exact: true })).toBeVisible();
    await expect(page.getByText("$4,500", { exact: true })).toBeVisible();
    await expect(page.getByText("Net income this month", { exact: true })).toBeVisible();
    await expect(page.getByText("$6,050", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: /insight feed/i }).click();
    await expect(page.getByText("High priority", { exact: true })).toBeVisible();
    await expect(page.getByText(/6 large purchases need receipt review/i)).toBeVisible();
    await expect(page.getByText(/approved expenses? (?:is|are) not assigned to a job/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /expenses decreased/i })).toBeVisible();
    await expect(page.getByText(/net income improved/i)).toBeVisible();
    for (const unsupportedWarning of [/cash pressure/i, /overdue receivables/i, /not been invoiced/i, /tracked loss/i, /revenue has decreased/i]) {
      await expect(page.getByText(unsupportedWarning)).toHaveCount(0);
    }

    await page.goto("/user/jobber-records?object_type=jobs");
    await page.getByRole("button", { name: "Jobs", exact: true }).click();
    await expect(page.getByText("5 Jobs", { exact: true })).toBeVisible();
    for (const jobNumber of ["CARTER-310", "LAKEVIEW-88", "NORTHWIND-204", "CARTER-322", "LAKEVIEW-93"]) {
      await expect(page.getByText(`#${jobNumber}`, { exact: true })).toBeVisible();
    }
  });
});
