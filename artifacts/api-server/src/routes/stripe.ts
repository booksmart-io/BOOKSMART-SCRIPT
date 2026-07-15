import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

import { requireAuth } from "../middlewares/require-auth";
import { getStripeClient } from "../lib/stripe-client";
import {
  SUBSCRIPTION_PLANS,
  TOKEN_PACKAGES,
  type PlanKey,
  type TokenPackageKey,
} from "../lib/stripe-catalog";

const router = Router();

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  "https://pvppwmkswnluidlwnnck.supabase.co";

type UserRow = {
  email?: string | null;
  stripe_customer_id?: string | null;
};

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createClient(SUPABASE_URL, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Production redirects must use HTTPS.
 * Localhost HTTP redirects are allowed only during development.
 */
function isAllowedRedirectUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }

  try {
    const url = new URL(value);

    if (url.protocol === "https:") {
      return true;
    }

    const isLocalhost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1";

    return (
      process.env.NODE_ENV === "development" &&
      url.protocol === "http:" &&
      isLocalhost
    );
  } catch {
    return false;
  }
}

function validateRedirectUrls(
  successUrl: unknown,
  cancelUrl: unknown,
): string | null {
  if (
    !isAllowedRedirectUrl(successUrl) ||
    !isAllowedRedirectUrl(cancelUrl)
  ) {
    return (
      "Redirect URLs must use HTTPS. " +
      "HTTP localhost URLs are allowed only in development."
    );
  }

  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

/**
 * Returns an existing valid Stripe customer or creates a replacement.
 */
async function resolveStripeCustomerId(
  admin: ReturnType<typeof getAdminClient>,
  stripe: ReturnType<typeof getStripeClient>,
  userId: string,
  userRow: UserRow | null | undefined,
): Promise<string> {
  const existingId = userRow?.stripe_customer_id ?? undefined;

  if (existingId) {
    try {
      const existing = await stripe.customers.retrieve(existingId);

      if (!existing.deleted) {
        return existing.id;
      }
    } catch {
      // The stored ID may belong to another Stripe account or mode.
      // Create a new customer below.
    }
  }

  const customer = await stripe.customers.create({
    email: userRow?.email ?? undefined,
    metadata: {
      user_id: userId,
    },
  });

  const { error } = await admin
    .from("users")
    .update({
      stripe_customer_id: customer.id,
    })
    .eq("auth_id", userId);

  if (error) {
    throw new Error(
      `Could not save Stripe customer ID: ${error.message}`,
    );
  }

  return customer.id;
}

/**
 * Public Stripe catalog.
 */
router.get("/stripe/catalog", (_req, res) => {
  res.json({
    plans: SUBSCRIPTION_PLANS,
    tokenPackages: TOKEN_PACKAGES,
  });
});

/**
 * Current subscription and token status.
 */
router.get("/stripe/status", requireAuth, async (req, res) => {
  try {
    const userId = req.supabaseUserId!;
    const admin = getAdminClient();

    const { data: userRow, error: userError } = await admin
      .from("users")
      .select("id, token_balance")
      .eq("auth_id", userId)
      .maybeSingle();

    if (userError) {
      res.status(500).json({
        error: "user_lookup_failed",
        message: userError.message,
      });
      return;
    }

    if (!userRow) {
      res.status(404).json({
        error: "user_not_found",
      });
      return;
    }

    const { data: subscriptionRow, error: subscriptionError } =
      await admin
        .from("subscriptions")
        .select(
          "status, stripe_price_id, current_period_end, cancel_at_period_end",
        )
        .eq("user_id", userId)
        .order("created_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

    if (subscriptionError) {
      res.status(500).json({
        error: "subscription_lookup_failed",
        message: subscriptionError.message,
      });
      return;
    }

    let tier: "free" | "plus" | "pro" = "free";

    const periodEnd = typeof subscriptionRow?.current_period_end === "string"
      ? new Date(subscriptionRow.current_period_end)
      : null;
    const periodIsCurrent =
      !periodEnd ||
      !Number.isFinite(periodEnd.getTime()) ||
      periodEnd.getTime() >= Date.now();

    if (
      subscriptionRow &&
      subscriptionRow.status === "active" &&
      periodIsCurrent
    ) {
      if (
        subscriptionRow.stripe_price_id ===
        SUBSCRIPTION_PLANS.pro.priceId
      ) {
        tier = "pro";
      } else if (
        subscriptionRow.stripe_price_id ===
        SUBSCRIPTION_PLANS.plus.priceId
      ) {
        tier = "plus";
      }
    }

    res.json({
      tier,
      tokenBalance: userRow.token_balance ?? 0,
      subscription: subscriptionRow ?? null,
    });
  } catch (error) {
    console.error("[stripe/status]", error);

    res.status(500).json({
      error: "stripe_status_failed",
      message: errorMessage(error),
    });
  }
});

/**
 * Create subscription checkout.
 */
router.post(
  "/stripe/create-checkout-session",
  requireAuth,
  async (req, res) => {
    const { planKey, successUrl, cancelUrl } = req.body as {
      planKey?: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    if (
      !planKey ||
      !(planKey in SUBSCRIPTION_PLANS)
    ) {
      res.status(400).json({
        error: "invalid_plan_key",
      });
      return;
    }

    const redirectError = validateRedirectUrls(
      successUrl,
      cancelUrl,
    );

    if (redirectError) {
      res.status(400).json({
        error: "invalid_redirect_urls",
        message: redirectError,
      });
      return;
    }
    const checkedSuccessUrl = successUrl as string;
    const checkedCancelUrl = cancelUrl as string;

    try {
      const userId = req.supabaseUserId!;
      const admin = getAdminClient();
      const stripe = getStripeClient();
      const plan =
        SUBSCRIPTION_PLANS[planKey as PlanKey];

      const { data: userRow, error: userError } = await admin
        .from("users")
        .select("email, stripe_customer_id")
        .eq("auth_id", userId)
        .maybeSingle();

      if (userError) {
        res.status(500).json({
          error: "user_lookup_failed",
          message: userError.message,
        });
        return;
      }

      if (!userRow) {
        res.status(404).json({
          error: "user_not_found",
        });
        return;
      }

      const customerId =
        await resolveStripeCustomerId(
          admin,
          stripe,
          userId,
          userRow,
        );

      const session =
        await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: customerId,
          line_items: [
            {
              price: plan.priceId,
              quantity: 1,
            },
          ],
          success_url: `${checkedSuccessUrl}${
            checkedSuccessUrl.includes("?") ? "&" : "?"
          }session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: checkedCancelUrl,
          metadata: {
            user_id: userId,
            plan_key: planKey,
          },
          subscription_data: {
            metadata: {
              user_id: userId,
              plan_key: planKey,
            },
          },
        });

      if (!session.url) {
        res.status(502).json({
          error: "checkout_url_missing",
          message:
            "Stripe did not return a checkout URL.",
        });
        return;
      }

      res.json({
        url: session.url,
      });
    } catch (error) {
      console.error(
        "[stripe/create-checkout-session]",
        error,
      );

      res.status(502).json({
        error: "stripe_error",
        message: errorMessage(error),
      });
    }
  },
);

/**
 * Create token-package checkout.
 */
router.post(
  "/stripe/create-token-checkout",
  requireAuth,
  async (req, res) => {
    const { packageKey, successUrl, cancelUrl } =
      req.body as {
        packageKey?: string;
        successUrl?: string;
        cancelUrl?: string;
      };

    if (
      !packageKey ||
      !(packageKey in TOKEN_PACKAGES)
    ) {
      res.status(400).json({
        error: "invalid_package_key",
        packageKey: packageKey ?? null,
      });
      return;
    }

    const redirectError = validateRedirectUrls(
      successUrl,
      cancelUrl,
    );

    if (redirectError) {
      res.status(400).json({
        error: "invalid_redirect_urls",
        message: redirectError,
      });
      return;
    }
    const checkedSuccessUrl = successUrl as string;
    const checkedCancelUrl = cancelUrl as string;

    try {
      const userId = req.supabaseUserId!;
      const admin = getAdminClient();
      const stripe = getStripeClient();
      const tokenPackage =
        TOKEN_PACKAGES[
          packageKey as TokenPackageKey
        ];

      const { data: userRow, error: userError } = await admin
        .from("users")
        .select("email, stripe_customer_id")
        .eq("auth_id", userId)
        .maybeSingle();

      if (userError) {
        res.status(500).json({
          error: "user_lookup_failed",
          message: userError.message,
        });
        return;
      }

      if (!userRow) {
        res.status(404).json({
          error: "user_not_found",
        });
        return;
      }

      const customerId =
        await resolveStripeCustomerId(
          admin,
          stripe,
          userId,
          userRow,
        );

      const session =
        await stripe.checkout.sessions.create({
          mode: "payment",
          customer: customerId,
          line_items: [
            {
              price: tokenPackage.priceId,
              quantity: 1,
            },
          ],
          success_url: `${checkedSuccessUrl}${
            checkedSuccessUrl.includes("?") ? "&" : "?"
          }session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: checkedCancelUrl,
          metadata: {
            user_id: userId,
            package_key: packageKey,
            tokens: String(tokenPackage.tokens),
          },
        });

      if (!session.url) {
        res.status(502).json({
          error: "checkout_url_missing",
          message:
            "Stripe did not return a checkout URL.",
        });
        return;
      }

      res.json({
        url: session.url,
      });
    } catch (error) {
      console.error(
        "[stripe/create-token-checkout]",
        error,
      );

      res.status(502).json({
        error: "stripe_error",
        message: errorMessage(error),
      });
    }
  },
);

/**
 * Confirm a completed Stripe checkout.
 */
router.post(
  "/stripe/confirm-checkout",
  requireAuth,
  async (req, res) => {
    const { sessionId } = req.body as {
      sessionId?: string;
    };

    if (
      !sessionId ||
      typeof sessionId !== "string"
    ) {
      res.status(400).json({
        error: "session_id_required",
      });
      return;
    }

    try {
      const userId = req.supabaseUserId!;
      const stripe = getStripeClient();
      const admin = getAdminClient();

      const session =
        await stripe.checkout.sessions.retrieve(
          sessionId,
          {
            expand: ["subscription"],
          },
        );

      if (session.metadata?.user_id !== userId) {
        res.status(403).json({
          error: "session_user_mismatch",
        });
        return;
      }

      if (session.payment_status !== "paid") {
        res.status(409).json({
          error: "payment_not_completed",
          status: session.payment_status,
        });
        return;
      }

      const { data: userRow, error: userError } =
        await admin
          .from("users")
          .select("id, token_balance")
          .eq("auth_id", userId)
          .maybeSingle();

      if (userError) {
        res.status(500).json({
          error: "user_lookup_failed",
          message: userError.message,
        });
        return;
      }

      if (!userRow) {
        res.status(404).json({
          error: "user_not_found",
        });
        return;
      }

      if (session.mode === "payment") {
        const tokens = Number(
          session.metadata?.tokens ?? 0,
        );

        if (!Number.isFinite(tokens) || tokens <= 0) {
          res.status(400).json({
            error: "invalid_token_amount",
          });
          return;
        }

        const {
          data: existingTransaction,
          error: existingError,
        } = await admin
          .from("token_transactions")
          .select("id")
          .eq(
            "stripe_checkout_session_id",
            session.id,
          )
          .maybeSingle();

        if (existingError) {
          res.status(500).json({
            error:
              "token_transaction_lookup_failed",
            message: existingError.message,
          });
          return;
        }

        if (existingTransaction) {
          res.json({
            status: "already_processed",
            tokenBalance:
              userRow.token_balance ?? 0,
          });
          return;
        }

        const newBalance =
          (userRow.token_balance ?? 0) + tokens;

        const packageKey =
          session.metadata?.package_key as
            | TokenPackageKey
            | undefined;

        const stripePriceId =
          packageKey &&
          TOKEN_PACKAGES[packageKey]
            ? TOKEN_PACKAGES[packageKey].priceId
            : null;

        const { error: transactionError } =
          await admin
            .from("token_transactions")
            .insert({
              user_id: userId,
              amount: tokens,
              balance_after: newBalance,
              type: "purchase",
              status: "posted",
              use_case: `${tokens} tokens`,
              stripe_customer_id:
                typeof session.customer === "string"
                  ? session.customer
                  : session.customer?.id,
              stripe_payment_intent_id:
                typeof session.payment_intent ===
                "string"
                  ? session.payment_intent
                  : session.payment_intent?.id,
              stripe_checkout_session_id:
                session.id,
              stripe_price_id: stripePriceId,
            });

        if (transactionError) {
          res.status(500).json({
            error:
              "token_transaction_insert_failed",
            message: transactionError.message,
          });
          return;
        }

        const { error: balanceError } = await admin
          .from("users")
          .update({
            token_balance: newBalance,
          })
          .eq("auth_id", userId);

        if (balanceError) {
          res.status(500).json({
            error: "token_balance_update_failed",
            message: balanceError.message,
          });
          return;
        }

        res.json({
          status: "tokens_granted",
          tokenBalance: newBalance,
          tokensAdded: tokens,
        });
        return;
      }

      if (session.mode === "subscription") {
        const subscription =
          session.subscription;

        if (
          !subscription ||
          typeof subscription === "string"
        ) {
          res.status(502).json({
            error: "subscription_not_expanded",
          });
          return;
        }

        const subscriptionItem =
          subscription.items.data[0];

        const priceId =
          subscriptionItem?.price.id ?? null;

        const periodEnd =
          subscriptionItem?.current_period_end;

        const {
          data: existingSubscription,
          error: subscriptionLookupError,
        } = await admin
          .from("subscriptions")
          .select("id")
          .eq(
            "stripe_subscription_id",
            subscription.id,
          )
          .maybeSingle();

        if (subscriptionLookupError) {
          res.status(500).json({
            error:
              "subscription_lookup_failed",
            message:
              subscriptionLookupError.message,
          });
          return;
        }

        const planKey =
          session.metadata?.plan_key as
            | PlanKey
            | undefined;

        const productId =
          planKey && SUBSCRIPTION_PLANS[planKey]
            ? SUBSCRIPTION_PLANS[planKey]
                .productId
            : null;

        const payload = {
          user_id: userId,
          stripe_customer_id:
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer.id,
          stripe_subscription_id:
            subscription.id,
          stripe_price_id: priceId,
          stripe_product_id: productId,
          status: subscription.status,
          current_period_start: new Date(
            subscription.start_date * 1000,
          ).toISOString(),
          current_period_end: periodEnd
            ? new Date(
                periodEnd * 1000,
              ).toISOString()
            : null,
          cancel_at_period_end:
            subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        };

        if (existingSubscription) {
          const { error: updateError } =
            await admin
              .from("subscriptions")
              .update(payload)
              .eq(
                "id",
                existingSubscription.id,
              );

          if (updateError) {
            res.status(500).json({
              error:
                "subscription_update_failed",
              message: updateError.message,
            });
            return;
          }
        } else {
          const { error: insertError } =
            await admin
              .from("subscriptions")
              .insert(payload);

          if (insertError) {
            res.status(500).json({
              error:
                "subscription_insert_failed",
              message: insertError.message,
            });
            return;
          }
        }

        res.json({
          status: "subscription_activated",
          tier: planKey ?? null,
        });
        return;
      }

      res.status(400).json({
        error: "unsupported_session_mode",
      });
    } catch (error) {
      console.error(
        "[stripe/confirm-checkout]",
        error,
      );

      res.status(502).json({
        error: "stripe_error",
        message: errorMessage(error),
      });
    }
  },
);

export default router;
