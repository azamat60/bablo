export type TransactionDirection = 'expense' | 'income';

export type SplitRow = {
  localId: string;
  categoryId?: string;
  amountText: string;
};
