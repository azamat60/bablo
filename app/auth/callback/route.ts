import { authClient, noStore } from "@/lib/server";

export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code");
  let success = false;
  if (code && !url.searchParams.has("error")) {
    try {
      const client = await authClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      success = !error;
    } catch {
      /* Redirect exposes no provider details or tokens. */
    }
  }
  return new Response(null, {
    status: 303,
    headers: {
      ...noStore,
      Location: new URL(success ? "/" : "/?auth_error=1", url.origin).href,
    },
  });
}
