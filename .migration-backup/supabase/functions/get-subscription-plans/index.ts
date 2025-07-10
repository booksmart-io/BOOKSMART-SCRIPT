import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@18.0.0";

console.info("stripe-plans started");

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  const url = new URL(req.url);
  const testMode = url.searchParams.get("test") === "true";

  const stripeKey = testMode
    ? Deno.env.get("STRIPE_DEV_SECRET_KEY")
    : Deno.env.get("STRIPE_LIVE_SECRET_KEY");

  if (!stripeKey) {
    return Response.json({ error: "Missing Stripe key" }, {
      status: 500,
      headers: corsHeaders(),
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" });

  const [products, prices] = await Promise.all([
    stripe.products.list({ active: true, limit: 100 }),
    stripe.prices.list({ active: true, limit: 100, expand: ["data.product"] }),
  ]);

  function normalizeProductType(value: string | undefined) {
    const normalized = value?.trim().toLowerCase();
    if (normalized === "subscription" || normalized === "tokens") {
      return normalized;
    }
    return undefined;
  }

  function productTypeFor(
    product: Stripe.Product,
    productPrices: Stripe.Price[],
  ) {
    const metadataType = normalizeProductType(product.metadata?.product_type);
    if (metadataType) {
      return metadataType;
    }

    const priceMetadataType = productPrices
      .map((price) => normalizeProductType(price.metadata?.product_type))
      .find(Boolean);
    if (priceMetadataType) {
      return priceMetadataType;
    }

    if (productPrices.some((price) => price.type === "recurring")) {
      return "subscription";
    }

    return "unknown";
  }

  const plans = products.data.map((product) => {
    const productPrices = prices.data
      .filter((p) => {
        const productId = typeof p.product === "string"
          ? p.product
          : p.product.id;
        return productId === product.id;
      });

    const productType = productTypeFor(product, productPrices);

    const mappedPrices = productPrices
      .map((price) => ({
        id: price.id,
        amount: price.unit_amount ?? 0,
        currency: price.currency,
        type: price.type,
        interval: price.recurring?.interval,
        token_amount: price.metadata?.token_amount ??
          product.metadata?.token_amount ?? null,
      }));

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      product_type: productType,
      prices: mappedPrices,
    };
  });

  return Response.json({ mode: testMode ? "test" : "live", plans }, {
    headers: corsHeaders(),
  });
});
