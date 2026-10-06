import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { newMeta } from '@/db/meta';
import { STARTER_GROUPS, getCategoryPreset } from '@/db/seed';
import { SEED_NAME_RU } from '@/db/seed.categories.ru';
import type { Category, CategoryGroup } from '@/db/types';
import type { Locale } from '@/i18n/types';

const normalize = (name: string) => name.normalize('NFKC').trim().toLowerCase();
const sameName = (name: string, original: string) =>
  [original, SEED_NAME_RU[original]].some((alias) => alias && normalize(alias) === normalize(name));
export type CategoryRecommendation = {
  id: string;
  group: ReturnType<typeof getCategoryPreset>[number];
  category: ReturnType<typeof getCategoryPreset>[number]['categories'][number];
  originalGroup: string;
};

export function recommendedCategories(locale: Locale, groups: CategoryGroup[], categories: Category[]) {
  const translated = getCategoryPreset('full', locale);
  const kinds = new Map(groups.map((group) => [group.id, group.kind]));
  return STARTER_GROUPS.flatMap((original, groupIndex) => {
    const matchingGroups = groups.filter(
      (group) => group.kind === original.kind && sameName(group.name, original.name),
    );
    if (matchingGroups.length && matchingGroups.every((group) => group.archived || group.deleted)) return [];
    const group = translated[groupIndex]!;
    return original.categories.flatMap((category, categoryIndex): CategoryRecommendation[] => {
      const exists = categories.some((existing) => {
        const kind = kinds.get(existing.groupId);
        return (
          kind === original.kind && (sameName(existing.name, category.name) || (category.isSystem && existing.isSystem))
        );
      });
      return exists
        ? []
        : [
            {
              id: JSON.stringify([original.name, category.name]),
              group,
              category: group.categories[categoryIndex]!,
              originalGroup: original.name,
            },
          ];
    });
  });
}

export async function addRecommendedCategories(ids: readonly string[], locale: Locale): Promise<number> {
  return db.transaction('rw', db.categoryGroups, db.categories, async () => {
    const groups = await db.categoryGroups.toArray();
    const categories = await db.categories.toArray();
    const selected = new Set(ids);
    const recommendations = recommendedCategories(locale, groups, categories).filter((item) => selected.has(item.id));
    let added = 0;
    for (const item of recommendations) {
      let group = groups.find(
        (existing) =>
          !existing.archived &&
          !existing.deleted &&
          existing.kind === item.group.kind &&
          sameName(existing.name, item.originalGroup),
      );
      if (!group) {
        group = {
          ...newMeta(),
          name: item.group.name,
          kind: item.group.kind,
          bucket: item.group.bucket,
          color: item.group.color,
          order: Math.max(-1, ...groups.map((row) => row.order)) + 1,
          archived: false,
        };
        await db.categoryGroups.add(group);
        groups.push(group);
      }
      const category: Category = {
        ...newMeta(),
        ...item.category,
        groupId: group.id,
        color: group.color,
        archived: false,
        isSystem: item.category.isSystem ?? false,
        order: Math.max(-1, ...categories.filter((row) => row.groupId === group.id).map((row) => row.order)) + 1,
      };
      await db.categories.add(category);
      categories.push(category);
      added++;
    }
    return added;
  });
}

export function useCategoryRecommendations(locale: Locale) {
  return useLiveQuery(
    async () => recommendedCategories(locale, await db.categoryGroups.toArray(), await db.categories.toArray()),
    [locale],
  );
}

export function categorySuggestions(group: CategoryGroup, items: CategoryRecommendation[]) {
  const sameKind = items.filter((item) => item.group.kind === group.kind);
  const sameGroup = sameKind.filter((item) => sameName(group.name, item.originalGroup));
  const known = STARTER_GROUPS.some((item) => item.kind === group.kind && sameName(group.name, item.name));
  return (known ? sameGroup : sameKind).slice(0, 8);
}
