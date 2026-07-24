import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import {
  TOKEN_PACKAGES,
  type TokenPackageKey,
} from "./stripe-catalog";

type SupabaseAdmin = SupabaseClient<any, any, any>;

export type TokenFulfillmentResult = {
  status: "tokens_granted" | "already_fulfilled";
  tokenBalance: number;
  tokensAdded: number;
  packageKey: TokenPackageKey;
};

type RpcResult = {
  applied?: boolean;
  reason?: string;
  balance_after?: number;
  tokens_added?: number;
};

export function validateTokenCheckout(
  session: Stripe.Checkout.Session,
  lineItems: Stripe.ApiList<Stripe.LineItem>,
): {
  userId: string;
  packageKey: TokenPackageKey;
  tokenPackage: (typeof TOKEN_PACKAGES)[TokenPackageKey];
} {
  if (session.mode !== "payment") {
    throw new Error(`Checkout Session ${session.id} is not a payment Session`);
  }

  if (session.payment_status !== "paid") {
    throw new Error(`Checkout Session ${session.id} is not paid`);
  }

  const userId = session.metadata?.user_id;
  if (!userId) {
    throw new Error(`Checkout Session ${session.id} is missing user_id metadata`);
  }

  const packageKey = session.metadata?.package_key as
    | TokenPackageKey
    | undefined;
  const tokenPackage = packageKey
    ? TOKEN_PACKAGES[packageKey]
    : undefined;

  if (!packageKey || !tokenPackage) {
    throw new Error(`Checkout Session ${session.id} has an invalid token package`);
  }

  if (lineItems.has_more || lineItems.data.length !== 1) {
    throw new Error(`Checkout Session ${session.id} has unexpected line items`);
  }

  const lineItem = lineItems.data[0];
  const paidPriceId =
    typeof lineItem.price === "string"
      ? lineItem.price
      : lineItem.price?.id;

  if (paidPriceId !== tokenPackage.priceId) {
    throw new Error(
      `Checkout Session ${session.id} Price does not match package ${packageKey}`,
    );
  }

  if (lineItem.quantity !== 1) {
    throw new Error(`Checkout Session ${session.id} has an invalid quantity`);
  }

  if (
    lineItem.amount_total !== tokenPackage.unitAmount ||
    session.amount_total !== tokenPackage.unitAmount
  ) {
    throw new Error(`Checkout Session ${session.id} amount does not match its package`);
  }

  return { userId, packageKey, tokenPackage };
}

export async function fulfillTokenCheckout(
  stripe: Stripe,
  admin: SupabaseAdmin,
  session: Stripe.Checkout.Session,
): Promise<TokenFulfillmentResult> {
  const lineItems = await stripe.checkout.sessions.listLineItems(
    session.id,
    { limit: 10 },
  );
  const { userId, packageKey, tokenPackage } =
    validateTokenCheckout(session, lineItems);

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const { data, error } = await admin.rpc(
    "fulfill_token_checkout",
    {
      p_user_id: userId,
      p_amount: tokenPackage.tokens,
      p_stripe_checkout_session_id: session.id,
      p_stripe_customer_id: customerId,
      p_stripe_payment_intent_id: paymentIntentId,
      p_stripe_price_id: tokenPackage.priceId,
      p_stripe_product_id: tokenPackage.productId,
      p_use_case: `${tokenPackage.tokens} tokens`,
    },
  );

  if (error) {
    throw new Error(`Atomic token fulfillment failed: ${error.message}`);
  }

  const result = (data ?? {}) as RpcResult;
  const applied = result.applied === true;

  return {
    status: applied ? "tokens_granted" : "already_fulfilled",
    tokenBalance: Number(result.balance_after ?? 0),
    tokensAdded: applied ? tokenPackage.tokens : 0,
    packageKey,
  };
}
