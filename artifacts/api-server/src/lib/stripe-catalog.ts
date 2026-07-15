export type PlanKey = "plus" | "pro";
export type TokenPackageKey = "tokens_starter" | "tokens_growth" | "tokens_business" | "tokens_professional";

export const SUBSCRIPTION_PLANS: Record<PlanKey, { priceId: string; productId: string; unitAmount: number; name: string }> = {
  plus: {
    priceId: "price_1TrJ2tR4UE6mIdzmlOTFuFjx",
    productId: "prod_Ur15PnhOG6rdcK",
    unitAmount: 999,
    name: "BookSmart Plus",
  },
  pro: {
    priceId: "price_1TrJ2uR4UE6mIdzmjbqzGmaj",
    productId: "prod_Ur15I9U5bzIdQc",
    unitAmount: 1999,
    name: "BookSmart Pro",
  },
};

export const TOKEN_PACKAGES: Record<TokenPackageKey, { priceId: string; productId: string; unitAmount: number; tokens: number; name: string }> = {
  tokens_starter: {
    priceId: "price_1TrJ2uR4UE6mIdzm6aaspTOw",
    productId: "prod_Ur15m8NLVFJiF7",
    unitAmount: 1000,
    tokens: 10,
    name: "10 Tokens",
  },
  tokens_growth: {
    priceId: "price_1TrJ2vR4UE6mIdzm5QN9BzWJ",
    productId: "prod_Ur15J9k9m8QhTa",
    unitAmount: 2500,
    tokens: 25,
    name: "25 Tokens",
  },
  tokens_business: {
    priceId: "price_1TrJ2vR4UE6mIdzmY60U7vYD",
    productId: "prod_Ur15cmvY4M0zu6",
    unitAmount: 5000,
    tokens: 50,
    name: "50 Tokens",
  },
  tokens_professional: {
    priceId: "price_1TrJ2wR4UE6mIdzmBEgVTPd9",
    productId: "prod_Ur15fATg3c7oVJ",
    unitAmount: 10000,
    tokens: 100,
    name: "100 Tokens",
  },
};

export function findPlanByPriceId(priceId: string): { kind: "subscription"; key: PlanKey } | { kind: "token_package"; key: TokenPackageKey } | null {
  for (const [key, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
    if (plan.priceId === priceId) return { kind: "subscription", key: key as PlanKey };
  }
  for (const [key, pkg] of Object.entries(TOKEN_PACKAGES)) {
    if (pkg.priceId === priceId) return { kind: "token_package", key: key as TokenPackageKey };
  }
  return null;
}
