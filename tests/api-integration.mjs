import assert from "node:assert/strict";
import { emptyBudget } from "../lib/budget.ts";
const origin = process.env.BABLO_TEST_URL || "http://localhost:5173";
const call = (path, init) =>
  fetch(new URL(path, origin), { ...init, redirect: "manual" });
assert.equal((await call("/api/budget")).status, 401);
assert.equal(
  (
    await call("/api/budget", {
      headers: {
        "oai-authenticated-user-id": "forged-owner",
        "oai-authenticated-user-email": "forged@example.invalid",
      },
    })
  ).status,
  401,
);
assert.equal(
  (await call("/api/budget", { method: "PUT", body: "null" })).status,
  400,
);
assert.equal(
  (
    await call("/api/budget", {
      method: "PUT",
      body: JSON.stringify({ state: emptyBudget(), revision: 0 }),
    })
  ).status,
  401,
);
assert.equal(
  (
    await call("/api/budget", {
      method: "PUT",
      headers: { Origin: "https://foreign.invalid" },
      body: JSON.stringify({ state: emptyBudget(), revision: 0 }),
    })
  ).status,
  403,
);
assert.equal(
  (await call("/api/budget", { method: "PUT", body: "я".repeat(1_500_001) }))
    .status,
  413,
);
assert.equal(
  (await call("/api/recognize", { method: "POST", body: new FormData() }))
    .status,
  401,
);
const callback = await call("/auth/callback");
assert.equal(callback.status, 303);
assert.equal(
  new URL(callback.headers.get("location")).searchParams.get("auth_error"),
  "1",
);
console.log(
  "Anonymous API, forged Sites headers, origin, null, UTF-8 limit and callback checks passed.",
);
