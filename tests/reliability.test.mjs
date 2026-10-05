import test from "node:test";
import assert from "node:assert/strict";
import {
  budgetSchema,
  demoBudget,
  emptyBudget,
  duplicateKey,
  balance,
} from "../lib/budget.ts";
import { checkDuplicates, editReview } from "../lib/import-review.ts";
import { parseBudgetRequest } from "../lib/budget-request.ts";
import {
  parseImportForm,
  fileError,
  FILE_ACCEPT,
} from "../lib/import-input.ts";
import { BudgetSync } from "../lib/budget-sync.ts";
import { Microphone } from "../lib/microphone.ts";
import { RequestError } from "../lib/request.ts";
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const snapshot = (state, revision) => ({
  state,
  revision,
  aiReady: true,
  user: { id: "a" },
});
const review = (t) => ({
  ...t,
  currency: "KGS",
  confidence: "high",
  note: "",
  selected: true,
  duplicate: false,
});

test("editing wallet/amount/date/name/direction recalculates duplicates; override expires with key", () => {
  const t = demoBudget().transactions[0];
  const candidate = review({ ...t, id: "candidate", wallet: "cash" });
  let rows = editReview([candidate], candidate.id, { wallet: t.wallet }, [t]);
  assert.equal(rows[0].duplicate, true);
  assert.equal(rows[0].selected, false);
  rows = editReview(rows, candidate.id, { selected: true }, [t]);
  assert.equal(rows[0].selected, true);
  rows = editReview(rows, candidate.id, { amount: t.amount + 1 }, [t]);
  assert.equal(rows[0].confirmedKey, undefined);
  rows = editReview(rows, candidate.id, { amount: t.amount }, [t]);
  assert.equal(rows[0].selected, false);
  for (const patch of [
    { name: "other" },
    { date: "2026-10-01" },
    { type: "income" },
  ]) {
    assert.notEqual(duplicateKey(t), duplicateKey({ ...t, ...patch }));
  }
});
test("file duplicates and foreign currency cannot bypass final duplicate check", () => {
  const t = demoBudget().transactions[0];
  const rows = checkDuplicates(
    [
      { ...review({ ...t, id: "a" }), currency: "USD" },
      review({ ...t, id: "b" }),
      review({ ...t, id: "c" }),
    ],
    [],
  );
  assert.deepEqual(
    rows.map((r) => r.selected),
    [false, true, false],
  );
  assert.equal(checkDuplicates([review(t)], [t])[0].selected, false);
});
test("null/malformed budget fails with 400; UTF-8 streaming limit returns 413", async () => {
  for (const body of [
    "null",
    "{",
    "{}",
    JSON.stringify({ state: emptyBudget(), revision: -1 }),
  ])
    await assert.rejects(
      parseBudgetRequest(
        new Request("https://a/api/budget", { method: "PUT", body }),
      ),
      (e) => e.status === 400,
    );
  await assert.rejects(
    parseBudgetRequest(
      new Request("https://a/api/budget", {
        method: "PUT",
        body: "я".repeat(1_500_001),
      }),
    ),
    (e) => e.status === 413,
  );
  const parsed = await parseBudgetRequest(
    new Request("https://a/api/budget", {
      method: "PUT",
      body: JSON.stringify({ state: emptyBudget(), revision: 0 }),
    }),
  );
  assert.equal(parsed.revision, 0);
});
test("20 001 characters fail without truncation; client/server formats agree", () => {
  const form = new FormData();
  form.set("text", "я".repeat(20_001));
  form.set("date", "2026-10-05");
  form.set("categories", JSON.stringify([{ id: "a", name: "A" }]));
  assert.throws(
    () => parseImportForm(form),
    (e) => e.status === 400,
  );
  form.set("text", "я".repeat(20_000));
  assert.equal(parseImportForm(form).text.length, 20_000);
  assert.equal(fileError({ name: "voice.aac", size: 1 }).length > 0, true);
  assert.equal(FILE_ACCEPT.includes("audio/*"), false);
});
test("money rejects aggregate overflow, retains one tyiyn and negative opening", () => {
  const b = demoBudget();
  b.wallets[0].opening = -1;
  b.transactions = [{ ...b.transactions[0], amount: 1 }];
  assert.equal(budgetSchema.safeParse(b).success, true);
  assert.equal(balance(b, "bank"), -2);
  b.transactions = Array.from({ length: 10000 }, (_, i) => ({
    ...b.transactions[0],
    id: String(i),
    amount: 999999999999,
  }));
  assert.equal(budgetSchema.safeParse(b).success, false);
});
test("late GET cannot overwrite successful PUT", async () => {
  const late = deferred();
  let reads = 0;
  const initial = demoBudget();
  const sync = new BudgetSync(
    {
      get: async () => (++reads === 1 ? snapshot(initial, 1) : late.promise),
      put: async () => ({ revision: 2 }),
    },
    "a",
  );
  await sync.load();
  const loading = sync.load();
  const next = { ...initial, transactions: [] };
  assert.equal(await sync.commit(next), true);
  late.resolve(snapshot(initial, 1));
  await loading;
  assert.equal(sync.getSnapshot().revision, 2);
  assert.deepEqual(sync.getSnapshot().state, next);
  sync.dispose();
});
test("409 merges unrelated entries and exposes same-entry conflicts, preserving draft", async () => {
  const base = demoBudget(),
    changed = structuredClone(base),
    mine = structuredClone(base);
  changed.transactions[0].name = "Другой экран";
  changed.transactions[1].name = "Чужое изменение";
  mine.transactions[0].name = "Мой черновик";
  let reads = 0,
    puts = 0;
  const sync = new BudgetSync(
    {
      get: async () => snapshot(++reads === 1 ? base : changed, reads),
      put: async () => {
        if (++puts === 1) throw new RequestError("conflict", 409);
        return { revision: 3 };
      },
    },
    "a",
  );
  await sync.load();
  assert.equal(await sync.commit(mine), false);
  const conflict = sync.getSnapshot().conflict;
  assert.equal(conflict.names.length, 1);
  assert.equal(conflict.proposed.transactions[1].name, "Чужое изменение");
  assert.equal(await sync.retryConflict(), true);
  assert.equal(sync.getSnapshot().state.transactions[0].name, "Мой черновик");
  sync.dispose();
});
test("lost PUT response reconciles before retry; no second write after confirmed success", async () => {
  const base = demoBudget(),
    mine = { ...base, transactions: [] };
  let reads = 0,
    puts = 0;
  const sync = new BudgetSync(
    {
      get: async () => {
        reads++;
        if (reads === 2) throw Error("offline");
        return snapshot(reads === 1 ? base : mine, reads === 1 ? 1 : 2);
      },
      put: async () => {
        puts++;
        throw Error("response lost");
      },
    },
    "a",
  );
  await sync.load();
  assert.equal(await sync.commit(mine), false);
  assert.equal(await sync.commit(mine), true);
  assert.equal(puts, 1);
  sync.dispose();
});
test("microphone double start, close during permission, and close recording leave no tracks", async () => {
  const permission = deferred();
  let requests = 0,
    stopped = 0,
    delivered = 0,
    recorders = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  const create = () => ({
    state: "inactive",
    mimeType: "audio/webm",
    start() {
      this.state = "recording";
    },
    stop() {
      this.state = "inactive";
      this.onstop?.();
    },
  });
  const mic = new Microphone(
    {
      getUserMedia: () => {
        requests++;
        return permission.promise;
      },
      recorder: () => {
        recorders++;
        return create();
      },
      file: (chunks) => new File(chunks, "voice.webm"),
    },
    () => {},
    () => delivered++,
  );
  const first = mic.toggle();
  await mic.toggle();
  assert.equal(requests, 1);
  mic.cancel();
  permission.resolve(stream);
  await first;
  assert.equal(recorders, 0);
  assert.equal(stopped, 1);
  assert.equal(delivered, 0);
  await mic.toggle();
  assert.equal(mic.state, "recording");
  mic.cancel();
  assert.equal(stopped, 2);
  assert.equal(delivered, 0);
});
test("microphone auto-stops at 60 seconds and releases tracks; denial resets idle", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let stopped = 0;
  const recorder = {
    state: "inactive",
    mimeType: "audio/webm",
    start() {
      this.state = "recording";
    },
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["audio"]) });
      this.onstop?.();
    },
  };
  let delivered = 0;
  const mic = new Microphone(
    {
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => stopped++ }],
      }),
      recorder: () => recorder,
      file: (chunks) => new File(chunks, "voice.webm"),
    },
    () => {},
    () => delivered++,
  );
  await mic.toggle();
  t.mock.timers.tick(60_000);
  assert.equal(stopped, 1);
  assert.equal(delivered, 1);
  assert.equal(mic.state, "idle");
  const denied = new Microphone(
    {
      getUserMedia: async () => {
        throw Error("denied");
      },
    },
    () => {},
    () => {},
  );
  await assert.rejects(denied.toggle());
  assert.equal(denied.state, "idle");
});
test("changed draft after an uncertain save is preserved after reconciliation", async () => {
  const base = demoBudget(),
    first = structuredClone(base),
    second = structuredClone(base);
  first.transactions[0].name = "first";
  second.transactions[0].name = "second";
  let reads = 0,
    puts = 0;
  const sync = new BudgetSync(
    {
      get: async () => {
        if (++reads === 2) throw Error("offline");
        return snapshot(reads === 1 ? base : first, reads === 1 ? 1 : 2);
      },
      put: async () => {
        if (++puts === 1) throw Error("lost");
        return { revision: 3 };
      },
    },
    "a",
  );
  await sync.load();
  assert.equal(await sync.commit(first), false);
  assert.equal(await sync.commit(second), true);
  assert.equal(sync.getSnapshot().state.transactions[0].name, "second");
  assert.equal(puts, 2);
  sync.dispose();
});
test("invalid fractional and non-finite aggregate amounts return validation errors", () => {
  for (const amount of [1.5, Infinity, NaN]) {
    const b = demoBudget();
    b.transactions[0].amount = amount;
    assert.equal(budgetSchema.safeParse(b).success, false);
  }
});
test("expired session clears budget; unmounted session ignores late writes", async () => {
  const late = deferred(),
    b = demoBudget();
  let reads = 0;
  const sync = new BudgetSync(
    {
      get: async () => {
        if (++reads > 1) throw new RequestError("expired", 401);
        return snapshot(b, 1);
      },
      put: async () => late.promise,
    },
    "a",
  );
  await sync.load();
  await sync.load();
  assert.equal(sync.getSnapshot().state.transactions.length, 0);
  assert.equal(sync.getSnapshot().authExpired, true);
  const second = new BudgetSync(
    { get: async () => snapshot(b, 1), put: async () => late.promise },
    "a",
  );
  await second.load();
  const saving = second.commit({ ...b, transactions: [] });
  second.dispose();
  late.resolve({ revision: 2 });
  assert.equal(await saving, false);
  assert.equal(second.getSnapshot().revision, 1);
});
test("HTTP requests time out and cancel through the caller signal", async (t) => {
  const { requestJSON } = await import("../lib/request.ts");
  t.mock.method(
    globalThis,
    "fetch",
    (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      ),
  );
  const [timed] = await Promise.allSettled([
    requestJSON("/api/budget", {}, 5),
    new Promise((resolve) => setTimeout(resolve, 20)),
  ]);
  assert.equal(timed.status, "rejected");
  assert.equal(timed.reason.name, "TimeoutError");
  assert.match(timed.reason.message, /Сервер/);
  const controller = new AbortController();
  const waiting = requestJSON(
    "/api/recognize",
    { signal: controller.signal },
    200000,
  );
  controller.abort();
  await assert.rejects(waiting, (e) => e.name === "AbortError");
});
