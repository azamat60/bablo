import { env } from "cloudflare:workers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { RequestError, BUDGET_TIMEOUT } from "./request";

function setting(name: string) {
  return (
    (env as unknown as Record<string, string>)[name] || process.env[name] || ""
  );
}
export function publicAuthConfig() {
  return {
    url: setting("NEXT_PUBLIC_SUPABASE_URL"),
    key: setting("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}
export async function authClient() {
  const { url, key } = publicAuthConfig();
  if (!url || !key)
    throw new RequestError("Вход временно недоступен. Попробуйте позже.", 503);
  const jar = await cookies();
  return createServerClient(url, key, {
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            AbortSignal.timeout(BUDGET_TIMEOUT),
            ...(init?.signal ? [init.signal] : []),
          ]),
        }),
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value, options }) =>
          jar.set(name, value, options),
        );
      },
    },
  });
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new RequestError("Запрос отклонён.", 403);
}
export async function owner(request?: Request) {
  if (request && request.method !== "GET") checkOrigin(request);
  const client = await authClient();
  const { data, error } = await client.auth.getClaims();
  if (
    error &&
    ((error.status || 0) >= 500 || error.name === "AuthRetryableFetchError")
  )
    throw new RequestError(
      "Сервис входа временно недоступен. Повторите позже.",
      503,
    );
  if (error || !data?.claims.sub || data.claims.is_anonymous === true)
    throw new RequestError(
      "Войдите через Google, чтобы открыть свой бюджет.",
      401,
    );
  return {
    userId: data.claims.sub,
    email: String(data.claims.email || ""),
    client,
  };
}
export function serviceClient() {
  const { url } = publicAuthConfig(),
    key = setting("SUPABASE_SECRET_KEY");
  if (!url || !key)
    throw new RequestError(
      "AI временно недоступен. Ручной ввод работает.",
      503,
    );
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(BUDGET_TIMEOUT) }),
    },
  });
}
export const noStore = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
};
export function errorResponse(error: unknown) {
  if (error instanceof RequestError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: noStore },
    );
  return Response.json(
    {
      error: "Не удалось выполнить запрос. Проверьте подключение и повторите.",
    },
    { status: 503, headers: noStore },
  );
}
export const apiKey = () => setting("OPENAI_API_KEY");
export const model = () => setting("OPENAI_MODEL") || "gpt-5.4-mini";
