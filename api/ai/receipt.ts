import { ApiError, readJson, validContext, withAiAttempt } from '../_lib/security.js';
import { getOpenAIClient, jsonError, MissingApiKeyError } from '../_lib/openai.js';
import { AI_MODELS } from '../_lib/models.js';
import { parseToDraft } from '../_lib/parse.js';
import type { AiRequestContext } from '../_lib/types.js';

type ReceiptRequestBody = {
  imageDataUrl: string;
  caption?: string;
  context: AiRequestContext;
};

async function handlePost(request: Request): Promise<Response> {
  let body: ReceiptRequestBody;
  try {
    body = (await readJson(request, 8 * 1024 * 1024)) as ReceiptRequestBody;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return jsonError('Invalid JSON body', 400);
  }
  if (
    !body ||
    typeof body !== 'object' ||
    typeof body.imageDataUrl !== 'string' ||
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.imageDataUrl)
  )
    return jsonError('imageDataUrl must be a data: image URL', 400);
  if (body.caption !== undefined && (typeof body.caption !== 'string' || body.caption.length > 20_000))
    return jsonError('Максимум 20 000 символов.', 400);
  if (!validContext(body.context)) return jsonError('Invalid context', 400);

  try {
    const client = getOpenAIClient(request.signal);
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
    return jsonError('Failed to parse receipt', 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  return withAiAttempt(request, (signal) => handlePost(new Request(request, { signal })));
}
