import { ApiError, readMultipart, validContext, withAiAttempt } from '../_lib/security.js';
import { toFile } from 'openai';
import { getOpenAIClient, jsonError, MissingApiKeyError } from '../_lib/openai.js';
import { AI_MODELS } from '../_lib/models.js';
import { parseToDraft } from '../_lib/parse.js';
import type { AiRequestContext } from '../_lib/types.js';

const EXTENSION_BY_TYPE: readonly [string, string][] = [
  ['audio/mp4', 'm4a'],
  ['audio/x-m4a', 'm4a'],
  ['audio/aac', 'aac'],
  ['audio/mpeg', 'mp3'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/webm', 'webm'],
];

function audioExtension(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return EXTENSION_BY_TYPE.find(([type]) => type === base)?.[1] ?? 'webm';
}

async function handlePost(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await readMultipart(request, 11534336);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return jsonError('Expected multipart/form-data', 400);
  }

  const audio = formData.get('audio');
  const contextRaw = formData.get('context');
  if (!(audio instanceof Blob)) return jsonError('audio file is required', 400);
  if (audio.size === 0 || audio.size > 10 * 1024 * 1024)
    return jsonError('Аудио должно быть от 1 байта до 10 МБ.', 413);
  if (!EXTENSION_BY_TYPE.some(([type]) => type === audio.type.split(';')[0]?.trim().toLowerCase()))
    return jsonError('Неподдерживаемый формат аудио.', 400);
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
    const buffer = Buffer.from(await audio.arrayBuffer());
    // iOS Safari records audio/mp4; the transcription endpoint sniffs by
    // extension, so the filename has to agree with the type.
    const type = audio.type || 'audio/webm';
    const file = await toFile(buffer, `voice.${audioExtension(type)}`, { type });
    const transcription = await client.audio.transcriptions.create({ file, model: AI_MODELS.transcribe });
    const transcript = transcription.text;
    const draft = await parseToDraft({ client, model: AI_MODELS.parse, context, text: transcript });
    return Response.json({ transcript, draft });
  } catch (err) {
    if (err instanceof MissingApiKeyError) return jsonError(err.message, 503);
    return jsonError('Failed to parse voice note', 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  return withAiAttempt(request, (signal) => handlePost(new Request(request, { signal })));
}
