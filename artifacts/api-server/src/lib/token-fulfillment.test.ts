import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { TOKEN_PACKAGES } from "./stripe-catalog";
import {
  fulfillTokenCheckout,
  validateTokenCheckout,
} from "./token-fulfillment";

function session(
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: "cs_test_booksmart",
    mode: "payment",
    payment_status: "paid",
    amount_total: TOKEN_PACKAGES.tokens_starter.unitAmount,
    metadata: {
      user_id: "38cd9b11-3861-4dce-8564-d6f020aec05a",
      package_key: "tokens_starter",
      tokens: "999999",
    },
    ...overrides,
  } as Stripe.Checkout.Session;
}

function lineItems(
  priceId = TOKEN_PACKAGES.tokens_starter.priceId,
  overrides: Partial<Stripe.LineItem> = {},
): Stripe.ApiList<Stripe.LineItem> {
  return {
    object: "list",
    url: "/v1/checkout/sessions/cs_test_booksmart/line_items",
    has_more: false,
    data: [
      {
        id: "li_test",
        object: "item",
        amount_total: TOKEN_PACKAGES.tokens_starter.unitAmount,
        quantity: 1,
        price: { id: priceId } as Stripe.Price,
        ...overrides,
      } as Stripe.LineItem,
    ],
  };
}

test("derives tokens from the server catalog rather than metadata.tokens", () => {
  const result = validateTokenCheckout(session(), lineItems());
  assert.equal(result.tokenPackage.tokens, 10);
});

test("rejects package metadata whose paid Price does not match", () => {
  assert.throws(
    () => validateTokenCheckout(
      session(),
      lineItems(TOKEN_PACKAGES.tokens_growth.priceId),
    ),
    /Price does not match/,
  );
});

test("rejects unpaid, wrong-mode, wrong-amount, and multi-item Sessions", () => {
  assert.throws(
    () => validateTokenCheckout(
      session({ payment_status: "unpaid" }),
      lineItems(),
    ),
    /not paid/,
  );
  assert.throws(
    () => validateTokenCheckout(
      session({ mode: "subscription" }),
      lineItems(),
    ),
    /not a payment/,
  );
  assert.throws(
    () => validateTokenCheckout(session(), lineItems(undefined, { amount_total: 1 })),
    /amount does not match/,
  );
  const items = lineItems();
  items.has_more = true;
  assert.throws(
    () => validateTokenCheckout(session(), items),
    /unexpected line items/,
  );
});

test("webhook/confirm retries invoke one atomic RPC and return idempotent success", async () => {
  let applied = false;
  let rpcCalls = 0;
  const stripe = {
    checkout: {
      sessions: {
        listLineItems: async () => lineItems(),
      },
    },
  } as unknown as Stripe;
  const admin = {
    rpc: async () => {
      rpcCalls += 1;
      if (!applied) {
        applied = true;
        return {
          data: {
            applied: true,
            balance_after: 110,
            tokens_added: 10,
          },
          error: null,
        };
      }
      return {
        data: {
          applied: false,
          reason: "already_fulfilled",
          balance_after: 110,
          tokens_added: 0,
        },
        error: null,
      };
    },
  };

  const first = await fulfillTokenCheckout(
    stripe,
    admin as never,
    session(),
  );
  const retry = await fulfillTokenCheckout(
    stripe,
    admin as never,
    session(),
  );

  assert.equal(first.status, "tokens_granted");
  assert.equal(first.tokensAdded, 10);
  assert.equal(retry.status, "already_fulfilled");
  assert.equal(retry.tokensAdded, 0);
  assert.equal(rpcCalls, 2);
});

test("concurrent webhook and confirmation calls rely on the same atomic RPC", async () => {
  let applied = false;
  const stripe = {
    checkout: {
      sessions: {
        listLineItems: async () => lineItems(),
      },
    },
  } as unknown as Stripe;
  const admin = {
    rpc: async () => {
      await new Promise((resolve) => setImmediate(resolve));
      if (!applied) {
        applied = true;
        return {
          data: { applied: true, balance_after: 10, tokens_added: 10 },
          error: null,
        };
      }
      return {
        data: {
          applied: false,
          reason: "already_fulfilled",
          balance_after: 10,
          tokens_added: 0,
        },
        error: null,
      };
    },
  };

  const results = await Promise.all([
    fulfillTokenCheckout(stripe, admin as never, session()),
    fulfillTokenCheckout(stripe, admin as never, session()),
  ]);

  assert.deepEqual(
    results.map((result) => result.status).sort(),
    ["already_fulfilled", "tokens_granted"],
  );
});
