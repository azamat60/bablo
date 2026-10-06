import { ApiError, readJson, validContext, withAiAttempt } from '../_lib/security.js';
import { getOpenAIClient, jsonError, MissingApiKeyError } from '../_lib/openai.js';
import { AI_MODELS } from '../_lib/models.js';
import { parseToDraft } from '../_lib/parse.js';
import type { AiRequestContext } from '../_lib/types.js';

type TextRequestBody = {
  text: string;
  context: AiRequestContext;
};

async function handlePost(request: Request): Promise<Response> {
  let body: TextRequestBody;
  try {
    body = (await readJson(request, 512 * 1024)) as TextRequestBody;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return jsonError('Invalid JSON body', 400);
  }
  if (!body || typeof body !== 'object' || typeof body.text !== 'string' || !body.text.trim())
    return jsonError('text is required', 400);
  if (body.text.length > 20_000) return jsonError('Максимум 20 000 символов.', 400);
  if (!validContext(body.context)) return jsonError('Invalid context', 400);

  try {
    const client = getOpenAIClient(request.signal);
    const draft = await parseToDraft({ client, model: AI_MODELS.parse, context: body.context, text: body.text });
    return Response.json({ draft });
  } catch (err) {
    if (err instanceof MissingApiKeyError) return jsonError(err.message, 503);
    return jsonError('Failed to parse text', 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  return withAiAttempt(request, (signal) => handlePost(new Request(request, { signal })));
}
