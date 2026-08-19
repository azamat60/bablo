import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { newMeta, touchMeta } from '@/db/meta';
import type { GoalContribution, SavingsGoal } from '@/db/types';

export function useGoals(includeArchived = false): SavingsGoal[] {
  return (
    useLiveQuery(async () => {
      const all = await db.goals.orderBy('order').toArray();
      return includeArchived ? all : all.filter((goal) => !goal.archived);
    }, [includeArchived]) ?? []
  );
}

export function useGoalContributions(goalId: string): GoalContribution[] {
  return useLiveQuery(() => db.goalContributions.where('goalId').equals(goalId).toArray(), [goalId]) ?? [];
}

export function useGoalTotals(): Map<string, number> {
  return (
    useLiveQuery(async () => {
      const contributions = await db.goalContributions.toArray();
      const totals = new Map<string, number>();
      for (const contribution of contributions) {
        totals.set(contribution.goalId, (totals.get(contribution.goalId) ?? 0) + contribution.amount);
      }
      return totals;
    }, []) ?? new Map<string, number>()
  );
}

export type NewGoalInput = {
  name: string;
  icon: string;
  color: string;
  targetAmount: number;
  targetDate?: string;
  accountId?: string;
};

export async function createGoal(input: NewGoalInput): Promise<string> {
  const order = await db.goals.count();
  const goal: SavingsGoal = { ...newMeta(), ...input, order, archived: false };
  await db.goals.add(goal);
  return goal.id;
}

export type GoalPatch = Partial<Pick<SavingsGoal, 'name' | 'icon' | 'color' | 'targetAmount' | 'targetDate'>>;

export async function updateGoal(id: string, patch: GoalPatch): Promise<void> {
  const goal = await db.goals.get(id);
  if (!goal) return;
  await db.goals.update(id, { ...patch, ...touchMeta(goal.rev) });
}

export async function archiveGoal(id: string): Promise<void> {
  const goal = await db.goals.get(id);
  if (!goal) return;
  await db.goals.update(id, { archived: true, ...touchMeta(goal.rev) });
}

export type NewContributionInput = {
  goalId: string;
  amount: number;
  date: string;
  memo?: string;
};

export async function addContribution(input: NewContributionInput): Promise<void> {
  const contribution: GoalContribution = { ...newMeta(), ...input };
  await db.goalContributions.add(contribution);
}
