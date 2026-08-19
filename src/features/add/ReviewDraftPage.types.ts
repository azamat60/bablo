import type { AiDraft } from '@/lib/aiTypes';
import type { TransactionSource } from '@/db/types';

export type ReviewLocationState = {
  draft: AiDraft;
  transcript?: string;
  source?: TransactionSource;
  jobId?: string;
};

export type ReviewRow = {
  localId: string;
  include: boolean;
  amountText: string;
  direction: 'expense' | 'income';
  categoryId: string;
  memo: string;
  confidence: number;
};
