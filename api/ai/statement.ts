import { ApiError, readMultipart, validContext, withAiAttempt } from '../_lib/security.js';
import { getOpenAIClient, jsonError, MissingApiKeyError } from '../_lib/openai.js';
import { AI_MODELS } from '../_lib/models.js';
import { parseStatement, STATEMENT_MAX_BYTES } from '../_lib/statement.js';
import type { AiRequestContext } from '../_lib/types.js';

// Long statements take well over the default function timeout.
export const maxDuration = 200;

async function handlePost(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await readMultipart(request, 5242880);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return jsonError('Expected multipart/form-data', 400);
  }

  const file = formData.get('file');
  const contextRaw = formData.get('context');
  if (!(file instanceof Blob)) return jsonError('file is required', 400);
  if (file.size === 0) return jsonError('Файл пуст.', 400);
  if (file.type && file.type !== 'application/pdf') return jsonError('file must be a PDF', 400);
  if (file.size > STATEMENT_MAX_BYTES) return jsonError('PDF is too large (max 4 MB)', 413);
  if ((await file.slice(0, 5).text()) !== '%PDF-') return jsonError('Файл не является PDF.', 400);
  if (typeof contextRaw !== 'string') return jsonError('context is required', 400);

  let context: AiRequestContext;
  try {
    context = JSON.parse(contextRaw) as AiRequestContext;
  } catch {
    return jsonError('context must be valid JSON', 400);
  }

  if (!validContext(context)) return jsonError('Invalid context', 400);
  try {
    const client = getOpenAIClient(request.signal);
    const pdfBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const filename = file instanceof File && file.name ? file.name : 'statement.pdf';
    const statement = await parseStatement({
      client,
      model: AI_MODELS.parseAccurate,
      context,
      filename,
      pdfBase64,
    });
    return Response.json({ statement });
  } catch (err) {
    if (err instanceof MissingApiKeyError) return jsonError(err.message, 503);
    return jsonError('Failed to parse statement', 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  return withAiAttempt(request, (signal) => handlePost(new Request(request, { signal })));
}
