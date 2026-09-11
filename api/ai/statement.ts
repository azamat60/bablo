import { getOpenAIClient, jsonError, MissingApiKeyError } from '../_lib/openai';
import { AI_MODELS } from '../_lib/models';
import { parseStatement, STATEMENT_MAX_BYTES } from '../_lib/statement';
import type { AiRequestContext } from '../_lib/types';

// Long statements take well over the default function timeout.
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError('Expected multipart/form-data', 400);
  }

  const file = formData.get('file');
  const contextRaw = formData.get('context');
  if (!(file instanceof Blob)) return jsonError('file is required', 400);
  if (file.type && file.type !== 'application/pdf') return jsonError('file must be a PDF', 400);
  if (file.size > STATEMENT_MAX_BYTES) return jsonError('PDF is too large (max 4 MB)', 413);
  if (typeof contextRaw !== 'string') return jsonError('context is required', 400);

  let context: AiRequestContext;
  try {
    context = JSON.parse(contextRaw) as AiRequestContext;
  } catch {
    return jsonError('context must be valid JSON', 400);
  }

  try {
    const client = getOpenAIClient();
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
    console.error('[ai/statement]', err);
    return jsonError('Failed to parse statement', 500);
  }
}
