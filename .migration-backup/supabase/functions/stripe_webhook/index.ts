import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import Stripe from "https://esm.sh/stripe@14.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

function parsePositiveInt(value: string | undefined, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value ?? "missing"}`);
  }
  return parsed;
}

async function applyTokenPurchase(
  supabase: any,
  paymentIntent: Stripe.PaymentIntent,
) {
  const metadata = paymentIntent.metadata ?? {};
  const authUserId = metadata.auth_user_id;

  if (!authUserId) {
    throw new Error(`Missing auth_user_id metadata for ${paymentIntent.id}`);
  }

  const tokenAmount = parsePositiveInt(metadata.token_amount, "token_amount");

  const { data, error } = await supabase.rpc("apply_token_purchase", {
    p_user_id: authUserId,
    p_amount: tokenAmount,
    p_stripe_customer_id: typeof paymentIntent.customer === "string"
      ? paymentIntent.customer
      : null,
    p_stripe_payment_intent_id: paymentIntent.id,
    p_stripe_price_id: metadata.stripe_price_id ?? null,
    p_stripe_product_id: metadata.stripe_product_id ?? null,
    p_use_case: metadata.use_case ?? `${tokenAmount} tokens`,
  });

  if (error) {
    throw new Error(`apply_token_purchase failed: ${JSON.stringify(error)}`);
  }

  console.log("Token purchase applied:", paymentIntent.id, data);
}

async function refundTokenPurchase(
  supabase: any,
  stripe: Stripe,
  charge: Stripe.Charge,
) {
  if (!charge.payment_intent) {
    throw new Error(`Refunded charge ${charge.id} has no payment_intent`);
  }

  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent.id;

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const metadata = paymentIntent.metadata ?? {};

  if (metadata.type !== "token_purchase") {
    console.log("Ignoring non token purchase refund");
    return;
  }

  const authUserId = metadata.auth_user_id;
  if (!authUserId) {
    throw new Error(`Missing auth_user_id metadata for ${paymentIntent.id}`);
  }

  const tokenAmount = parsePositiveInt(metadata.token_amount, "token_amount");
  const refundedTokenAmount = charge.amount_refunded >= charge.amount
    ? tokenAmount
    : Math.max(
      1,
      Math.floor((tokenAmount * charge.amount_refunded) / charge.amount),
    );

  const { data, error } = await supabase.rpc("refund_token_purchase", {
    p_user_id: authUserId,
    p_amount: refundedTokenAmount,
    p_stripe_customer_id: typeof paymentIntent.customer === "string"
      ? paymentIntent.customer
      : null,
    p_stripe_payment_intent_id: paymentIntent.id,
    p_stripe_price_id: metadata.stripe_price_id ?? null,
    p_stripe_product_id: metadata.stripe_product_id ?? null,
    p_use_case: metadata.use_case
      ? `${metadata.use_case} refund`
      : "Token purchase refund",
  });

  if (error) {
    throw new Error(`refund_token_purchase failed: ${JSON.stringify(error)}`);
  }

  console.log("Token purchase refund applied:", paymentIntent.id, data);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const testMode = url.searchParams.get("test") === "true";

    const stripeSecretKey = testMode
      ? Deno.env.get("STRIPE_DEV_SECRET_KEY")!
      : Deno.env.get("STRIPE_PROD_SECRET_KEY")!;

    const webhookSecret = testMode
      ? Deno.env.get("STRIPE_DEV_WEBHOOK_SECRET")!
      : Deno.env.get("STRIPE_PROD_WEBHOOK_SECRET")!;

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      console.error("Missing stripe signature");
      return new Response("Missing signature", { status: 400 });
    }

    let event;

    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid webhook signature" }),
        { status: 400 },
      );
    }

    console.log("Stripe event received:", event.type);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --------------------------------
    // Handle payment_intent.succeeded
    // --------------------------------
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      if (paymentIntent.metadata?.type === "token_purchase") {
        await applyTokenPurchase(supabase, paymentIntent);
      } else if (paymentIntent.metadata?.type === "cpa_order") {
        const orderId = paymentIntent.metadata?.order_id;
        if (!orderId) {
          console.error("Missing order_id metadata");
          return new Response("ok");
        }

        await supabase
          .from("orders")
          .update({
            payment_status: "paid",
            paid_at: new Date().toISOString(),
            status: "accepted",
          })
          .eq("id", orderId)
          .neq("payment_status", "paid");

        console.log("Order marked as PAID:", orderId);
      } else {
        console.log(
          "Ignoring payment intent type:",
          paymentIntent.metadata?.type ?? "missing",
        );
      }
    }

    // --------------------------------
    // Handle payment_intent.payment_failed
    // --------------------------------
    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      if (paymentIntent.metadata?.type === "token_purchase") {
        console.log("Token purchase payment failed:", {
          payment_intent_id: paymentIntent.id,
          auth_user_id: paymentIntent.metadata?.auth_user_id,
          last_payment_error: paymentIntent.last_payment_error?.message,
        });
      } else if (paymentIntent.metadata?.type === "cpa_order") {
        const orderId = paymentIntent.metadata?.order_id;
        if (!orderId) {
          console.error("Missing order_id metadata");
          return new Response("ok");
        }

        await supabase
          .from("orders")
          .update({ payment_status: "failed" })
          .eq("id", orderId)
          .neq("payment_status", "failed");

        console.log("Order marked as FAILED:", orderId);
      } else {
        console.log(
          "Ignoring failed payment intent type:",
          paymentIntent.metadata?.type ?? "missing",
        );
      }
    }

    // --------------------------------
    // Handle charge.refunded
    // --------------------------------
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;

      if (charge.metadata?.type === "token_purchase") {
        await refundTokenPurchase(supabase, stripe, charge);
      } else if (charge.metadata?.type === "cpa_order") {
        const orderId = charge.metadata?.order_id;
        if (!orderId) {
          console.error("Missing order_id metadata");
          return new Response("ok");
        }

        await supabase
          .from("orders")
          .update({ payment_status: "refunded", status: "cancelled" })
          .eq("id", orderId)
          .neq("payment_status", "refunded");

        console.log("Order marked as REFUNDED:", orderId);
      } else if (charge.payment_intent) {
        await refundTokenPurchase(supabase, stripe, charge);
      } else {
        console.log(
          "Ignoring refunded charge type:",
          charge.metadata?.type ?? "missing",
        );
      }
    }

    // --------------------------------
    // Handle customer.subscription.created
    // --------------------------------
    if (event.type === "customer.subscription.created") {
      const sub = event.data.object as Stripe.Subscription;

      // stripe_customer_id → look up user
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id, auth_id")
        .eq("stripe_customer_id", sub.customer as string)
        .single();

      if (profileError || !profile) {
        console.error("No user found for stripe_customer_id:", sub.customer);
        return new Response("ok");
      }

      if (!profile.auth_id) {
        console.error(
          "User profile has no auth_id for stripe_customer_id:",
          sub.customer,
        );
        return new Response("ok");
      }

      const price = sub.items.data[0].price;

      const subscriptionRecord = {
        user_id: profile.auth_id,
        stripe_customer_id: sub.customer as string,
        stripe_subscription_id: sub.id,
        stripe_price_id: price.id,
        stripe_product_id: price.product as string,
        status: sub.status,
        current_period_start: new Date(sub.current_period_start * 1000)
          .toISOString(),
        current_period_end: new Date(sub.current_period_end * 1000)
          .toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end,
        canceled_at: sub.canceled_at
          ? new Date(sub.canceled_at * 1000).toISOString()
          : null,
        trial_start: sub.trial_start
          ? new Date(sub.trial_start * 1000).toISOString()
          : null,
        trial_end: sub.trial_end
          ? new Date(sub.trial_end * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      };

      const { data: existingSubscription, error: lookupError } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("stripe_subscription_id", sub.id)
        .maybeSingle();

      if (lookupError) {
        console.error("Subscription lookup failed:", {
          stripe_subscription_id: sub.id,
          error: lookupError,
        });
        return new Response("ok");
      }

      const { error: saveError } = existingSubscription
        ? await supabase
          .from("subscriptions")
          .update(subscriptionRecord)
          .eq("stripe_subscription_id", sub.id)
        : await supabase.from("subscriptions").insert(subscriptionRecord);

      if (saveError) {
        console.error("Subscription save failed:", {
          stripe_subscription_id: sub.id,
          profile_id: profile.id,
          auth_id: profile.auth_id,
          error: saveError,
        });
        return new Response("ok");
      }

      console.log("Subscription created:", sub.id);
    }

    // --------------------------------
    // Handle customer.subscription.updated
    // --------------------------------
    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const price = sub.items.data[0].price;

      await supabase
        .from("subscriptions")
        .update({
          stripe_price_id: price.id,
          stripe_product_id: price.product as string,
          status: sub.status,
          current_period_start: new Date(sub.current_period_start * 1000)
            .toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000)
            .toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
          canceled_at: sub.canceled_at
            ? new Date(sub.canceled_at * 1000).toISOString()
            : null,
          trial_start: sub.trial_start
            ? new Date(sub.trial_start * 1000).toISOString()
            : null,
          trial_end: sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", sub.id);

      console.log("Subscription updated:", sub.id);
    }

    // --------------------------------
    // Handle customer.subscription.deleted
    // --------------------------------
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;

      await supabase
        .from("subscriptions")
        .update({
          status: "canceled",
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", sub.id);

      console.log("Subscription canceled:", sub.id);
    }

    // --------------------------------
    // Handle invoice.payment_succeeded  ← advances billing period
    // --------------------------------
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;

      if (!invoice.subscription) {
        console.log("Invoice not tied to a subscription, skipping");
        return new Response("ok");
      }

      // Fetch latest subscription state from Stripe to get updated period dates
      const sub = await stripe.subscriptions.retrieve(
        invoice.subscription as string,
      );

      await supabase
        .from("subscriptions")
        .update({
          status: sub.status,
          current_period_start: new Date(sub.current_period_start * 1000)
            .toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000)
            .toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", sub.id);

      console.log("Subscription period advanced:", sub.id);
    }

    // --------------------------------
    // Handle invoice.payment_failed
    // --------------------------------
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;

      if (!invoice.subscription) {
        console.log("Invoice not tied to a subscription, skipping");
        return new Response("ok");
      }

      await supabase
        .from("subscriptions")
        .update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", invoice.subscription as string);

      console.log("Subscription marked past_due:", invoice.subscription);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Webhook handler error:", error);
    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      { status: 500 },
    );
  }
});
