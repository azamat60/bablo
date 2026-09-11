import type { TxDraftKind } from '@/store/txDraft';

export type ComposerHydration = {
  kind: TxDraftKind;
  accountId?: string;
  toAccountId?: string;
  groupId?: string;
  editingId?: string;
};

export type ComposerValidation = {
  canSave: boolean;
  /** Localised explanation shown above a disabled Save. */
  reason?: string;
};
