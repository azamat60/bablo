import { db } from '@/db/db';
import { newMeta } from '@/db/meta';
import type { Payee } from '@/db/types';

export async function upsertPayee(name: string, defaultCategoryId?: string): Promise<string> {
  const trimmed = name.trim();
  const existing = await db.payees.where('name').equalsIgnoreCase(trimmed).first();
  if (existing) return existing.id;
  const payee: Payee = { ...newMeta(), name: trimmed, defaultCategoryId, aliases: [] };
  await db.payees.add(payee);
  return payee.id;
}
