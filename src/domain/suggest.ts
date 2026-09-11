import { categoryAmountsInTransaction, countsTowardBudget } from './budget';
import {
  AMOUNT_SAMPLE_SIZE,
  MAX_AMOUNT_CV,
  MIN_MARGIN,
  MIN_REPEATS,
  MIN_SAMPLES_FOR_WEEKDAY,
  MIN_SCORE,
  RECENCY_TAU_DAYS,
  REPEAT_SAMPLE_SIZE,
  ROUND_ABOVE_MINOR,
  SUGGEST_WEIGHTS,
} from './suggest.constants';
import type { Category, Payee, Recurring, Transaction } from '@/db/types';

export type SuggestReason =
  'payeeDefault' | 'recurring' | 'onlyCategory' | 'repeatAmount' | 'typicalAmount' | 'frequent';

export type Suggestion = {
  categoryId: string;
  /** Omitted when past amounts are too scattered to guess from. */
  amountMinor?: number;
  /** 0..1. */
  score: number;
  reason: SuggestReason;
};

export type SuggestInput = {
  /** Already narrowed to the lookback window by the caller. */
  transactions: Transaction[];
  /** The children of the group being dropped onto. */
  categories: Category[];
  accountId: string;
  recurring?: Recurring[];
  payees?: Payee[];
  memo?: string;
  /** 'yyyy-MM-dd'. */
  today: string;
  direction: 'expense' | 'income';
};

type Sample = { categoryId: string; amount: number; date: string; accountId: string };

function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  return Math.max(0, Math.round(ms / 86_400_000));
}

function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

/** Coefficient of variation; 0 when the mean is 0. */
function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

function roundAmount(minor: number): number {
  return minor >= ROUND_ABOVE_MINOR ? Math.round(minor / 100) * 100 : Math.round(minor);
}

/**
 * Picks the amount to prefill, or nothing.
 *
 * A wrong prefilled amount is worse than an empty field, because the user has
 * to clear it before typing. So this suppresses the guess whenever past
 * amounts are scattered, and prefers the median over the mean so one big
 * outlier cannot drag a small recurring cost upwards.
 */
function suggestAmount(
  samples: Sample[],
  categoryId: string,
  recurring: Recurring[],
): { amountMinor?: number; reason?: SuggestReason } {
  const active = recurring.find((entry) => entry.active && entry.categoryId === categoryId);
  if (active) return { amountMinor: Math.abs(active.amount), reason: 'recurring' };

  const amounts = samples
    .filter((sample) => sample.categoryId === categoryId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((sample) => Math.abs(sample.amount));

  if (amounts.length === 0) return {};

  const recent = amounts.slice(0, REPEAT_SAMPLE_SIZE);
  const counts = new Map<number, number>();
  for (const amount of recent) counts.set(amount, (counts.get(amount) ?? 0) + 1);
  for (const [amount, count] of counts) {
    if (count >= MIN_REPEATS) return { amountMinor: amount, reason: 'repeatAmount' };
  }

  const window = amounts.slice(0, AMOUNT_SAMPLE_SIZE);
  if (coefficientOfVariation(window) > MAX_AMOUNT_CV) return {};
  return { amountMinor: roundAmount(median(window)), reason: 'typicalAmount' };
}

/**
 * Suggests which subcategory of a group the user probably means, and roughly
 * how much, from their own history.
 *
 * Deliberately local and synchronous: the chip has to be on screen in the same
 * frame the composer paints, and it has to work offline. An LLM adds nothing
 * here that a frequency-and-recency ranking does not do better and
 * deterministically — the AI routes handle free text, which is a different job.
 */
export function suggestForGroup(input: SuggestInput): Suggestion | null {
  const { transactions, categories, accountId, today, direction } = input;
  const recurring = input.recurring ?? [];
  const payees = input.payees ?? [];

  const live = categories.filter((category) => !category.archived);
  if (live.length === 0) return null;
  const inGroup = new Set(live.map((category) => category.id));

  // A known payee with a default category is a much stronger signal than any
  // amount of statistics, and it is already recorded — just never read.
  const memo = input.memo?.trim().toLowerCase();
  if (memo) {
    const payee = payees.find((candidate) => candidate.name.trim().toLowerCase() === memo);
    if (payee?.defaultCategoryId && inGroup.has(payee.defaultCategoryId)) {
      const { amountMinor, reason } = suggestAmount([], payee.defaultCategoryId, recurring);
      return { categoryId: payee.defaultCategoryId, amountMinor, score: 1, reason: reason ?? 'payeeDefault' };
    }
  }

  const wantsNegative = direction === 'expense';
  const samples: Sample[] = [];
  for (const tx of transactions) {
    if (!countsTowardBudget(tx)) continue;
    for (const entry of categoryAmountsInTransaction(tx)) {
      if (!inGroup.has(entry.categoryId)) continue;
      if (wantsNegative ? entry.amount >= 0 : entry.amount <= 0) continue;
      samples.push({ categoryId: entry.categoryId, amount: entry.amount, date: tx.date, accountId: tx.accountId });
    }
  }

  if (samples.length === 0) {
    // No history to rank, but a single-child group has only one answer.
    if (live.length === 1) {
      const only = live[0]!;
      return { categoryId: only.id, score: 1, reason: 'onlyCategory' };
    }
    return null;
  }

  const todayWeekday = weekday(today);
  const byCategory = new Map<string, Sample[]>();
  for (const sample of samples) {
    const list = byCategory.get(sample.categoryId);
    if (list) list.push(sample);
    else byCategory.set(sample.categoryId, [sample]);
  }

  const maxCount = Math.max(...[...byCategory.values()].map((list) => list.length));

  const scored = [...byCategory.entries()].map(([categoryId, list]) => {
    const mostRecent = list.reduce((latest, sample) => (sample.date > latest ? sample.date : latest), list[0]!.date);
    const recency = Math.exp(-daysBetween(mostRecent, today) / RECENCY_TAU_DAYS);
    const frequency = list.length / maxCount;
    const sameWeekday = list.filter((sample) => weekday(sample.date) === todayWeekday).length;
    const weekdayAffinity = list.length >= MIN_SAMPLES_FOR_WEEKDAY ? sameWeekday / list.length : 0;
    const accountAffinity = list.filter((sample) => sample.accountId === accountId).length / list.length;

    const score =
      SUGGEST_WEIGHTS.recency * recency +
      SUGGEST_WEIGHTS.frequency * frequency +
      SUGGEST_WEIGHTS.weekday * weekdayAffinity +
      SUGGEST_WEIGHTS.account * accountAffinity;

    return { categoryId, score, weekdayAffinity };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top) return null;

  // No chip is much better than a wrong chip: a wrong one costs two taps to
  // undo and permanently erodes trust in the feature.
  const runnerUp = scored[1]?.score ?? 0;
  if (scored.length > 1 && (top.score < MIN_SCORE || top.score - runnerUp < MIN_MARGIN)) return null;
  if (scored.length === 1 && top.score < MIN_SCORE && live.length > 1) return null;

  const { amountMinor, reason } = suggestAmount(samples, top.categoryId, recurring);
  return {
    categoryId: top.categoryId,
    amountMinor,
    score: Math.min(1, top.score),
    reason: reason ?? 'frequent',
  };
}
