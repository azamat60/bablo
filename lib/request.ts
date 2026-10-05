export const BUDGET_BYTES = 3_000_000;
export const BUDGET_TIMEOUT = 15_000;
export const AI_TIMEOUT = 200_000;

export class RequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function limitedText(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new RequestError("Слишком большой запрос.", 413);
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0,
    result = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestError("Слишком большой запрос.", 413);
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function requestJSON<T>(
  url: string,
  init: RequestInit,
  timeout: number,
): Promise<T> {
  const deadline = AbortSignal.timeout(timeout);
  const signal = AbortSignal.any([
    deadline,
    ...(init.signal ? [init.signal] : []),
  ]);
  try {
    const response = await fetch(url, { ...init, signal, cache: "no-store" });
    const data = (await response.json()) as { error?: string };
    if (!response.ok)
      throw new RequestError(
        data.error || "Не удалось выполнить запрос.",
        response.status,
      );
    return data as T;
  } catch (error) {
    if (deadline.aborted && !init.signal?.aborted)
      throw new DOMException(
        "Сервер не ответил вовремя. Проверьте соединение и повторите.",
        "TimeoutError",
      );
    if (error instanceof TypeError)
      throw new Error("Нет подключения к серверу. Проверьте сеть и повторите.");
    throw error;
  }
}

export async function limitedBytes(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new RequestError("Максимальный размер файла — 10 МБ.", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      request.signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestError("Максимальный размер файла — 10 МБ.", 413);
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
    offset += chunk.byteLength;
  }
  return bytes;
}
