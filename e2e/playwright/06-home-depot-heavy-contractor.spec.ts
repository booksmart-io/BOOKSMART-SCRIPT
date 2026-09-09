import { expect, test } from "./fixtures";

const configured = process.env.E2E_TARGET === "test" && Boolean(process.env.E2E_BASE_URL);

test.describe("06_HOME_DEPOT_HEAVY_CONTRACTOR", () => {
  test.skip(!configured, "Requires the isolated synthetic tenant and authenticated storage state.");

  test("matches receipt evidence and isolates the true duplicate", async ({ page }) => {
    await page.addInitScript(() => {
      const userId = window.localStorage.getItem("booksmart_e2e_user_id");
      if (userId) window.sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1");
    });
    await page.goto("/user/insights");
    await expect(page.getByText("$30,000", { exact: true })).toBeVisible();
    await expect(page.getByText("$5,670", { exact: true })).toBeVisible();
    await expect(page.getByText("$24,330", { exact: true })).toBeVisible();
    await expect(page.getByText("3 confirmed", { exact: true })).toBeVisible();
    for (const job of [/Kitchen renovation/i, /Office repairs/i, /Bathroom renovation/i]) {
      await expect(page.getByText(job).first()).toBeVisible();
    }

    await page.getByRole("tab", { name: /insight feed/i }).click();
    await expect(page.getByText("Possible duplicate expense: The Home Depot — Receipt HD1004 duplicate import", { exact: true })).toBeVisible();
    await expect(page.getByText("$775", { exact: true })).toBeVisible();
    await expect(page.getByText("3 approved expenses are not assigned to a job", { exact: true })).toBeVisible();
    await expect(page.getByText(/possible duplicate expense/i)).toHaveCount(1);
    await expect(page.getByText(/HD1003.*duplicate/i)).toHaveCount(0);
    await expect(page.getByText(/completed job.*not been invoiced/i)).toHaveCount(0);
  });
});
