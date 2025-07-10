import Stripe from "stripe";

const secretKey = process.env["STRIPE_SECRET_KEY"];
if (!secretKey) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

const stripe = new Stripe(secretKey);

type PlanDef = {
  key: string;
  name: string;
  description: string;
  unitAmount: number;
  kind: "subscription" | "token_package";
  tokens?: number;
};

const PLANS: PlanDef[] = [
  {
    key: "plus",
    name: "BookSmart Plus",
    description: "5 connected accounts, 1,000 transactions/mo, full reports, CPA contact.",
    unitAmount: 999,
    kind: "subscription",
  },
  {
    key: "pro",
    name: "BookSmart Pro",
    description: "Unlimited accounts & transactions, AI CFO, AI Funding Coach, priority CPA matching.",
    unitAmount: 1999,
    kind: "subscription",
  },
  {
    key: "tokens_starter",
    name: "BookSmart Tokens - Starter",
    description: "10 BookSmart Tokens",
    unitAmount: 1000,
    kind: "token_package",
    tokens: 10,
  },
  {
    key: "tokens_growth",
    name: "BookSmart Tokens - Growth",
    description: "25 BookSmart Tokens",
    unitAmount: 2500,
    kind: "token_package",
    tokens: 25,
  },
  {
    key: "tokens_business",
    name: "BookSmart Tokens - Business",
    description: "50 BookSmart Tokens",
    unitAmount: 5000,
    kind: "token_package",
    tokens: 50,
  },
  {
    key: "tokens_professional",
    name: "BookSmart Tokens - Professional",
    description: "100 BookSmart Tokens",
    unitAmount: 10000,
    kind: "token_package",
    tokens: 100,
  },
];

async function findExistingPrice(planKey: string): Promise<{ product: string; price: string } | null> {
  const products = await stripe.products.search({
    query: `metadata['plan_key']:'${planKey}'`,
  });
  const product = products.data[0];
  if (!product) return null;

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) return null;

  return { product: product.id, price: price.id };
}

async function seed() {
  const catalog: Record<string, { productId: string; priceId: string; unitAmount: number; kind: string; tokens?: number }> = {};

  for (const plan of PLANS) {
    const existing = await findExistingPrice(plan.key);
    if (existing) {
      console.log(`Already exists: ${plan.key} -> ${existing.price}`);
      catalog[plan.key] = {
        productId: existing.product,
        priceId: existing.price,
        unitAmount: plan.unitAmount,
        kind: plan.kind,
        tokens: plan.tokens,
      };
      continue;
    }

    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: { plan_key: plan.key, kind: plan.kind, ...(plan.tokens ? { tokens: String(plan.tokens) } : {}) },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.unitAmount,
      currency: "usd",
      ...(plan.kind === "subscription" ? { recurring: { interval: "month" as const } } : {}),
    });

    console.log(`Created: ${plan.key} -> product ${product.id}, price ${price.id}`);
    catalog[plan.key] = {
      productId: product.id,
      priceId: price.id,
      unitAmount: plan.unitAmount,
      kind: plan.kind,
      tokens: plan.tokens,
    };
  }

  console.log("\n--- CATALOG JSON ---");
  console.log(JSON.stringify(catalog, null, 2));
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
