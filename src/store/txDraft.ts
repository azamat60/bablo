import { create } from 'zustand';
import { todayIsoDate } from '@/domain/transactions';
import type { SplitRow } from '@/features/add/splits.types';

export type TxDraftKind = 'expense' | 'income' | 'transfer';

export type TxDraft = {
  kind: TxDraftKind;
  /** expense: source · income: destination · transfer: the "from" side. */
  accountId?: string;
  /** Transfer only. */
  toAccountId?: string;
  /** CategoryGroup — what Budget OK calls the category. */
  groupId?: string;
  /** Category — what Budget OK calls the subcategory. */
  categoryId?: string;
  /** Mirrors useNumberPad so the amount survives navigating to a picker. */
  amountText: string;
  date: string;
  memo: string;
  /** Set when editing an existing transaction rather than creating one. */
  editingId?: string;
  /** Non-empty means the amount is divided across categories. */
  splits?: SplitRow[];
};

function emptyDraft(kind: TxDraftKind = 'expense'): TxDraft {
  return { kind, amountText: '0', date: todayIsoDate(), memo: '' };
}

type TxDraftState = {
  draft: TxDraft;
  /** False until something seeds the draft, so the composer knows to hydrate. */
  active: boolean;
  /** Replaces the draft wholesale — used by a drop and by the route wrappers. */
  begin: (seed: Partial<TxDraft> & { kind: TxDraftKind }) => void;
  patch: (patch: Partial<TxDraft>) => void;
  clear: () => void;
};

/**
 * Session-only, deliberately not persisted: a stale draft resurfacing days
 * later would be worse than losing an unsaved one. Cleared explicitly on save
 * and on close.
 */
export const useTxDraftStore = create<TxDraftState>((set) => ({
  draft: emptyDraft(),
  active: false,
  begin: (seed) => set({ draft: { ...emptyDraft(seed.kind), ...seed }, active: true }),
  patch: (patch) => set((state) => ({ draft: { ...state.draft, ...patch }, active: true })),
  clear: () => set({ draft: emptyDraft(), active: false }),
}));
