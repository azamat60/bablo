import { describe, expect, it } from 'vitest';
import { labelCategories, resolveCategoryId } from '../categories.js';
import { kindFromPrintedSign } from '../statement.js';
import type { AiCategoryContext } from '../types.js';

const categories: AiCategoryContext[] = [
  { id: 'a', name: 'Зарплата', kind: 'income', group: 'Доходы' },
  { id: 'b', name: 'Продукты', kind: 'expense', group: 'Еда' },
  { id: 'c', name: 'Другое', kind: 'expense', group: 'Еда' },
  { id: 'd', name: 'Другое', kind: 'expense', group: 'Еда' },
  { id: 'e', name: 'Без категории', kind: 'expense', group: 'Другое' },
];

describe('labelCategories', () => {
  it('labels by group and keeps duplicates distinct', () => {
    const labels = labelCategories(categories);
    expect(labels.labels).toEqual([
      'Доходы / Зарплата',
      'Еда / Продукты',
      'Еда / Другое',
      'Еда / Другое (2)',
      'Другое / Без категории',
    ]);
    expect(labels.idByLabel.get('Еда / Другое (2)')).toBe('d');
  });

  it('resolves a label back to its id', () => {
    const labels = labelCategories(categories);
    expect(resolveCategoryId('Еда / Продукты', labels, 'expense')).toBe('b');
  });

  it('falls back to the uncategorized category of the right kind', () => {
    const labels = labelCategories(categories);
    expect(resolveCategoryId('nonsense', labels, 'expense')).toBe('e');
    expect(resolveCategoryId('nonsense', labels, 'income')).toBe('a');
  });
});

describe('kindFromPrintedSign', () => {
  it('reads a leading sign', () => {
    expect(kindFromPrintedSign('+1 200,00')).toBe('income');
    expect(kindFromPrintedSign(' + 350.00 KGS')).toBe('income');
    expect(kindFromPrintedSign('-350.00')).toBe('expense');
    expect(kindFromPrintedSign('−350,00')).toBe('expense');
  });

  it('is silent without a sign', () => {
    expect(kindFromPrintedSign('350.00')).toBeNull();
    expect(kindFromPrintedSign('1 200,00 сом')).toBeNull();
  });
});
