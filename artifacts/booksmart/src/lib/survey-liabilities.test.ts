import assert from "node:assert/strict";
import test from "node:test";
import { liabilityBalanceEntries } from "./survey-liabilities";

test("only genuine liability balances are returned", () => {
  assert.deepEqual(liabilityBalanceEntries({
    credit_cards: 1200,
    sba_loans: 5000,
    phone_business_percent: 50,
    internet_business_percent: 70,
    owner_contribution_amount: 10000,
    onboarding_profile: { completed: true },
  }), [
    ["credit_cards", 1200],
    ["sba_loans", 5000],
  ]);
});
