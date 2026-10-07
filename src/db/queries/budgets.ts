import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { newMeta, touchMeta } from '@/db/meta';
import type { BudgetEntry } from '@/db/types';

export function useBudgets(): BudgetEntry[] {
  return useLiveQuery(() => db.budgets.filter((entry) => !entry.deleted).toArray(), []) ?? [];
}

export async function setAssigned(month: string, categoryId: string, assigned: number): Promise<void> {
  await db.transaction('rw', [db.budgets, db.categories, db.categoryGroups], async () => {
    const category = await db.categories.get(categoryId);
    const group = category ? await db.categoryGroups.get(category.groupId) : undefined;
    if (!category || category.deleted || category.archived || !group || group.deleted || group.archived)
      throw new Error('Выберите доступную категорию.');
    const existing = await db.budgets.where('[month+categoryId]').equals([month, categoryId]).first();
    if (existing) {
      await db.budgets.update(existing.id, { assigned, deleted: false, ...touchMeta(existing.rev) });
      return;
    }
    const entry: BudgetEntry = { ...newMeta(), month, categoryId, assigned };
    await db.budgets.add(entry);
  });
}
