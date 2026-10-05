import { budgetSchema, emptyBudget } from "@/lib/budget";
import { parseBudgetRequest } from "@/lib/budget-request";
import { owner, errorResponse, apiKey, noStore } from "@/lib/server";
import { RequestError } from "@/lib/request";

export async function GET() {
  try {
    const { userId, email, client } = await owner();
    const { data, error } = await client
      .from("budget_ledgers")
      .select("state,revision")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return Response.json(
      {
        state: data ? budgetSchema.parse(data.state) : emptyBudget(),
        revision: data?.revision ?? 0,
        aiReady: !!apiKey(),
        user: { id: userId, email },
      },
      { headers: noStore },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    const input = await parseBudgetRequest(request);
    const { userId, client } = await owner(request);
    const revision = input.revision + 1;
    const query =
      input.revision === 0
        ? client
            .from("budget_ledgers")
            .insert({ user_id: userId, state: input.state, revision })
        : client
            .from("budget_ledgers")
            .update({ state: input.state, revision })
            .eq("user_id", userId)
            .eq("revision", input.revision);
    const { data, error } = await query.select("revision").maybeSingle();
    if (error?.code === "23505" || (!error && !data))
      throw new RequestError(
        "Бюджет изменился в другом окне. Проверьте актуальную версию перед повторным сохранением.",
        409,
      );
    if (error?.code === "23514" && error.message.includes("state_check"))
      throw new RequestError("Слишком большой бюджет.", 413);
    if (error) throw error;
    if (!data) throw new RequestError("Версия не найдена.", 409);
    return Response.json({ revision: data.revision }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}
