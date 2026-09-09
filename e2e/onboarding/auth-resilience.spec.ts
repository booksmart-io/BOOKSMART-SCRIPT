import { expect, test, type Page } from "@playwright/test";

const testEmail = "resilience-onboarding@booksmart-e2e.example.test";

async function fillSignup(page: Page) {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(testEmail);
  await page.getByLabel("Password", { exact: true }).fill("Resilient123");
  await page.getByLabel("Confirm Password").fill("Resilient123");
  await page.getByRole("checkbox").check();
}

const pendingUser = {
  id: "00000000-0000-4000-8000-000000000004",
  email: testEmail,
  identities: [{ id: "identity-resilience", provider: "email" }],
  user_metadata: { role: "user" },
};

test.describe("BookSmart onboarding authentication resilience", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("ONB-E1 signup rate limit is visible and never reports success", async ({ page }) => {
    await page.route(/\/auth\/v1\/signup(?:\?|$)/, route => route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ message: "Too many signup attempts. Please try again later." }),
    }));
    await fillSignup(page);
    await page.getByRole("button", { name: "Sign Up" }).click();
    await expect(page).toHaveURL(/\/sign-up$/);
    await expect(page.getByText(/too many signup attempts/i)).toBeVisible();
    await expect(page.getByText(/sent a 6-digit verification code/i)).toHaveCount(0);
  });

  test("ONB-E2 temporary signup failure can be retried into one verification flow", async ({ page }) => {
    let attempts = 0;
    await page.route(/\/auth\/v1\/signup(?:\?|$)/, async route => {
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Signup service temporarily unavailable" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: pendingUser, session: null }),
      });
    });
    await fillSignup(page);
    await page.getByRole("button", { name: "Sign Up" }).click();
    await expect(page).toHaveURL(/\/sign-up$/);
    await expect(page.getByRole("button", { name: "Sign Up" })).toBeEnabled();
    await expect(page.getByText(/sent a 6-digit verification code/i)).toHaveCount(0);
    await page.getByRole("button", { name: "Sign Up" }).click();
    await expect(page).toHaveURL(/\/verify-email$/);
    expect(attempts).toBe(2);
  });

  test("ONB-E3 repeated signup click while pending produces only one request", async ({ page }) => {
    let requests = 0;
    await page.route(/\/auth\/v1\/signup(?:\?|$)/, async route => {
      requests += 1;
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: pendingUser, session: null }),
      });
    });
    await fillSignup(page);
    const signup = page.getByRole("button", { name: "Sign Up" });
    await signup.dblclick();
    await expect(page).toHaveURL(/\/verify-email$/);
    expect(requests).toBe(1);
  });

  test("ONB-E4 OTP service error preserves pending email and permits retry", async ({ page }) => {
    await page.addInitScript(email => localStorage.setItem("booksmart_pending_signup_email", email), testEmail);
    await page.route(/\/auth\/v1\/verify(?:\?|$)/, route => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Verification service temporarily unavailable" }),
    }));
    await page.goto("/verify-email");
    await page.getByLabel("Verification code").fill("654321");
    await page.getByRole("button", { name: "Verify Email" }).click();
    await expect(page).toHaveURL(/\/verify-email$/);
    await expect(page.getByRole("button", { name: "Verify Email" })).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem("booksmart_pending_signup_email"))).toBe(testEmail);
  });

  test("ONB-E5 reset rate limit is visible and never shows email-sent confirmation", async ({ page }) => {
    await page.route(/\/auth\/v1\/recover(?:\?|$)/, route => route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ message: "Too many reset attempts. Please try again later." }),
    }));
    await page.goto("/forgot-reset");
    await page.getByLabel("Email").fill(testEmail);
    await page.getByRole("button", { name: "Send Reset Link" }).click();
    await expect(page.getByText(/too many reset attempts/i)).toBeVisible();
    await expect(page.getByText(/check your email for the password reset link/i)).toHaveCount(0);
  });
});
