import { expect, test } from "./fixtures";

const configured = process.env.E2E_TARGET === "test" && Boolean(process.env.E2E_BASE_URL);

test.describe("03_MARGIN_LEAK_ELECTRIC", () => {
  test.skip(!configured, "Requires the isolated synthetic tenant and authenticated storage state.");

  test("connects approved job costs to specific low-margin jobs", async ({ page }) => {
    await page.addInitScript(() => {
      const userId = window.localStorage.getItem("booksmart_e2e_user_id");
      if (userId) window.sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1");
    });
    await page.goto("/user/insights");
    await expect(page.getByText("Revenue this month", { exact: true })).toBeVisible();
    await expect(page.getByText("$47,000", { exact: true })).toBeVisible();
    await expect(page.getByText("Expenses this month", { exact: true })).toBeVisible();
    await expect(page.getByText("$40,500", { exact: true })).toBeVisible();
    await expect(page.getByText("Net income this month", { exact: true })).toBeVisible();
    await expect(page.getByText("$6,500", { exact: true })).toBeVisible();
    await expect(page.getByText("6 confirmed", { exact: true })).toBeVisible();
    await expect(page.getByText(/Panel and feeder upgrade/i).first()).toBeVisible();
    await expect(page.getByText(/Commercial lighting retrofit/i).first()).toBeVisible();

    await page.getByRole("tab", { name: /insight feed/i }).click();
    await expect(page.getByText("Panel and feeder upgrade is approaching tracked break-even", { exact: true })).toBeVisible();
    await expect(page.getByText(/current tracked margin is 7\.5%/i)).toBeVisible();
    await expect(page.getByText("Commercial lighting retrofit has reached a tracked loss", { exact: true })).toBeVisible();
    await expect(page.getByText(/current tracked margin is -6\.7%/i)).toBeVisible();
    await expect(page.getByText("Expenses increased 170%", { exact: true })).toBeVisible();
    await expect(page.getByText("Revenue is trending up", { exact: true })).toBeVisible();
    await expect(page.getByText(/completed job.*not been invoiced/i)).toHaveCount(0);
    await expect(page.getByText("Cash movement is negative", { exact: true })).toHaveCount(0);
  });
});
