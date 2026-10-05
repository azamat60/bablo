import { serviceClient } from "./server";
import { RequestError } from "./request";
export async function acquireAI(userId: string) {
  const client = serviceClient(),
    lease = crypto.randomUUID();
  const { data, error } = await client.rpc("acquire_ai_attempt", {
    p_user: userId,
    p_lease: lease,
  });
  if (error || !data)
    throw new RequestError(
      "Не удалось проверить лимит AI. Попробуйте позже.",
      503,
    );
  if (!data.allowed)
    return {
      retryAfter: Math.max(1, Number(data.retry_after) || 60),
      release: async () => {},
    };
  return {
    retryAfter: 0,
    release: async () => {
      const { error } = await client.rpc("release_ai_attempt", {
        p_user: userId,
        p_lease: lease,
      });
      if (error) console.error("AI lease release failed");
    },
  };
}
