import { expect, test } from "./fixtures";

const configured = process.env.E2E_TARGET === "test"
  && Boolean(process.env.E2E_BASE_URL);

test.describe("04_UNBILLED_LANDSCAPING", () => {
  test.skip(!configured, "Requires an isolated E2E test deployment and authenticated storage state.");

  test("shows the supported unbilled-work conclusion and its Jobber evidence", async ({ page }) => {
    page.on("console", message => console.log(`[browser:${message.type()}] ${message.text()}`));
    page.on("pageerror", error => console.log(`[browser:pageerror] ${error.message}`));
    await page.addInitScript(() => {
      const userId = window.localStorage.getItem("booksmart_e2e_user_id");
      if (userId) window.sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1");
    });
    await test.step("open the customer insights experience", async () => {
      await page.goto("/user/insights");
      const upgradeDialog = page.getByRole("dialog", { name: /upgrade booksmart/i });
      if (await upgradeDialog.isVisible()) {
        await upgradeDialog.getByRole("button", { name: /skip for now/i }).click();
        await expect(upgradeDialog).toBeHidden();
      }
      await expect(page.getByRole("heading", { name: /insights/i })).toBeVisible();
      await page.getByRole("tab", { name: /insight feed/i }).click();
    });

    await test.step("verify the stable conclusion and amount", async () => {
      await expect(page.getByText(/5 completed jobs have not been invoiced/i)).toBeVisible();
      await expect(page.getByText(/\$18,450(?:\.00)? of explicit completed Jobber work/i)).toBeVisible();
      const card = page.locator('[data-signal-key="contractor:completed-work-unbilled"]');
      await card.getByText("How BookSmart connected this", { exact: true }).click();
      const map = card.getByTestId("evidence-map");
      await expect(map).toBeVisible();
      await expect(map.locator('[data-source="jobber"]')).toHaveCount(5);
      await expect(map.locator('[data-source="quickbooks"][data-state="missing"]')).toContainText("Matching accounting invoice");
      await expect(map.getByTestId("evidence-calculation")).toContainText("Add completed Jobber job values");
    });

    await test.step("open the source records", async () => {
      await page.getByRole("link", { name: /review completed jobs/i }).click();
      await expect(page).toHaveURL(/\/user\/jobber-records/);
      await page.getByRole("button", { name: "Jobs", exact: true }).click();
      for (const jobNumber of ["OAK-1042", "MAPLE-218", "RIVER-771", "OAK-1055", "MAPLE-231"]) {
        await expect(page.getByText(`#${jobNumber}`, { exact: true })).toBeVisible();
      }
    });
  });
});
