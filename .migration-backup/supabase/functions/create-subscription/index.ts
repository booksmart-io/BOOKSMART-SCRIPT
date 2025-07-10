// supabase/functions/create-subscription/index.ts
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

  constructor(status: number, code: string, message: string, details?: unknown) {
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
    throw new FunctionError(500, "missing_env", `Missing required env var: ${name}`, {
      env: name,
    });
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
      raw: stripeError.raw,
    };
  }

  return { message: String(error) };
}

function toIsoFromUnix(timestamp: number | null | undefined) {
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

Deno.serve(async (req: Request) => {

  // --------------------------------
  // CORS
  // --------------------------------
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {

    // --------------------------------
    // Test Mode — query param only
    // --------------------------------
    const url = new URL(req.url);
    const testMode = url.searchParams.get("test") === "true";

    if (req.method !== "POST") {
      throw new FunctionError(405, "method_not_allowed", "Only POST requests are allowed", {
        method: req.method,
      });
    }

    // --------------------------------
    // Auth — verify Supabase JWT
    // --------------------------------
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      throw new FunctionError(401, "missing_authorization", "Missing authorization header");
    }

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY")
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new FunctionError(401, "unauthorized", "Unauthorized", {
        authError: authError?.message,
      });
    }

    // --------------------------------
    // Parse Request Body
    // --------------------------------
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

    // --------------------------------
    // Stripe Client
    // --------------------------------
    const { key: stripeKey, envName: stripeEnvName } = getStripeSecretKey(testMode);
    console.log("create-subscription mode:", testMode ? "test" : "live", "stripe env:", stripeEnvName);

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // --------------------------------
    // Fetch User's Stripe Customer ID
    // --------------------------------
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, stripe_customer_id, email")
      .eq("auth_id", user.id)
      .single();

    if (userError || !userData) {
      throw new FunctionError(404, "user_not_found", "User not found", {
        authUserId: user.id,
        supabaseError: userError,
      });
    }

    let customerId = userData.stripe_customer_id;

    // Create Stripe customer if doesn't exist yet
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.email,
        metadata: { auth_user_id: user.id },
      });

      customerId = customer.id;

      const { error: updateCustomerError } = await supabase
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("auth_id", user.id);

      if (updateCustomerError) {
        throw new FunctionError(
          500,
          "customer_update_failed",
          "Failed to save Stripe customer ID",
          {
            stripeCustomerId: customerId,
            supabaseError: updateCustomerError,
          },
        );
      }
    }

    // --------------------------------
    // Resolve Default Payment Method
    // --------------------------------
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;

    let paymentMethodId: string | null =
      (customer.invoice_settings?.default_payment_method as string) ?? null;

    // Fallback to first attached card if no default
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
          "No payment method found. Please add a card first.",
          {
            stripeCustomerId: customerId,
          },
        );
      }

      paymentMethodId = methods.data[0].id;
    }

    // --------------------------------
    // Check No Existing Active Subscription
    // --------------------------------
    const { data: existingSub, error: existingSubError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing"])
      .maybeSingle();

    if (existingSubError) {
      throw new FunctionError(
        500,
        "subscription_lookup_failed",
        "Failed to check existing subscriptions",
        {
          userId: user.id,
          profileId: userData.id,
          supabaseError: existingSubError,
        },
      );
    }

    if (existingSub) {
      throw new FunctionError(409, "active_subscription_exists", "User already has an active subscription", {
        subscriptionId: existingSub.id,
      });
    }

    const stripeSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });

    const existingStripeSubscription = stripeSubscriptions.data.find((sub) =>
      ["active", "trialing", "past_due", "incomplete"].includes(sub.status)
    );

    // --------------------------------
    // Create Subscription, or recover existing Stripe subscription
    // --------------------------------
    const subscription = existingStripeSubscription
      ? existingStripeSubscription
      : await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: price_id }],
        default_payment_method: paymentMethodId,
        payment_behavior: "error_if_incomplete",
        expand: ["latest_invoice.payment_intent"],
        metadata: {
          auth_user_id: user.id,
          profile_id: String(userData.id),
        },
      });

    console.log(
      existingStripeSubscription ? "Existing Stripe subscription found:" : "Subscription created:",
      subscription.id,
      "status:",
      subscription.status,
    );

    const price = subscription.items.data[0]?.price;

    if (!price) {
      throw new FunctionError(500, "missing_subscription_price", "Stripe subscription has no price item", {
        stripeSubscriptionId: subscription.id,
      });
    }

    const subscriptionRecord = {
      user_id: user.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: price.id,
      stripe_product_id: typeof price.product === "string" ? price.product : price.product.id,
      status: subscription.status,
      current_period_start: toIsoFromUnix(subscription.current_period_start),
      current_period_end: toIsoFromUnix(subscription.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: toIsoFromUnix(subscription.canceled_at),
      trial_start: toIsoFromUnix(subscription.trial_start),
      trial_end: toIsoFromUnix(subscription.trial_end),
      updated_at: new Date().toISOString(),
    };

    const { data: savedSubscription, error: savedSubscriptionLookupError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();

    if (savedSubscriptionLookupError) {
      throw new FunctionError(
        500,
        "subscription_save_lookup_failed",
        "Failed to check saved subscription record",
        {
          stripeSubscriptionId: subscription.id,
          supabaseError: savedSubscriptionLookupError,
        },
      );
    }

    const saveResult = savedSubscription
      ? await supabase
        .from("subscriptions")
        .update(subscriptionRecord)
        .eq("stripe_subscription_id", subscription.id)
      : await supabase
        .from("subscriptions")
        .insert(subscriptionRecord);

    if (saveResult.error) {
      throw new FunctionError(
        500,
        "subscription_persist_failed",
        "Stripe subscription exists, but saving it to the database failed",
        {
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: customerId,
          userId: user.id,
          profileId: userData.id,
          supabaseError: saveResult.error,
        },
      );
    }

    console.log("Subscription saved:", subscription.id, "user:", user.id);

    return jsonResponse({
      status: subscription.status,
      subscription_id: subscription.id,
      subscription_saved: true,
      recovered_existing_subscription: Boolean(existingStripeSubscription),
      mode: testMode ? "test" : "live",
    });

  } catch (error) {
    const status = error instanceof FunctionError ? error.status : 500;
    const code = error instanceof FunctionError ? error.code : "subscription_creation_failed";
    const message = error instanceof FunctionError ? error.message : "Subscription creation failed";
    const details = error instanceof FunctionError ? error.details : getErrorDetails(error);

    console.error("create-subscription error:", {
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