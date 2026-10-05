import { owner, publicAuthConfig, errorResponse, noStore } from "@/lib/server";
import { RequestError } from "@/lib/request";

export async function GET() {
  const config = publicAuthConfig();
  if (!config.url || !config.key)
    return Response.json({ config: null, user: null }, { headers: noStore });
  try {
    const { userId, email } = await owner();
    return Response.json(
      { config, user: { id: userId, email } },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof RequestError && error.status === 401)
      return Response.json({ config, user: null }, { headers: noStore });
    return errorResponse(error);
  }
}
