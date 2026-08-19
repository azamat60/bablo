import { db } from '@/db/db';
import { todayIsoDate } from '@/domain/transactions';
import type { AiDraft, AiRequestContext } from './aiTypes';

export async function buildAiContext(): Promise<AiRequestContext> {
  const [categories, payees, settings] = await Promise.all([
    db.categories.toArray(),
    db.payees.toArray(),
    db.settings.get('singleton'),
  ]);
  const groups = await db.categoryGroups.toArray();
  const groupKindById = new Map(groups.map((g) => [g.id, g.kind]));

  return {
    categories: categories
      .filter((c) => !c.archived)
      .map((c) => ({ id: c.id, name: c.name, kind: groupKindById.get(c.groupId) ?? 'expense' })),
    payees: payees.map((p) => p.name),
    baseCurrency: settings?.baseCurrency ?? 'USD',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    today: todayIsoDate(),
  };
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function parseReceipt(imageDataUrl: string, caption?: string): Promise<AiDraft> {
  const context = await buildAiContext();
  const response = await fetch('/api/ai/receipt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageDataUrl, caption, context }),
  });
  const { draft } = await readJsonOrThrow<{ draft: AiDraft }>(response);
  return draft;
}

export async function parseVoice(audioBlob: Blob): Promise<{ transcript: string; draft: AiDraft }> {
  const context = await buildAiContext();
  const formData = new FormData();
  formData.append('audio', audioBlob, 'voice.webm');
  formData.append('context', JSON.stringify(context));
  const response = await fetch('/api/ai/voice', { method: 'POST', body: formData });
  return readJsonOrThrow<{ transcript: string; draft: AiDraft }>(response);
}

export async function parseText(text: string): Promise<AiDraft> {
  const context = await buildAiContext();
  const response = await fetch('/api/ai/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, context }),
  });
  const { draft } = await readJsonOrThrow<{ draft: AiDraft }>(response);
  return draft;
}
