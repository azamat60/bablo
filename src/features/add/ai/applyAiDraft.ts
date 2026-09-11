import type { AiDraft } from '@/lib/aiTypes';
import type { TxDraft, TxDraftKind } from '@/store/txDraft';
import type { CategoryGroupWithCategories } from '@/db/queries/categories';

export const LOW_CONFIDENCE = 0.6;

export type AiDraftApplication = {
  patch: Partial<TxDraft>;
  /** Major units, ready for `pad.reset`. */
  amountMajor: number;
  /** The AI picked a category outside the group the user was already in. */
  categoryChanged: boolean;
  lowConfidence: boolean;
  /** Transactions of the other direction that were left out. */
  ignoredCount: number;
};

export type ApplyContext = {
  groups: CategoryGroupWithCategories[];
  kind: TxDraftKind;
  currentGroupId?: string;
  currentMemo: string;
  currentDate: string;
};

/**
 * Turns what the model returned into a patch for the open composer.
 *
 * The direction is never changed: the user chose expense or income before
 * capturing, and on a seeded route flipping it would re-seed and wipe the
 * draft. Items of the other direction are dropped and counted.
 */
export function aiDraftToPatch(draft: AiDraft, ctx: ApplyContext): AiDraftApplication | null {
  const wanted = ctx.kind === 'income' ? 'income' : 'expense';
  const items = draft.transactions.filter((tx) => tx.direction === wanted && tx.amount > 0);
  if (items.length === 0) return null;

  const groupIdOf = (categoryId: string) =>
    ctx.groups.flatMap((group) => group.categories).find((category) => category.id === categoryId)?.groupId;

  const lowConfidence = items.some((tx) => tx.confidence < LOW_CONFIDENCE);
  const ignoredCount = draft.transactions.length - items.length;
  const memoFromDraft = items.find((tx) => tx.memo)?.memo ?? draft.merchant ?? undefined;
  const base: Partial<TxDraft> = {
    memo: memoFromDraft ?? ctx.currentMemo,
    date: draft.date ?? ctx.currentDate,
    source: 'text',
  };

  if (items.length === 1) {
    const [tx] = items;
    const groupId = groupIdOf(tx!.categoryId);
    return {
      patch: { ...base, groupId: groupId ?? ctx.currentGroupId, categoryId: tx!.categoryId, splits: [] },
      amountMajor: tx!.amount,
      categoryChanged: Boolean(groupId && ctx.currentGroupId && groupId !== ctx.currentGroupId),
      lowConfidence,
      ignoredCount,
    };
  }

  // A receipt with several line items: keep every category as a split. The
  // group shown in the header is the first item's, which is what the user
  // sees as "the" category; splits carry the rest.
  const first = items[0]!;
  const groupId = groupIdOf(first.categoryId);
  const amountMajor = Math.round(items.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;
  return {
    patch: {
      ...base,
      groupId: groupId ?? ctx.currentGroupId,
      categoryId: first.categoryId,
      splits: items.map((tx) => ({
        localId: crypto.randomUUID(),
        categoryId: tx.categoryId,
        amountText: String(tx.amount),
      })),
    },
    amountMajor,
    categoryChanged: Boolean(groupId && ctx.currentGroupId && groupId !== ctx.currentGroupId),
    lowConfidence,
    ignoredCount,
  };
}
