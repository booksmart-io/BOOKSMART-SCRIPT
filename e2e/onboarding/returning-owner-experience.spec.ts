import { expect, test, type Page } from "@playwright/test";

const ownerState = "e2e/.auth/01-healthy-hvac.json";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test.describe("BookSmart returning-owner onboarding experience", () => {
  test.use({ storageState: ownerState });

  test("ONB-R1 completed owner reaches a useful dashboard without creating another business", async ({ page }) => {
    await page.goto("/user/dashboard");
    await expect(page.getByText("BookSmart dashboard", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Welcome back,/ })).toBeVisible();
    await expect(page.getByText("Business Power Score (BPS)", { exact: true })).toBeVisible();
    await expect(page.getByText(/Business setup:/)).toBeVisible();
    await expect(page.getByText("No organizations yet", { exact: true })).toHaveCount(0);
  });

  test("ONB-R2 saved personal and business profile sections reopen without an initial-setup dead end", async ({ page }) => {
    await page.goto("/user/profile");
    await expect(page.getByRole("heading", { name: "Set Up Your Profile" })).toBeVisible();
    await expect(page.getByText("Personal Information", { exact: true })).toBeVisible();
    await page.getByText("Business Information", { exact: true }).click();
    await expect(page.getByText("Company Identity", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Enter Details Manually", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next Step" })).toBeVisible();
  });

  test("ONB-R3 business survey is reachable for the current organization without saving changes", async ({ page }) => {
    await page.goto("/user/dashboard");
    const survey = page.getByRole("button", { name: /Business survey/i });
    await expect(survey).toBeEnabled();
    await survey.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/business survey/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("ONB-R4 document repository and upload entry point are available", async ({ page }) => {
    await page.goto("/user/tax");
    await expect(page.getByRole("heading", { name: "Document Repository" })).toBeVisible();
    const upload = page.getByRole("button", { name: "Upload Document", exact: true });
    await expect(upload).toBeEnabled();
    await upload.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("ONB-R5 dashboard, profile, organizations, and documents fit a 320px owner viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    for (const route of ["/user/dashboard", "/user/profile", "/user/organizations", "/user/tax"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});
