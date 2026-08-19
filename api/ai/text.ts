import { getOpenAIClient, jsonError, MissingApiKeyError } from '../_lib/openai';
import { AI_MODELS } from '../_lib/models';
import { parseToDraft } from '../_lib/parse';
import type { AiRequestContext } from '../_lib/types';

type TextRequestBody = {
  text: string;
  context: AiRequestContext;
};

export async function POST(request: Request): Promise<Response> {
  let body: TextRequestBody;
  try {
    body = (await request.json()) as TextRequestBody;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  if (!body.text?.trim()) return jsonError('text is required', 400);
  if (!body.context) return jsonError('context is required', 400);

  try {
    const client = getOpenAIClient();
    const draft = await parseToDraft({ client, model: AI_MODELS.parse, context: body.context, text: body.text });
    return Response.json({ draft });
  } catch (err) {
    if (err instanceof MissingApiKeyError) return jsonError(err.message, 503);
    console.error('[ai/text]', err);
    return jsonError('Failed to parse text', 500);
  }
}
