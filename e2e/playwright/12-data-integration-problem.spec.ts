import { expect, test } from "./fixtures";
const configured = process.env.E2E_TARGET === "test" && Boolean(process.env.E2E_BASE_URL);
test.describe("12_DATA_INTEGRATION_PROBLEM", () => {
  test.skip(!configured, "Requires the isolated synthetic tenant and authenticated storage state.");
  test("surfaces stale, duplicate, and conflicting source evidence", async ({ page }) => {
    await page.addInitScript(() => { const userId = localStorage.getItem("booksmart_e2e_user_id"); if (userId) sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1"); });
    await page.goto("/user/insights");
    await expect(page.getByText("$15,000", { exact: true })).toBeVisible();
    await expect(page.getByText("$5,000", { exact: true })).toBeVisible();
    await expect(page.getByText("$10,000", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: /insight feed/i }).click();
    await expect(page.getByText("SignalCheck Contracting LLC needs attention", { exact: true })).toBeVisible();
    await expect(page.getByText("Invoice DIP-9001 has conflicting payment status", { exact: true })).toBeVisible();
    await expect(page.getByText(/QuickBooks shows \$5,000\.00 outstanding while Jobber shows \$0\.00/i)).toBeVisible();
    await expect(page.getByText(/cannot determine which source is current/i)).toBeVisible();
    const conflictCard = page.locator('[data-signal-key^="contractor:invoice-status-conflict:"]');
    await conflictCard.getByText("How BookSmart connected this", { exact: true }).click();
    const evidence = conflictCard.getByTestId("evidence-map");
    await expect(evidence.locator('[data-source="quickbooks"][data-state="conflicting"]')).toHaveCount(1);
    await expect(evidence.locator('[data-source="jobber"][data-state="conflicting"]')).toHaveCount(1);
    await expect(evidence.getByTestId("evidence-calculation")).toContainText("QuickBooks balance");
    await expect(evidence.getByTestId("evidence-calculation")).toContainText("Jobber balance");
    await expect(page.getByText("Possible duplicate expense: Building Supply — Receipt DUP-77 duplicate import", { exact: true })).toBeVisible();
    await expect(page.getByText("$2,000", { exact: true })).toBeVisible();
    await expect(page.getByText("Cash movement is negative", { exact: true })).toHaveCount(0);
  });
});
