import { serverVariable } from './environment.js';
import OpenAI from 'openai';

export class MissingApiKeyError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not configured on the server.');
    this.name = 'MissingApiKeyError';
  }
}

export function getOpenAIClient(signal?: AbortSignal): OpenAI {
  const apiKey = serverVariable('OPENAI_API_KEY');
  if (!apiKey) throw new MissingApiKeyError();
  return new OpenAI({
    apiKey,
    timeout: 180_000,
    maxRetries: 0,
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([...(signal ? [signal] : []), ...(init?.signal ? [init.signal] : [])]),
      }),
  });
}

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}
