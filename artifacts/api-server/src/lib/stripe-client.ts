import Stripe from "stripe";

let cachedClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;

  const secretKey = process.env["STRIPE_SECRET_KEY"];
  if (!secretKey || !secretKey.trim()) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }

  cachedClient = new Stripe(secretKey.trim());
  return cachedClient;
}
