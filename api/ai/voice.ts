import { toFile } from 'openai';
import { getOpenAIClient, jsonError, MissingApiKeyError } from '../_lib/openai';
import { AI_MODELS } from '../_lib/models';
import { parseToDraft } from '../_lib/parse';
import type { AiRequestContext } from '../_lib/types';

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError('Expected multipart/form-data', 400);
  }

  const audio = formData.get('audio');
  const contextRaw = formData.get('context');
  if (!(audio instanceof Blob)) return jsonError('audio file is required', 400);
  if (typeof contextRaw !== 'string') return jsonError('context is required', 400);

  let context: AiRequestContext;
  try {
    context = JSON.parse(contextRaw) as AiRequestContext;
  } catch {
    return jsonError('context must be valid JSON', 400);
  }

  try {
    const client = getOpenAIClient();
    const buffer = Buffer.from(await audio.arrayBuffer());
    const file = await toFile(buffer, 'voice.webm', { type: audio.type || 'audio/webm' });
    const transcription = await client.audio.transcriptions.create({ file, model: AI_MODELS.transcribe });
    const transcript = transcription.text;
    const draft = await parseToDraft({ client, model: AI_MODELS.parse, context, text: transcript });
    return Response.json({ transcript, draft });
  } catch (err) {
    if (err instanceof MissingApiKeyError) return jsonError(err.message, 503);
    console.error('[ai/voice]', err);
    return jsonError('Failed to parse voice note', 500);
  }
}
