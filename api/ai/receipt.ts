import { getOpenAIClient, jsonError, MissingApiKeyError } from '../_lib/openai';
import { AI_MODELS } from '../_lib/models';
import { parseToDraft } from '../_lib/parse';
import type { AiRequestContext } from '../_lib/types';

type ReceiptRequestBody = {
  imageDataUrl: string;
  caption?: string;
  context: AiRequestContext;
};

export async function POST(request: Request): Promise<Response> {
  let body: ReceiptRequestBody;
  try {
    body = (await request.json()) as ReceiptRequestBody;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  if (!body.imageDataUrl?.startsWith('data:image/')) return jsonError('imageDataUrl must be a data: image URL', 400);
  if (!body.context) return jsonError('context is required', 400);

  try {
    const client = getOpenAIClient();
    const draft = await parseToDraft({
      client,
      model: AI_MODELS.parse,
      context: body.context,
      text: body.caption,
      imageDataUrl: body.imageDataUrl,
    });
    return Response.json({ draft });
  } catch (err) {
    if (err instanceof MissingApiKeyError) return jsonError(err.message, 503);
    console.error('[ai/receipt]', err);
    return jsonError('Failed to parse receipt', 500);
  }
}
