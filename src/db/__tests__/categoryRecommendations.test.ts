import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { seedCategoriesForPreset } from '../seed';
import { addRecommendedCategories, recommendedCategories } from '../queries/categoryRecommendations';
import { deleteCategory, deleteCategoryGroup } from '../queries/categoryDeletion';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedCategoriesForPreset('empty', 'ru');
});
afterEach(() => vi.restoreAllMocks());
const available = async () =>
  recommendedCategories('ru', await db.categoryGroups.toArray(), await db.categories.toArray());

describe('recommended categories', () => {
  it('adds only the selected recommendations, preserves existing rows and remains idempotent across locales', async () => {
    const before = await db.categories.toArray();
    const choices = (await available()).filter((item) =>
      ['Salary', 'Groceries'].includes((JSON.parse(item.id) as [string, string])[1]),
    );
    expect(choices).toHaveLength(2);
    expect(
      await addRecommendedCategories(
        choices.map((item) => item.id),
        'ru',
      ),
    ).toBe(2);
    expect(await db.categories.count()).toBe(before.length + 2);
    for (const row of before) expect(await db.categories.get(row.id)).toEqual(row);
    expect(
      await addRecommendedCategories(
        choices.map((item) => item.id),
        'en',
      ),
    ).toBe(0);
    expect((await available()).some((item) => choices.some((choice) => choice.id === item.id))).toBe(false);
  });
  it('offers archived categories and groups as fresh additions without restoring old rows', async () => {
    const choices = (await available()).filter((item) =>
      ['Salary', 'Groceries'].includes((JSON.parse(item.id) as [string, string])[1]),
    );
    await addRecommendedCategories(
      choices.map((item) => item.id),
      'ru',
    );
    const salary = await db.categories.filter((item) => item.name === 'Зарплата').first();
    const food = await db.categoryGroups.filter((item) => item.name === 'Еда').first();
    expect(salary).toBeDefined();
    expect(food).toBeDefined();
    await db.categories.update(salary!.id, { archived: true });
    await db.categoryGroups.update(food!.id, { archived: true });
    const remaining = await available();
    expect(remaining.some((item) => (JSON.parse(item.id) as [string, string])[1] === 'Salary')).toBe(true);
    expect(remaining.some((item) => item.originalGroup === 'Food')).toBe(true);
    expect(
      await addRecommendedCategories(
        choices.map((item) => item.id),
        'ru',
      ),
    ).toBe(2);
    expect(await db.categories.get(salary!.id)).toMatchObject({ archived: true });
    expect(await db.categoryGroups.get(food!.id)).toMatchObject({ archived: true });
    expect(
      await db.categories.filter((item) => item.name === 'Зарплата' && !item.archived && !item.deleted).count(),
    ).toBe(1);
    expect(
      await db.categoryGroups.filter((item) => item.name === 'Еда' && !item.archived && !item.deleted).count(),
    ).toBe(1);
    expect(
      await addRecommendedCategories(
        choices.map((item) => item.id),
        'en',
      ),
    ).toBe(0);
  });
  it('offers deleted recommendations again and preserves their tombstones across locales', async () => {
    const choices = (await available()).filter((item) =>
      ['Salary', 'Groceries'].includes((JSON.parse(item.id) as [string, string])[1]),
    );
    await addRecommendedCategories(
      choices.map((item) => item.id),
      'ru',
    );
    const salary = (await db.categories.filter((item) => item.name === 'Зарплата').first())!;
    const food = (await db.categoryGroups.filter((item) => item.name === 'Еда').first())!;
    await deleteCategory(salary.id);
    await deleteCategoryGroup(food.id);
    const remaining = await available();
    expect(choices.every((choice) => remaining.some((item) => item.id === choice.id))).toBe(true);
    expect(
      await addRecommendedCategories(
        choices.map((item) => item.id),
        'en',
      ),
    ).toBe(2);
    expect(await db.categories.get(salary.id)).toMatchObject({ deleted: true });
    expect(await db.categoryGroups.get(food.id)).toMatchObject({ deleted: true });
    expect(await db.categories.filter((item) => item.name === 'Salary' && !item.deleted).count()).toBe(1);
    expect(await db.categoryGroups.filter((item) => item.name === 'Food' && !item.deleted).count()).toBe(1);
    expect(
      await addRecommendedCategories(
        choices.map((item) => item.id),
        'ru',
      ),
    ).toBe(0);
  });
  it('can rebuild the complete recommended set after every category was deleted', async () => {
    await db.categoryGroups.clear();
    await db.categories.clear();
    await seedCategoriesForPreset('full', 'ru');
    const originalGroups = await db.categoryGroups.toArray();
    const originalCategories = await db.categories.toArray();
    expect(await available()).toEqual([]);
    for (const group of originalGroups) await deleteCategoryGroup(group.id);
    const missing = await available();
    expect(missing).toHaveLength(originalCategories.length);
    expect(
      await addRecommendedCategories(
        missing.map((item) => item.id),
        'ru',
      ),
    ).toBe(originalCategories.length);
    expect(await available()).toEqual([]);
    expect(await db.categories.filter((item) => !item.deleted && !item.archived).count()).toBe(
      originalCategories.length,
    );
    expect(await db.categoryGroups.filter((item) => !item.deleted && !item.archived).count()).toBe(
      originalGroups.length,
    );
    for (const old of originalCategories) expect(await db.categories.get(old.id)).toMatchObject({ deleted: true });
    expect(
      await addRecommendedCategories(
        missing.map((item) => item.id),
        'en',
      ),
    ).toBe(0);
  });
  it('rolls back a newly created group when adding its category fails', async () => {
    const beforeGroups = await db.categoryGroups.toArray();
    const beforeCategories = await db.categories.toArray();
    const choice = (await available()).find((item) => item.originalGroup === 'Food')!;
    vi.spyOn(db.categories, 'add').mockRejectedValueOnce(new Error('write failed'));
    await expect(addRecommendedCategories([choice.id], 'ru')).rejects.toThrow('write failed');
    expect(await db.categoryGroups.toArray()).toEqual(beforeGroups);
    expect(await db.categories.toArray()).toEqual(beforeCategories);
  });
  it('ignores unknown selections without changing the ledger', async () => {
    const before = await db.categories.toArray();
    expect(await addRecommendedCategories(['not-a-template'], 'ru')).toBe(0);
    expect(await db.categories.toArray()).toEqual(before);
    expect(await db.categoryGroups.count()).toBe(2);
  });
});
