import { z } from "zod";
import { budgetSchema } from "./budget.ts";
import { BUDGET_BYTES, limitedText, RequestError } from "./request.ts";

const schema = z.object({
  state: budgetSchema,
  revision: z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER - 1),
});
export async function parseBudgetRequest(request: Request) {
  const raw = await limitedText(request, BUDGET_BYTES);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new RequestError("Некорректный JSON.", 400);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new RequestError(parsed.error.issues[0].message, 400);
  return parsed.data;
}
