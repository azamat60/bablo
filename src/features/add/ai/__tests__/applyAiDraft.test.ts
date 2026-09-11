import { describe, expect, it } from 'vitest';
import { aiDraftToPatch } from '../applyAiDraft';
import type { AiDraft } from '@/lib/aiTypes';
import type { CategoryGroupWithCategories } from '@/db/queries/categories';

const meta = (id: string) => ({ id, updatedAt: 0, rev: 1, deleted: false });
const cat = (id: string, groupId: string) => ({
  ...meta(id),
  groupId,
  name: id,
  icon: 'tag',
  color: '#fff',
  order: 0,
  archived: false,
  isSystem: false,
});
const groups: CategoryGroupWithCategories[] = [
  {
    ...meta('health'),
    name: 'Здоровье',
    kind: 'expense',
    color: '#0f0',
    order: 0,
    archived: false,
    categories: [cat('pharmacy', 'health'), cat('doctor', 'health')],
  },
  {
    ...meta('food'),
    name: 'Еда',
    kind: 'expense',
    color: '#f00',
    order: 1,
    archived: false,
    categories: [cat('groceries', 'food'), cat('cafe', 'food')],
  },
];
const ctx = { groups, kind: 'expense' as const, currentGroupId: 'health', currentMemo: '', currentDate: '2026-09-11' };
const draft = (transactions: AiDraft['transactions'], over: Partial<AiDraft> = {}): AiDraft => ({
  merchant: null,
  date: null,
  currency: null,
  transactions,
  ...over,
});

describe('aiDraftToPatch', () => {
  it('fills amount, subcategory, memo and date for one item in the current group', () => {
    const r = aiDraftToPatch(
      draft([{ amount: 850, direction: 'expense', categoryId: 'pharmacy', memo: 'Аптека', confidence: 0.9 }], {
        date: '2026-09-10',
      }),
      ctx,
    );
    expect(r).toMatchObject({
      amountMajor: 850,
      categoryChanged: false,
      lowConfidence: false,
      ignoredCount: 0,
      patch: { groupId: 'health', categoryId: 'pharmacy', memo: 'Аптека', date: '2026-09-10', source: 'text' },
    });
  });

  it('flags when the model picked a category outside the current group', () => {
    const r = aiDraftToPatch(
      draft([{ amount: 1420, direction: 'expense', categoryId: 'groceries', memo: null, confidence: 0.8 }], {
        merchant: 'Глобус',
      }),
      ctx,
    );
    expect(r?.categoryChanged).toBe(true);
    expect(r?.patch).toMatchObject({ groupId: 'food', categoryId: 'groceries', memo: 'Глобус' });
  });

  it('keeps the current memo and date when the draft has none', () => {
    const r = aiDraftToPatch(
      draft([{ amount: 10, direction: 'expense', categoryId: 'doctor', memo: null, confidence: 0.9 }]),
      { ...ctx, currentMemo: 'мой', currentDate: '2026-09-01' },
    );
    expect(r?.patch).toMatchObject({ memo: 'мой', date: '2026-09-01' });
  });

  it('turns several items into splits that sum to the total', () => {
    const r = aiDraftToPatch(
      draft([
        { amount: 300.5, direction: 'expense', categoryId: 'groceries', memo: null, confidence: 0.9 },
        { amount: 199.5, direction: 'expense', categoryId: 'cafe', memo: null, confidence: 0.9 },
      ]),
      ctx,
    );
    expect(r?.amountMajor).toBe(500);
    expect(r?.patch.splits?.map((s) => [s.categoryId, s.amountText])).toEqual([
      ['groceries', '300.5'],
      ['cafe', '199.5'],
    ]);
  });

  it('never flips direction: income items are dropped from an expense draft and counted', () => {
    const r = aiDraftToPatch(
      draft([
        { amount: 100, direction: 'expense', categoryId: 'pharmacy', memo: null, confidence: 0.9 },
        { amount: 5000, direction: 'income', categoryId: 'groceries', memo: null, confidence: 0.9 },
      ]),
      ctx,
    );
    expect(r?.amountMajor).toBe(100);
    expect(r?.ignoredCount).toBe(1);
    expect(r?.patch.splits).toEqual([]);
  });

  it('returns null when nothing matches the direction', () => {
    expect(
      aiDraftToPatch(
        draft([{ amount: 5, direction: 'income', categoryId: 'groceries', memo: null, confidence: 1 }]),
        ctx,
      ),
    ).toBeNull();
  });

  it('flags low confidence', () => {
    const r = aiDraftToPatch(
      draft([{ amount: 5, direction: 'expense', categoryId: 'doctor', memo: null, confidence: 0.3 }]),
      ctx,
    );
    expect(r?.lowConfidence).toBe(true);
  });
});
