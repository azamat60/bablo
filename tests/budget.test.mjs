import test from "node:test";
import assert from "node:assert/strict";
import {
  budgetSchema,
  transactionSchema,
  balance,
  emptyBudget,
  demoBudget,
  duplicateKey,
  dateSchema,
} from "../lib/budget.ts";
test("balances stay exact in minor units and are isolated by wallet", () => {
  const b = emptyBudget();
  b.wallets = [
    { id: "a", name: "Карта", opening: 10000, color: "mint" },
    { id: "b", name: "Наличные", opening: 5000, color: "peach" },
  ];
  b.transactions = [
    {
      id: "1",
      name: "Кофе",
      amount: 101,
      type: "expense",
      date: "2026-09-11",
      category: "cafe",
      wallet: "a",
      source: "manual",
    },
    {
      id: "2",
      name: "Доход",
      amount: 222,
      type: "income",
      date: "2026-09-11",
      category: "other",
      wallet: "a",
      source: "manual",
    },
  ];
  assert.equal(balance(b, "a"), 10121);
  assert.equal(balance(b, "b"), 5000);
  assert.equal(balance(b), 15121);
});
test("reject impossible dates, fractional minor units, zero and unknown wallets", () => {
  assert.equal(dateSchema.safeParse("2026-02-30").success, false);
  assert.equal(dateSchema.safeParse("2024-02-29").success, true);
  const b = demoBudget();
  assert.equal(budgetSchema.safeParse(b).success, true);
  for (const amount of [0, -10, 1.5, Infinity])
    assert.equal(
      transactionSchema.safeParse({ ...b.transactions[0], amount }).success,
      false,
    );
  b.transactions[0].wallet = "missing";
  assert.equal(budgetSchema.safeParse(b).success, false);
});
test("duplicate ids cannot double-charge a ledger", () => {
  const b = demoBudget();
  b.transactions.push(b.transactions[0]);
  assert.equal(budgetSchema.safeParse(b).success, false);
});
test("duplicate candidates normalize merchant text, preserving wallet and direction", () => {
  const t = demoBudget().transactions[0];
  assert.equal(duplicateKey(t), duplicateKey({ ...t, name: " GLOBUS " }));
  assert.notEqual(duplicateKey(t), duplicateKey({ ...t, wallet: "cash" }));
  assert.notEqual(duplicateKey(t), duplicateKey({ ...t, type: "income" }));
});
