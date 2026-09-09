import { expect, test, type Page, type Request } from "@playwright/test";

const testEmail = "controlled-onboarding@booksmart-e2e.example.test";

async function mockAuthEndpoint(
  page: Page,
  endpoint: RegExp,
  response: { status?: number; body: unknown },
) {
  await page.route(endpoint, async route => {
    await route.fulfill({
      status: response.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(response.body),
    });
  });
}

async function completeSignupForm(page: Page, options?: { cpa?: boolean }) {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(testEmail);
  await page.getByLabel("Password", { exact: true }).fill("Controlled123");
  await page.getByLabel("Confirm Password").fill("Controlled123");
  if (options?.cpa) await page.getByRole("switch", { name: "Sign up as CPA" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign Up" }).click();
}

test.describe("BookSmart controlled account-lifecycle contract", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("ONB-C1 consented owner signup sends the expected contract and opens verification", async ({ page }) => {
    let signupRequest: Request | undefined;
    await page.route(/\/auth\/v1\/signup(?:\?|$)/, async route => {
      signupRequest = route.request();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "00000000-0000-4000-8000-000000000001",
            email: testEmail,
            identities: [{ id: "identity-1", provider: "email" }],
            user_metadata: { role: "user" },
          },
          session: null,
        }),
      });
    });

    await completeSignupForm(page);
    await expect(page).toHaveURL(/\/verify-email$/);
    await expect(page.getByText(new RegExp(testEmail))).toBeVisible();
    expect(signupRequest).toBeTruthy();
    const payload = signupRequest!.postDataJSON();
    expect(payload.email).toBe(testEmail);
    expect(payload.data.role).toBe("user");
    expect(payload.data).toEqual(expect.objectContaining({ legal_consent_version: expect.any(String) }));
  });

  test("ONB-C2 CPA selection is preserved in the signup request", async ({ page }) => {
    let payload: Record<string, any> | undefined;
    await page.route(/\/auth\/v1\/signup(?:\?|$)/, async route => {
      payload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "00000000-0000-4000-8000-000000000002",
            email: testEmail,
            identities: [{ id: "identity-2", provider: "email" }],
            user_metadata: { role: "cpa" },
          },
          session: null,
        }),
      });
    });

    await completeSignupForm(page, { cpa: true });
    await expect(page).toHaveURL(/\/verify-email$/);
    expect(payload?.data.role).toBe("cpa");
    expect(payload?.data.verification_status).toBe("pending");
  });

  test("ONB-C3 duplicate signup response shows a safe recovery path", async ({ page }) => {
    await mockAuthEndpoint(page, /\/auth\/v1\/signup(?:\?|$)/, {
      body: {
        user: {
          id: "00000000-0000-4000-8000-000000000003",
          email: testEmail,
          identities: [],
          user_metadata: {},
        },
        session: null,
      },
    });

    await completeSignupForm(page);
    await expect(page).toHaveURL(/\/sign-up$/);
    await expect(page.getByText(/already exists.*sign in or reset your password/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
  });

  test("ONB-C4 expired verification code fails safely and remains retryable", async ({ page }) => {
    await page.addInitScript(email => {
      window.localStorage.setItem("booksmart_pending_signup_email", email);
    }, testEmail);
    await mockAuthEndpoint(page, /\/auth\/v1\/verify(?:\?|$)/, {
      status: 403,
      body: { message: "Token has expired or is invalid", error_description: "Token has expired or is invalid" },
    });

    await page.goto("/verify-email");
    await page.getByLabel("Verification code").fill("123456");
    await page.getByRole("button", { name: "Verify Email" }).click();
    await expect(page).toHaveURL(/\/verify-email$/);
    await expect(page.getByText(/expired or is invalid/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Verify Email" })).toBeEnabled();
  });

  test("ONB-C5 password-reset request uses the entered email and shows neutral confirmation", async ({ page }) => {
    let recoveryRequest: Request | undefined;
    await page.route(/\/auth\/v1\/recover(?:\?|$)/, async route => {
      recoveryRequest = route.request();
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/forgot-reset");
    await page.getByLabel("Email").fill(testEmail);
    await page.getByRole("button", { name: "Send Reset Link" }).click();
    await expect(page.getByText(/check your email for the password reset link/i)).toBeVisible();
    expect(recoveryRequest?.postDataJSON().email).toBe(testEmail);
  });
});
