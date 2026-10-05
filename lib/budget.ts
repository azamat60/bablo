import { z } from "zod";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Некорректная дата",
  );
export const walletSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(60),
  opening: z.number().int().min(-1e12).max(1e12),
  color: z.enum(["mint", "peach", "violet"]),
});
export const categorySchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  limit: z.number().int().min(0).max(1e12),
});
export const transactionSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  amount: z.number().int().positive().max(1e12),
  type: z.enum(["expense", "income"]),
  date: dateSchema,
  category: z.string(),
  wallet: z.string(),
  source: z.enum(["manual", "ai", "import", "demo"]),
});
export const budgetSchema = z
  .object({
    wallets: z.array(walletSchema).max(30),
    categories: z.array(categorySchema).min(1).max(50),
    transactions: z.array(transactionSchema).max(10000),
  })
  .superRefine((s, ctx) => {
    if (
      !s.wallets.every((w) => Number.isSafeInteger(w.opening)) ||
      !s.transactions.every((t) => Number.isSafeInteger(t.amount))
    )
      return;
    const magnitude =
      s.wallets.reduce(
        (sum, w) => sum + BigInt(Math.abs(w.opening)),
        BigInt(0),
      ) + s.transactions.reduce((sum, t) => sum + BigInt(t.amount), BigInt(0));
    if (magnitude > BigInt(Number.MAX_SAFE_INTEGER))
      ctx.addIssue({
        code: "custom",
        message: "Общая сумма превышает безопасную точность тыйынов.",
      });
    for (const k of ["wallets", "categories", "transactions"] as const) {
      if (new Set(s[k].map((x) => x.id)).size !== s[k].length)
        ctx.addIssue({
          code: "custom",
          message: "Повторяющиеся идентификаторы",
        });
    }
    for (const t of s.transactions) {
      if (
        !s.wallets.some((w) => w.id === t.wallet) ||
        !s.categories.some((c) => c.id === t.category)
      )
        ctx.addIssue({
          code: "custom",
          message: "Неизвестный кошелёк или категория",
        });
    }
  });
export type Budget = z.infer<typeof budgetSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Wallet = z.infer<typeof walletSchema>;
export const defaultCategories = [
  { id: "food", name: "Продукты", color: "#b8e779", limit: 2000000 },
  { id: "cafe", name: "Кафе и рестораны", color: "#283c30", limit: 1200000 },
  { id: "shopping", name: "Покупки", color: "#b8abe7", limit: 1500000 },
  { id: "transport", name: "Транспорт", color: "#f5c792", limit: 800000 },
  { id: "home", name: "Дом и счета", color: "#95bdc9", limit: 2500000 },
  { id: "health", name: "Здоровье", color: "#e69baf", limit: 500000 },
  { id: "other", name: "Другое", color: "#b0b8aa", limit: 0 },
  { id: "salary", name: "Зарплата", color: "#79b79b", limit: 0 },
];
export const emptyBudget = (): Budget => ({
  wallets: [],
  categories: defaultCategories.map((c) => ({ ...c })),
  transactions: [],
});
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function demoBudget(): Budget {
  const month = today().slice(0, 7);
  return {
    wallets: [
      { id: "bank", name: "МБанк", opening: 2375000, color: "mint" },
      { id: "cash", name: "Наличные", opening: 1225000, color: "peach" },
      { id: "save", name: "Накопления", opening: 3000000, color: "violet" },
    ],
    categories: defaultCategories,
    transactions: [
      {
        id: "d1",
        name: "Globus",
        amount: 245000,
        type: "expense",
        date: today(),
        category: "food",
        wallet: "bank",
        source: "demo",
      },
      {
        id: "d2",
        name: "Sierra Coffee",
        amount: 45000,
        type: "expense",
        date: today(),
        category: "cafe",
        wallet: "bank",
        source: "demo",
      },
      {
        id: "d3",
        name: "Яндекс Go",
        amount: 23000,
        type: "expense",
        date: today(),
        category: "transport",
        wallet: "bank",
        source: "demo",
      },
      ...(
        [
          ["d4", "Продукты на неделю", 1000000, "food"],
          ["d5", "Кафе и рестораны", 815000, "cafe"],
          ["d6", "Покупки для дома", 630000, "shopping"],
          ["d7", "Поездки", 497000, "transport"],
        ] as const
      ).map(([id, name, amount, category]) => ({
        id,
        name,
        amount,
        category,
        type: "expense" as const,
        date: month + "-01",
        wallet: "bank",
        source: "demo" as const,
      })),
      {
        id: "d8",
        name: "Зарплата",
        amount: 9500000,
        type: "income",
        date: month + "-01",
        category: "salary",
        wallet: "bank",
        source: "demo",
      },
    ],
  };
}
export const money = (minor: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(
    minor / 100,
  );
export const balance = (b: Budget, id?: string) =>
  b.wallets
    .filter((w) => !id || w.id === id)
    .reduce((s, w) => s + w.opening, 0) +
  b.transactions
    .filter((t) => !id || t.wallet === id)
    .reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
export function duplicateKey(
  t: Pick<Transaction, "date" | "amount" | "wallet" | "type" | "name">,
) {
  return [
    t.date,
    t.amount,
    t.wallet,
    t.type,
    t.name.trim().toLocaleLowerCase(),
  ].join("|");
}
