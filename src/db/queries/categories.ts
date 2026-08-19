import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { newMeta, touchMeta } from '@/db/meta';
import type { Bucket, Category, CategoryGroup, CategoryGroupKind } from '@/db/types';

export type CategoryGroupWithCategories = CategoryGroup & { categories: Category[] };

export function useCategoryGroups(includeArchived = false): CategoryGroupWithCategories[] {
  return (
    useLiveQuery(async () => {
      const [groups, categories] = await Promise.all([
        db.categoryGroups.orderBy('order').toArray(),
        db.categories.orderBy('order').toArray(),
      ]);
      return groups
        .filter((group) => includeArchived || !group.archived)
        .map((group) => ({
          ...group,
          categories: categories.filter(
            (category) => category.groupId === group.id && (includeArchived || !category.archived),
          ),
        }));
    }, [includeArchived]) ?? []
  );
}

export type NewGroupInput = {
  name: string;
  kind: CategoryGroupKind;
  bucket?: Bucket;
  color: string;
};

export async function createCategoryGroup(input: NewGroupInput): Promise<string> {
  const order = await db.categoryGroups.count();
  const group: CategoryGroup = { ...newMeta(), ...input, order, archived: false };
  await db.categoryGroups.add(group);
  return group.id;
}

export type NewCategoryInput = {
  groupId: string;
  name: string;
  icon: string;
  color: string;
  bucket?: Bucket;
};

export async function createCategory(input: NewCategoryInput): Promise<string> {
  const order = await db.categories.where('groupId').equals(input.groupId).count();
  const category: Category = { ...newMeta(), ...input, order, archived: false, isSystem: false };
  await db.categories.add(category);
  return category.id;
}

export type CategoryPatch = Partial<Pick<Category, 'name' | 'icon' | 'color' | 'bucket' | 'monthlyLimit' | 'goal'>>;

export async function updateCategory(id: string, patch: CategoryPatch): Promise<void> {
  const category = await db.categories.get(id);
  if (!category) return;
  await db.categories.update(id, { ...patch, ...touchMeta(category.rev) });
}

export async function archiveCategory(id: string): Promise<void> {
  const category = await db.categories.get(id);
  if (!category || category.isSystem) return;
  await db.categories.update(id, { archived: true, ...touchMeta(category.rev) });
}

export async function deleteCategoryIfUnused(id: string): Promise<'deleted' | 'archived' | 'blocked'> {
  const category = await db.categories.get(id);
  if (!category || category.isSystem) return 'blocked';
  const usedByTransaction = await db.transactions.where('categoryId').equals(id).count();
  const usedByBudget = await db.budgets.where('categoryId').equals(id).count();
  if (usedByTransaction > 0 || usedByBudget > 0) {
    await archiveCategory(id);
    return 'archived';
  }
  await db.categories.delete(id);
  return 'deleted';
}
