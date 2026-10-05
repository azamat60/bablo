import { serverVariable } from './environment.js';
import { createClient } from '@supabase/supabase-js';
export class ApiError extends Error {
  status: number;
  retryAfter?: number;
  constructor(message: string, status = 400, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
export const noStore = { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' };
export function apiError(error: unknown) {
  const known = error instanceof ApiError;
  const headers: Record<string, string> = { ...noStore };
  if (known && error.retryAfter) headers['Retry-After'] = String(error.retryAfter);
  return Response.json(
    { error: known ? error.message : 'Не удалось выполнить запрос. Повторите позже.' },
    { status: known ? error.status : 503, headers },
  );
}
const config = () => ({
  url: serverVariable('SUPABASE_URL') || serverVariable('VITE_SUPABASE_URL') || '',
  key: serverVariable('SUPABASE_PUBLISHABLE_KEY') || serverVariable('VITE_SUPABASE_ANON_KEY') || '',
});
const serverFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(init?.signal ? [init.signal] : [])]),
  });
export async function owner(request: Request) {
  const origin = request.headers.get('origin');
  if (request.method !== 'GET' && origin && origin !== new URL(request.url).origin)
    throw new ApiError('Запрос отклонён.', 403);
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new ApiError('Войдите через Google.', 401);
  const { url, key } = config();
  if (!url || !key) throw new ApiError('Сервис входа пока не настроен.', 503);
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: serverFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error && ((error.status ?? 0) >= 500 || error.name === 'AuthRetryableFetchError'))
    throw new ApiError('Сервис входа временно недоступен.', 503);
  if (error || !data?.claims.sub || data.claims.is_anonymous === true)
    throw new ApiError('Сессия истекла. Войдите через Google.', 401);
  return { userId: data.claims.sub, client };
}
async function readBytes(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get('content-length')) > limit) throw new ApiError('Превышен размер запроса.', 413);
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = request.body?.getReader();
  if (!reader) throw new ApiError('Тело запроса отсутствует.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      if (request.signal.aborted) throw new ApiError('Запрос отменён.', 408);
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError('Превышен размер запроса.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function readJson(request: Request, limit: number): Promise<unknown> {
  const bytes = await readBytes(request, limit);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError('Неверный JSON.');
  }
}
export async function readMultipart(request: Request, limit: number): Promise<FormData> {
  const bytes = await readBytes(request, limit);
  try {
    return await new Request(request.url, { method: 'POST', headers: request.headers, body: bytes }).formData();
  } catch {
    throw new ApiError('Ожидается multipart/form-data.');
  }
}
export async function withAiAttempt(request: Request, run: (signal: AbortSignal) => Promise<Response>) {
  let release: (() => Promise<void>) | undefined;
  try {
    const { userId } = await owner(request);
    const { url } = config();
    const key = serverVariable('SUPABASE_SECRET_KEY');
    if (!key) throw new ApiError('AI пока не настроен. Ручной ввод работает.', 503);
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: serverFetch },
    });
    const lease = crypto.randomUUID();
    const attempt = await admin.rpc('acquire_ai_attempt', { p_user: userId, p_lease: lease });
    if (attempt.error) throw new ApiError('Не удалось проверить лимиты AI.', 503);
    const quota: unknown = attempt.data;
    if (!isRecord(quota) || typeof quota.allowed !== 'boolean')
      throw new ApiError('Неверный ответ сервиса лимитов.', 503);
    if (!quota.allowed)
      throw new ApiError(
        'Лимит AI исчерпан. Попробуйте позже.',
        429,
        Math.max(1, typeof quota.retry_after === 'number' ? quota.retry_after : 60),
      );
    release = async () => {
      await admin.rpc('release_ai_attempt', { p_user: userId, p_lease: lease });
    };
    const response = await run(AbortSignal.any([request.signal, AbortSignal.timeout(210_000)]));
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(noStore)) headers.set(k, v);
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    return apiError(error);
  } finally {
    if (release) await release().catch(() => {});
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function validContext(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const context = value;
  return (
    typeof context.baseCurrency === 'string' &&
    /^[A-Z]{3,4}$/.test(context.baseCurrency) &&
    typeof context.today === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(context.today) &&
    typeof context.timezone === 'string' &&
    context.timezone.length <= 100 &&
    (context.preferredGroupName === undefined ||
      (typeof context.preferredGroupName === 'string' && context.preferredGroupName.length <= 200)) &&
    (context.preferredCategoryIds === undefined ||
      (Array.isArray(context.preferredCategoryIds) &&
        context.preferredCategoryIds.length <= 2000 &&
        context.preferredCategoryIds.every((id: unknown) => typeof id === 'string' && id.length <= 200))) &&
    Array.isArray(context.categories) &&
    context.categories.length <= 2000 &&
    context.categories.every(
      (item: unknown) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        item.id.length <= 200 &&
        typeof item.name === 'string' &&
        item.name.length <= 200 &&
        (item.kind === 'income' || item.kind === 'expense'),
    ) &&
    Array.isArray(context.payees) &&
    context.payees.length <= 5000 &&
    context.payees.every((item: unknown) => typeof item === 'string' && item.length <= 200)
  );
}
