import { expect, test } from "./fixtures";
const configured = process.env.E2E_TARGET === "test" && Boolean(process.env.E2E_BASE_URL);
test.describe("13_UPCOMING_CASH_SHORTFALL", () => {
  test.skip(!configured, "Requires the isolated synthetic tenant and authenticated storage state.");
  test("shows an evidence-backed upcoming cash shortfall", async ({ page }) => {
    await page.addInitScript(() => { const userId = window.localStorage.getItem("booksmart_e2e_user_id"); if (userId) window.sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1"); });
    await page.goto("/user/insights"); await expect(page.getByRole("heading", { name: "Insights", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: /insight feed/i }).click();
    await expect(page.getByText("Upcoming obligations exceed available cash", { exact: true })).toBeVisible();
    await expect(page.getByText(/\$25,500.*projected available cash is -\$5,500/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Review cash plan", exact: true })).toBeVisible();
    const card = page.locator('[data-signal-key="contractor:upcoming-cash-obligations"]');
    await card.getByText("How BookSmart connected this", { exact: true }).click();
    const evidence = card.getByTestId("evidence-map");
    await expect(evidence.locator('[data-source="plaid"][data-state="confirmed"]')).toHaveCount(1);
    await expect(evidence.locator('[data-source="gmail"]')).toHaveCount(2);
    await expect(evidence.getByTestId("evidence-calculation")).toContainText("Available cash: $20,000");
    await expect(evidence.getByTestId("evidence-calculation")).toContainText("Payroll: $18,000");
    await expect(evidence.getByTestId("evidence-calculation")).toContainText("Vendor bill: $7,500");
  });
});
