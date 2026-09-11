export type AiCategoryContext = {
  id: string;
  name: string;
  kind: 'income' | 'expense';
};

export type AiRequestContext = {
  categories: AiCategoryContext[];
  payees: string[];
  baseCurrency: string;
  timezone: string;
  today: string;
  /**
   * Set when the user is already inside a category on the client. The model
   * is asked to prefer these but may still pick any listed category.
   */
  preferredCategoryIds?: string[];
  preferredGroupName?: string;
};

export type AiDraftTransaction = {
  amount: number;
  direction: 'expense' | 'income';
  categoryId: string;
  memo: string | null;
  confidence: number;
};

export type AiDraft = {
  merchant: string | null;
  date: string | null;
  currency: string | null;
  transactions: AiDraftTransaction[];
};

export type AiStatementTransactionKind = 'expense' | 'income' | 'transfer';

export type AiStatementTransaction = {
  date: string;
  amount: number;
  kind: AiStatementTransactionKind;
  payee: string | null;
  categoryId: string;
  memo: string | null;
  confidence: number;
};

export type AiStatement = {
  accountName: string | null;
  currency: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  transactions: AiStatementTransaction[];
};
