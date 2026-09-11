import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router';
import { db } from '@/db/db';
import { useAccounts } from '@/db/queries/accounts';
import { useCategoryGroups } from '@/db/queries/categories';
import { createCategory } from '@/db/queries/categories';
import { createTransaction, createTransfer, updateTransaction } from '@/db/queries/transactions';
import { useTxDraftStore, type TxDraftKind } from '@/store/txDraft';
import { groupIcon } from '@/domain/groups';
import { toMinorUnits } from '@/domain/money';
import type { SplitRow } from '../splits.types';
import { useT } from '@/i18n';
import type { ComposerValidation } from './Composer.types';

const KIND_PARAM: Record<string, TxDraftKind> = {
  expense: 'expense',
  income: 'income',
  transfer: 'transfer',
};

/**
 * Owns hydration, validation and persistence for the composer.
 *
 * Hydration order is store -> search params -> defaults. The store wins so a
 * drop (or a round trip through a picker) keeps what the user already chose;
 * search params keep `/add/tx?kind=expense` deep links and the PWA shortcuts
 * working after a cold start.
 */
export function useComposerDraft(seedKind?: TxDraftKind, editingId?: string) {
  const t = useT();
  const [searchParams] = useSearchParams();
  const draft = useTxDraftStore((s) => s.draft);
  const active = useTxDraftStore((s) => s.active);
  const begin = useTxDraftStore((s) => s.begin);
  const patch = useTxDraftStore((s) => s.patch);
  const clear = useTxDraftStore((s) => s.clear);

  const accounts = useAccounts();
  const groups = useCategoryGroups();
  const existing = useLiveQuery(() => (editingId ? db.transactions.get(editingId) : undefined), [editingId]);

  // --- hydration -----------------------------------------------------------
  useEffect(() => {
    if (editingId) {
      if (!existing || draft.editingId === editingId) return;
      const category = groups.flatMap((g) => g.categories).find((c) => c.id === existing.categoryId);
      begin({
        kind: existing.amount < 0 ? 'expense' : 'income',
        editingId,
        accountId: existing.accountId,
        groupId: category?.groupId,
        categoryId: existing.categoryId,
        amountText: String(Math.abs(existing.amount) / 100),
        date: existing.date,
        memo: existing.memo ?? '',
        splits: (existing.splits ?? []).map((split) => ({
          localId: crypto.randomUUID(),
          categoryId: split.categoryId,
          amountText: String(Math.abs(split.amount) / 100),
        })),
      });
      return;
    }
    // A seeded route (/add/income, /add/transfer, ...) asks for a specific
    // kind, so re-seed when the live draft is a different kind — otherwise
    // navigating between those routes would keep the previous one. When the
    // kind already matches, the draft is preserved, so a round trip through a
    // picker does not discard what the user typed.
    if (active && (!seedKind || draft.kind === seedKind)) return;
    const paramKind = KIND_PARAM[searchParams.get('kind') ?? ''];
    begin({
      kind: seedKind ?? paramKind ?? 'expense',
      accountId: searchParams.get('account') ?? undefined,
      toAccountId: searchParams.get('toAccount') ?? undefined,
      groupId: searchParams.get('group') ?? undefined,
    });
  }, [editingId, existing, active, seedKind, searchParams, begin, groups, draft.editingId, draft.kind]);

  // Fall back to the first account rather than blocking Save on a choice the
  // user almost never wants to make.
  const accountId = draft.accountId ?? accounts[0]?.id;
  const account = accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === draft.toAccountId);
  const group = groups.find((g) => g.id === draft.groupId);

  const subcategories = useMemo(() => group?.categories.filter((c) => !c.archived) ?? [], [group]);

  /**
   * Budget OK lets you save without picking a subcategory. Our reports skip
   * transactions with no categoryId, so instead of writing one we default to
   * the group's first child and show it pre-selected.
   */
  const categoryId = draft.categoryId ?? subcategories[0]?.id;

  const currency = account?.currency ?? 'USD';
  const minorUnits = toMinorUnits(draft.amountText);
  const splitMode = (draft.splits?.length ?? 0) > 0;

  const validation: ComposerValidation = useMemo(() => {
    if (!accountId) return { canSave: false, reason: t.composer.reasonNoAccount };
    if (minorUnits <= 0) return { canSave: false, reason: t.addTx.reasonNoAmount };
    if (draft.kind === 'transfer') {
      if (!draft.toAccountId) return { canSave: false, reason: t.composer.reasonNoAccount };
      if (draft.toAccountId === accountId) return { canSave: false, reason: t.composer.reasonSameAccount };
      return { canSave: true };
    }
    if (splitMode) {
      const assigned = (draft.splits ?? []).reduce((sum, row) => sum + toMinorUnits(row.amountText), 0);
      if (assigned !== minorUnits || (draft.splits ?? []).some((row) => !row.categoryId)) {
        return { canSave: false, reason: t.splits.remaining(String((minorUnits - assigned) / 100)) };
      }
      return { canSave: true };
    }
    if (!draft.groupId) return { canSave: false, reason: t.composer.reasonNoGroup };
    return { canSave: true };
  }, [accountId, minorUnits, draft.kind, draft.toAccountId, draft.groupId, draft.splits, splitMode, t]);

  const save = async (): Promise<boolean> => {
    if (!validation.canSave || !accountId) return false;

    if (draft.kind === 'transfer') {
      await createTransfer({
        fromAccountId: accountId,
        toAccountId: draft.toAccountId!,
        amount: minorUnits,
        fromCurrency: currency,
        toCurrency: toAccount?.currency ?? currency,
        date: draft.date,
        memo: draft.memo.trim() || undefined,
      });
      clear();
      return true;
    }

    // A user-made group can have no children yet; give it one so the
    // transaction stays visible in reports and budgets.
    const resolvedCategoryId = splitMode
      ? undefined
      : (categoryId ??
        (group
          ? await createCategory({
              groupId: group.id,
              name: group.name,
              icon: groupIcon(group, group.categories),
              color: group.color,
              bucket: group.bucket,
            })
          : undefined));

    const sign = draft.kind === 'expense' ? -1 : 1;
    const payload = {
      accountId,
      date: draft.date,
      amount: sign * minorUnits,
      currency,
      // A split transaction carries its categories in `splits`, not here.
      categoryId: splitMode ? undefined : resolvedCategoryId,
      memo: draft.memo.trim() || undefined,
      splits: splitMode
        ? draft.splits!.map((row) => ({ categoryId: row.categoryId!, amount: sign * toMinorUnits(row.amountText) }))
        : undefined,
    };

    if (draft.editingId) await updateTransaction(draft.editingId, payload);
    else await createTransaction(payload);
    clear();
    return true;
  };

  return {
    draft,
    patch,
    clear,
    accounts,
    account,
    toAccount,
    group,
    subcategories,
    categoryId,
    currency,
    minorUnits,
    validation,
    save,
    splitMode,
    splits: draft.splits ?? [],
    setSplits: (rows: SplitRow[]) => patch({ splits: rows }),
    isEditing: Boolean(draft.editingId),
  };
}
