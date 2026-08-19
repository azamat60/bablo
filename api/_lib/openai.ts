import OpenAI from 'openai';

export class MissingApiKeyError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not configured on the server.');
    this.name = 'MissingApiKeyError';
  }
}

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  return new OpenAI({ apiKey });
}

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
