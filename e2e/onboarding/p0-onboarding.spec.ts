import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test.describe("BookSmart P0 onboarding safety gate", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("ONB-P0-01 signed-out root reaches login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Welcome Back", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
  });

  for (const protectedPath of ["/user", "/cpa", "/admin"]) {
    test(`ONB-P0 protected route ${protectedPath} rejects signed-out access`, async ({ page }) => {
      await page.goto(protectedPath);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByText("Welcome Back", { exact: true })).toBeVisible();
    });
  }

  test("ONB-P0-05 signup presents required identity, password, role, and consent controls", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm Password")).toBeVisible();
    await expect(page.getByRole("switch", { name: "Sign up as CPA" })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByText(/authorize BookSmart to process my information/i)).toBeVisible();
  });

  test("ONB-P0-06 signup role choice and refusal are clear and reversible", async ({ page }) => {
    await page.goto("/sign-up");
    const roleSwitch = page.getByRole("switch", { name: "Sign up as CPA" });
    await roleSwitch.click();
    await expect(roleSwitch).toHaveAttribute("aria-checked", "true");
    await roleSwitch.click();
    await expect(roleSwitch).toHaveAttribute("aria-checked", "false");
    await page.getByRole("button", { name: "I Don't Agree" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("ONB-P0-07 signup blocks weak and mismatched passwords before any account request", async ({ page }) => {
    let signupRequests = 0;
    page.on("request", request => {
      if (/\/auth\/v1\/signup/.test(request.url())) signupRequests += 1;
    });
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill("safe-onboarding@example.test");
    await page.getByLabel("Password", { exact: true }).fill("weak");
    await page.getByLabel("Confirm Password").fill("weak");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await expect(page.getByText(/at least 8 characters with one letter and one number/i)).toBeVisible();
    expect(signupRequests).toBe(0);

    await page.getByLabel("Password", { exact: true }).fill("Strong123");
    await page.getByLabel("Confirm Password").fill("Different123");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await expect(page.getByText("Passwords do not match")).toBeVisible();
    expect(signupRequests).toBe(0);
  });

  test("ONB-P0-08 signup requires explicit legal consent before any account request", async ({ page }) => {
    let signupRequests = 0;
    page.on("request", request => {
      if (/\/auth\/v1\/signup/.test(request.url())) signupRequests += 1;
    });
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill("safe-onboarding@example.test");
    await page.getByLabel("Password", { exact: true }).fill("Strong123");
    await page.getByLabel("Confirm Password").fill("Strong123");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await expect(page.getByText(/agree to the Terms of Service and Privacy Policy/i)).toBeVisible();
    expect(signupRequests).toBe(0);
  });

  test("ONB-P0-09 OTP field accepts only six digits and cannot submit early", async ({ page }) => {
    await page.goto("/verify-email");
    const code = page.getByLabel("Verification code");
    await code.fill("12ab34");
    await expect(code).toHaveValue("1234");
    await code.fill("1234567");
    await expect(code).toHaveValue("123456");
    await code.fill("12345");
    await expect(page.getByRole("button", { name: "Verify Email" })).toBeDisabled();
  });

  test("ONB-P0-10 missing OTP signup context returns safely to signup", async ({ page }) => {
    await page.goto("/verify-email");
    await page.getByLabel("Verification code").fill("123456");
    await page.getByRole("button", { name: "Verify Email" }).click();
    await expect(page).toHaveURL(/\/sign-up$/);
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
  });

  test("ONB-P0-11 password reset validates locally without sending email", async ({ page }) => {
    let recoveryRequests = 0;
    page.on("request", request => {
      if (/\/auth\/v1\/recover/.test(request.url())) recoveryRequests += 1;
    });
    await page.goto("/forgot-reset");
    await expect(page.getByText("Reset Password", { exact: true })).toBeVisible();
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Send Reset Link" }).click();
    expect(await page.getByLabel("Email").evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(false);
    expect(recoveryRequests).toBe(0);
  });

  test("ONB-P0-12 signup supports keyboard navigation and visible focus", async ({ page }) => {
    await page.goto("/sign-up");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Email")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Show password" }).first()).toBeFocused();
  });

  test("ONB-P0-13 core auth screens fit a 320px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    for (const route of ["/login", "/sign-up", "/forgot-reset", "/verify-email"]) {
      await page.goto(route);
      await expectNoHorizontalOverflow(page);
    }
  });
});
