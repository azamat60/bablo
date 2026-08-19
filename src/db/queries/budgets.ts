import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { newMeta, touchMeta } from '@/db/meta';
import type { BudgetEntry } from '@/db/types';

export function useBudgets(): BudgetEntry[] {
  return useLiveQuery(() => db.budgets.toArray(), []) ?? [];
}

export async function setAssigned(month: string, categoryId: string, assigned: number): Promise<void> {
  const existing = await db.budgets.where('[month+categoryId]').equals([month, categoryId]).first();
  if (existing) {
    await db.budgets.update(existing.id, { assigned, ...touchMeta(existing.rev) });
    return;
  }
  const entry: BudgetEntry = { ...newMeta(), month, categoryId, assigned };
  await db.budgets.add(entry);
}
