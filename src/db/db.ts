import Dexie, { type EntityTable } from 'dexie';
import type {
  Account,
  AiJob,
  Attachment,
  BudgetEntry,
  Category,
  CategoryGroup,
  GoalContribution,
  Payee,
  Rate,
  Recurring,
  SavingsGoal,
  Settings,
  SyncQueueEntry,
  Transaction,
} from './types';

export class BabloDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categoryGroups!: EntityTable<CategoryGroup, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  payees!: EntityTable<Payee, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  budgets!: EntityTable<BudgetEntry, 'id'>;
  recurring!: EntityTable<Recurring, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  aiJobs!: EntityTable<AiJob, 'id'>;
  syncQueue!: EntityTable<SyncQueueEntry, 'id'>;
  rates!: EntityTable<Rate, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  goals!: EntityTable<SavingsGoal, 'id'>;
  goalContributions!: EntityTable<GoalContribution, 'id'>;

  constructor() {
    super('bablo');
    this.version(1).stores({
      accounts: 'id, order, archived, type',
      categoryGroups: 'id, order, kind, archived',
      categories: 'id, groupId, order, archived',
      payees: 'id, name',
      transactions: 'id, accountId, date, categoryId, payeeId, transferId, [accountId+date]',
      budgets: 'id, &[month+categoryId], month, categoryId',
      recurring: 'id, nextRun, active',
      attachments: 'id, txId',
      aiJobs: 'id, status, kind',
      syncQueue: 'id, ts, table',
      rates: 'id, base, quote',
      settings: 'id',
    });
    this.version(2).stores({
      goals: 'id, order, archived',
      goalContributions: 'id, goalId, date',
    });
  }
}

export const db = new BabloDB();
