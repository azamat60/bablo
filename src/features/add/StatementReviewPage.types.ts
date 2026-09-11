import type { AiStatement, AiStatementTransactionKind } from '@/lib/aiTypes';

export type StatementReviewLocationState = {
  statement: AiStatement;
  fileName: string;
};

export type StatementLine = {
  localId: string;
  date: string;
  amountText: string;
  kind: AiStatementTransactionKind;
  payee: string;
  categoryId: string;
  memo: string;
  confidence: number;
};

/** A line plus what is derived at render time: duplicate status and the effective include flag. */
export type StatementRow = StatementLine & {
  include: boolean;
  duplicate: boolean;
};

/** Per-row checkbox choices; a missing entry means the default (skip duplicates and transfers). */
export type IncludeOverrides = Record<string, boolean>;
