import { db } from '@/db/db';
import { todayIsoDate } from '@/domain/transactions';
import type { AiDraft, AiRequestContext, AiStatement } from './aiTypes';

export type AiContextOptions = {
  /** The group the user is already in; its categories are sent as preferred. */
  preferredGroupId?: string;
};

export async function buildAiContext(options: AiContextOptions = {}): Promise<AiRequestContext> {
  const [categories, payees, settings] = await Promise.all([
    db.categories.toArray(),
    db.payees.toArray(),
    db.settings.get('singleton'),
  ]);
  const groups = await db.categoryGroups.toArray();
  const groupKindById = new Map(groups.map((g) => [g.id, g.kind]));
  const live = categories.filter((c) => !c.archived);
  const preferredGroup = options.preferredGroupId ? groups.find((g) => g.id === options.preferredGroupId) : undefined;

  return {
    categories: live.map((c) => ({ id: c.id, name: c.name, kind: groupKindById.get(c.groupId) ?? 'expense' })),
    payees: payees.map((p) => p.name),
    baseCurrency: settings?.baseCurrency ?? 'USD',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    today: todayIsoDate(),
    ...(preferredGroup
      ? {
          preferredCategoryIds: live.filter((c) => c.groupId === preferredGroup.id).map((c) => c.id),
          preferredGroupName: preferredGroup.name,
        }
      : {}),
  };
}

/** File extension the server expects for a recorded blob's mime type. */
export function audioFileName(blob: Blob): string {
  const base = blob.type.split(';')[0]?.trim().toLowerCase() ?? '';
  const ext = base === 'audio/mp4' || base === 'audio/x-m4a' ? 'm4a' : base === 'audio/ogg' ? 'ogg' : 'webm';
  return `voice.${ext}`;
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function parseReceipt(
  imageDataUrl: string,
  caption?: string,
  options?: AiContextOptions,
): Promise<AiDraft> {
  const context = await buildAiContext(options);
  const response = await fetch('/api/ai/receipt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageDataUrl, caption, context }),
  });
  const { draft } = await readJsonOrThrow<{ draft: AiDraft }>(response);
  return draft;
}

export async function parseVoice(
  audioBlob: Blob,
  options?: AiContextOptions,
): Promise<{ transcript: string; draft: AiDraft }> {
  const context = await buildAiContext(options);
  const formData = new FormData();
  formData.append('audio', audioBlob, audioFileName(audioBlob));
  formData.append('context', JSON.stringify(context));
  const response = await fetch('/api/ai/voice', { method: 'POST', body: formData });
  return readJsonOrThrow<{ transcript: string; draft: AiDraft }>(response);
}

export async function parseText(text: string, options?: AiContextOptions): Promise<AiDraft> {
  const context = await buildAiContext(options);
  const response = await fetch('/api/ai/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, context }),
  });
  const { draft } = await readJsonOrThrow<{ draft: AiDraft }>(response);
  return draft;
}

export async function parseStatement(file: File, options?: AiContextOptions): Promise<AiStatement> {
  const context = await buildAiContext(options);
  const formData = new FormData();
  formData.append('file', file, file.name || 'statement.pdf');
  formData.append('context', JSON.stringify(context));
  const response = await fetch('/api/ai/statement', { method: 'POST', body: formData });
  const { statement } = await readJsonOrThrow<{ statement: AiStatement }>(response);
  return statement;
}
