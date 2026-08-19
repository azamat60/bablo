export type SyncMeta = {
  id: string;
  updatedAt: number;
  rev: number;
  deleted: boolean;
};

export type AccountType = 'cash' | 'debit_card' | 'credit_card' | 'savings' | 'ewallet' | 'investment' | 'loan';

export type Account = SyncMeta & {
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
  color: string;
  icon: string;
  order: number;
  archived: boolean;
  creditLimit?: number;
  statementDay?: number;
  dueDay?: number;
};

export type CategoryGroupKind = 'income' | 'expense';
export type Bucket = 'needs' | 'wants' | 'savings';

export type CategoryGroup = SyncMeta & {
  name: string;
  kind: CategoryGroupKind;
  bucket?: Bucket;
  color: string;
  order: number;
  archived: boolean;
};

export type GoalType = 'target_by_date' | 'monthly_funding' | 'target_balance';

export type CategoryGoal = {
  type: GoalType;
  amount: number;
  dueDate?: string;
};

export type Category = SyncMeta & {
  groupId: string;
  name: string;
  icon: string;
  color: string;
  bucket?: Bucket;
  order: number;
  archived: boolean;
  isSystem: boolean;
  monthlyLimit?: number;
  goal?: CategoryGoal;
};

export type Payee = SyncMeta & {
  name: string;
  defaultCategoryId?: string;
  aliases: string[];
};

export type TransactionSource = 'manual' | 'photo' | 'voice' | 'text' | 'import' | 'recurring';

export type TransactionSplit = {
  categoryId: string;
  amount: number;
  memo?: string;
};

export type Transaction = SyncMeta & {
  accountId: string;
  date: string;
  amount: number;
  currency: string;
  rate: number;
  categoryId?: string;
  payeeId?: string;
  memo?: string;
  cleared: boolean;
  transferId?: string;
  splits?: TransactionSplit[];
  tags: string[];
  attachmentIds: string[];
  source: TransactionSource;
  aiConfidence?: number;
};

export type BudgetEntry = SyncMeta & {
  month: string;
  categoryId: string;
  assigned: number;
};

export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export type Recurring = SyncMeta & {
  accountId: string;
  amount: number;
  currency: string;
  categoryId?: string;
  payeeId?: string;
  memo?: string;
  frequency: RecurringFrequency;
  interval: number;
  dayOfMonth?: number;
  weekday?: number;
  endDate?: string;
  nextRun: string;
  autoPost: boolean;
  active: boolean;
};

export type Attachment = SyncMeta & {
  txId: string;
  blob: Blob;
  thumbBlob?: Blob;
  mimeType: string;
};

export type AiJobKind = 'receipt' | 'voice' | 'text';
export type AiJobStatus = 'queued' | 'running' | 'done' | 'error';

export type AiJob = SyncMeta & {
  kind: AiJobKind;
  status: AiJobStatus;
  inputBlob?: Blob;
  inputText?: string;
  resultDraft?: unknown;
  error?: string;
};

export type SyncOp = 'upsert' | 'delete';

export type SyncQueueEntry = {
  id: string;
  op: SyncOp;
  table: string;
  rowId: string;
  payload?: unknown;
  ts: number;
};

export type Rate = {
  id: string;
  base: string;
  quote: string;
  rate: number;
  fetchedAt: number;
};

export type SavingsGoal = SyncMeta & {
  name: string;
  icon: string;
  color: string;
  targetAmount: number;
  targetDate?: string;
  accountId?: string;
  order: number;
  archived: boolean;
};

export type GoalContribution = SyncMeta & {
  goalId: string;
  amount: number;
  date: string;
  memo?: string;
};

export type ThemePref = 'dark' | 'light' | 'system';

export type Settings = {
  id: 'singleton';
  baseCurrency: string;
  firstDayOfMonth: number;
  theme: ThemePref;
  locale?: 'ru' | 'en';
  pinHash?: string;
  aiModel: string;
  onboardingComplete: boolean;
  flags: Record<string, boolean>;
};
