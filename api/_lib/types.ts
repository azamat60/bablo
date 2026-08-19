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
