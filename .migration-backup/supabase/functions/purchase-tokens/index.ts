import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class FunctionError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "FunctionError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new FunctionError(
      500,
      "missing_env",
      `Missing required env var: ${name}`,
      {
        env: name,
      },
    );
  }
  return value;
}

function getStripeSecretKey(testMode: boolean) {
  if (testMode) {
    return {
      key: requireEnv("STRIPE_DEV_SECRET_KEY"),
      envName: "STRIPE_DEV_SECRET_KEY",
    };
  }

  const prodKey = Deno.env.get("STRIPE_PROD_SECRET_KEY");
  if (prodKey) {
    return { key: prodKey, envName: "STRIPE_PROD_SECRET_KEY" };
  }

  return {
    key: requireEnv("STRIPE_LIVE_SECRET_KEY"),
    envName: "STRIPE_LIVE_SECRET_KEY",
  };
}

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const stripeError = error as Error & {
      type?: string;
      code?: string;
      statusCode?: number;
      requestId?: string;
      decline_code?: string;
      payment_intent?: { id?: string; status?: string };
      raw?: unknown;
    };

    return {
      name: error.name,
      message: error.message,
      type: stripeError.type,
      code: stripeError.code,
      statusCode: stripeError.statusCode,
      requestId: stripeError.requestId,
      declineCode: stripeError.decline_code,
      paymentIntent: stripeError.payment_intent,
      raw: stripeError.raw,
    };
  }

  return { message: String(error) };
}

function normalizeProductType(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "tokens" || normalized === "subscription") {
    return normalized;
  }
  return undefined;
}

function parseTokenAmount(price: Stripe.Price, product: Stripe.Product) {
  const rawAmount = price.metadata?.token_amount ??
    product.metadata?.token_amount;
  const tokenAmount = Number(rawAmount);

  if (!Number.isInteger(tokenAmount) || tokenAmount <= 0) {
    throw new FunctionError(
      400,
      "invalid_token_amount",
      "Stripe price is missing a valid token_amount metadata value",
      {
        priceId: price.id,
        productId: product.id,
        tokenAmount: rawAmount,
      },
    );
  }

  return tokenAmount;
}

async function applyTokenPurchase(params: {
  supabase: any;
  authUserId: string;
  tokenAmount: number;
  paymentIntent: Stripe.PaymentIntent;
  priceId: string;
  productId: string;
}) {
  const { data, error } = await params.supabase.rpc("apply_token_purchase", {
    p_user_id: params.authUserId,
    p_amount: params.tokenAmount,
    p_stripe_customer_id: typeof params.paymentIntent.customer === "string"
      ? params.paymentIntent.customer
      : null,
    p_stripe_payment_intent_id: params.paymentIntent.id,
    p_stripe_price_id: params.priceId,
    p_stripe_product_id: params.productId,
    p_use_case: `${params.tokenAmount} tokens`,
  });

  if (error) {
    throw new FunctionError(
      500,
      "token_credit_failed",
      "Payment succeeded, but token credit failed",
      {
        paymentIntentId: params.paymentIntent.id,
        supabaseError: error,
      },
    );
  }

  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const testMode = url.searchParams.get("test") === "true";

    if (req.method !== "POST") {
      throw new FunctionError(
        405,
        "method_not_allowed",
        "Only POST requests are allowed",
        {
          method: req.method,
        },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new FunctionError(
        401,
        "missing_authorization",
        "Missing authorization header",
      );
    }

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      token,
    );

    if (authError || !user) {
      throw new FunctionError(401, "unauthorized", "Unauthorized", {
        authError: authError?.message,
      });
    }

    let body: { price_id?: string };
    try {
      body = await req.json();
    } catch (error) {
      throw new FunctionError(
        400,
        "invalid_json",
        "Request body must be valid JSON",
        getErrorDetails(error),
      );
    }

    const { price_id } = body;
    if (!price_id) {
      throw new FunctionError(400, "missing_price_id", "Missing price_id");
    }

    const { key: stripeKey, envName: stripeEnvName } = getStripeSecretKey(
      testMode,
    );
    console.log(
      "purchase-tokens mode:",
      testMode ? "test" : "live",
      "stripe env:",
      stripeEnvName,
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, auth_id, stripe_customer_id, email")
      .eq("auth_id", user.id)
      .single();

    if (userError || !userData) {
      throw new FunctionError(404, "user_not_found", "User not found", {
        authUserId: user.id,
        supabaseError: userError,
      });
    }

    const customerId = userData.stripe_customer_id;
    if (!customerId) {
      throw new FunctionError(
        400,
        "missing_payment_method",
        "No saved card found. Please add a card before buying tokens.",
        { authUserId: user.id },
      );
    }

    const price = await stripe.prices.retrieve(price_id, {
      expand: ["product"],
    });

    const product = typeof price.product === "string"
      ? await stripe.products.retrieve(price.product)
      : price.product as Stripe.Product;

    if (!price.active) {
      throw new FunctionError(
        400,
        "inactive_price",
        "This token pack is not active",
        {
          priceId: price.id,
        },
      );
    }

    if (price.type !== "one_time") {
      throw new FunctionError(
        400,
        "invalid_price_type",
        "Token purchases require a one-time Stripe price",
        {
          priceId: price.id,
          priceType: price.type,
        },
      );
    }

    const productType = normalizeProductType(price.metadata?.product_type) ??
      normalizeProductType(product.metadata?.product_type);
    if (productType !== "tokens") {
      throw new FunctionError(
        400,
        "invalid_product_type",
        "This Stripe price is not configured as a token product",
        {
          priceId: price.id,
          productId: product.id,
          productType,
        },
      );
    }

    if (!price.unit_amount || price.unit_amount <= 0) {
      throw new FunctionError(
        400,
        "invalid_price_amount",
        "Stripe price has no valid amount",
        {
          priceId: price.id,
        },
      );
    }

    const tokenAmount = parseTokenAmount(price, product);

    const customer = await stripe.customers.retrieve(
      customerId,
    ) as Stripe.Customer;
    if (customer.deleted) {
      throw new FunctionError(
        400,
        "deleted_stripe_customer",
        "Saved Stripe customer was deleted",
        {
          stripeCustomerId: customerId,
        },
      );
    }

    let paymentMethodId: string | null =
      (customer.invoice_settings?.default_payment_method as string) ?? null;

    if (!paymentMethodId) {
      const methods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 1,
      });

      if (methods.data.length === 0) {
        throw new FunctionError(
          400,
          "missing_payment_method",
          "No saved card found. Please add a card before buying tokens.",
          { stripeCustomerId: customerId },
        );
      }

      paymentMethodId = methods.data[0].id;
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: price.unit_amount,
      currency: price.currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      description: `${tokenAmount} BookSmart tokens`,
      metadata: {
        type: "token_purchase",
        auth_user_id: user.id,
        profile_id: String(userData.id),
        token_amount: String(tokenAmount),
        stripe_price_id: price.id,
        stripe_product_id: product.id,
        use_case: `${tokenAmount} tokens`,
      },
    });

    console.log(
      "Token purchase payment intent created:",
      paymentIntent.id,
      "status:",
      paymentIntent.status,
    );

    const tokenCredit = paymentIntent.status === "succeeded"
      ? await applyTokenPurchase({
        supabase,
        authUserId: user.id,
        tokenAmount,
        paymentIntent,
        priceId: price.id,
        productId: product.id,
      })
      : null;

    return jsonResponse({
      success: paymentIntent.status === "succeeded",
      status: paymentIntent.status,
      payment_intent_id: paymentIntent.id,
      token_amount: tokenAmount,
      token_credit: tokenCredit,
      mode: testMode ? "test" : "live",
    });
  } catch (error) {
    const stripeStatus = error instanceof Error
      ? (error as Error & { statusCode?: number }).statusCode
      : undefined;
    const status = error instanceof FunctionError
      ? error.status
      : stripeStatus ?? 500;
    const code = error instanceof FunctionError
      ? error.code
      : "token_purchase_failed";
    const message = error instanceof FunctionError
      ? error.message
      : "Token purchase failed";
    const details = error instanceof FunctionError
      ? error.details
      : getErrorDetails(error);

    console.error("purchase-tokens error:", {
      status,
      code,
      message,
      details,
    });

    return jsonResponse(
      {
        error: message,
        code,
        details,
      },
      status,
    );
  }
});
