import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { newMeta, touchMeta } from '@/db/meta';
import { computeNextRun } from '@/domain/recurring';
import { todayIsoDate } from '@/domain/transactions';
import type { Recurring, RecurringFrequency, Transaction } from '@/db/types';

export function useRecurring(): Recurring[] {
  return (
    useLiveQuery(async () => {
      const all = await db.recurring.toArray();
      return all.filter((r) => !r.deleted).sort((a, b) => a.nextRun.localeCompare(b.nextRun));
    }, []) ?? []
  );
}

export type NewRecurringInput = {
  accountId: string;
  amount: number;
  currency: string;
  categoryId?: string;
  memo?: string;
  frequency: RecurringFrequency;
  interval: number;
  dayOfMonth?: number;
  nextRun: string;
  autoPost: boolean;
};

export async function createRecurring(input: NewRecurringInput): Promise<string> {
  const recurring: Recurring = { ...newMeta(), ...input, active: true };
  await db.recurring.add(recurring);
  return recurring.id;
}

export async function deleteRecurring(id: string): Promise<void> {
  const recurring = await db.recurring.get(id);
  if (!recurring) return;
  await db.recurring.update(id, { active: false, deleted: true, ...touchMeta(recurring.rev) });
}

export async function runDueRecurring(): Promise<number> {
  const today = todayIsoDate();
  const all = await db.recurring.toArray();
  const due = all.filter((r) => r.active && !r.deleted && r.nextRun <= today);

  let created = 0;
  for (const recurring of due) {
    let nextRun = recurring.nextRun;
    while (nextRun <= today && (!recurring.endDate || nextRun <= recurring.endDate)) {
      if (recurring.autoPost) {
        const transaction: Transaction = {
          ...newMeta(),
          accountId: recurring.accountId,
          date: nextRun,
          amount: recurring.amount,
          currency: recurring.currency,
          rate: 1,
          categoryId: recurring.categoryId,
          memo: recurring.memo,
          cleared: false,
          tags: [],
          attachmentIds: [],
          source: 'recurring',
        };
        await db.transactions.add(transaction);
        created += 1;
      }
      nextRun = computeNextRun(nextRun, recurring.frequency, recurring.interval, recurring.dayOfMonth);
    }
    const stillActive = !recurring.endDate || nextRun <= recurring.endDate;
    await db.recurring.update(recurring.id, {
      nextRun,
      active: stillActive,
      ...touchMeta(recurring.rev),
    });
  }
  return created;
}
