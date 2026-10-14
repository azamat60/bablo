import type { Account, Transaction } from '@/db/types';
import { getDict } from '@/i18n';
import { sumMinorUnits } from './budget';

export const DEBT_TYPE = 'debt' as const;
export const DEBT_TILE_ID = '__debts__';
export const DEBT_COLOR = '#a06cf0';
export const DEBT_ICON = 'heart-handshake';
export type DebtFilter = 'owed' | 'receivable' | 'all';
export type DebtDirection = 'out' | 'in';

export function summarizeDebts(
  people: Account[],
  balances: ReadonlyMap<string, number>,
  balancesInBase: ReadonlyMap<string, number>,
  filter: DebtFilter = 'all',
) {
  const selected = people.filter((person) => {
    const balance = balances.get(person.id) ?? person.openingBalance;
    return filter === 'all' || (filter === 'owed' ? balance < 0 : balance > 0);
  });
  const missing = [
    ...new Set(
      selected
        .filter((person) => (balances.get(person.id) ?? person.openingBalance) !== 0 && !balancesInBase.has(person.id))
        .map((person) => person.currency),
    ),
  ];
  const total = selected.reduce((sum, person) => sumMinorUnits(sum, balancesInBase.get(person.id) ?? 0), 0);
  return { people: selected, total: filter === 'all' ? total : Math.abs(total), missing };
}

export function debtStatus(balance: number): string {
  const t = getDict().debts;
  return balance < 0 ? t.iOwe : balance > 0 ? t.owedToMe : t.settled;
}

export function debtHistory(transactions: Transaction[], openingBalance: number) {
  let balance = openingBalance;
  return [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt || a.id.localeCompare(b.id))
    .map((transaction) => {
      const before = balance;
      balance = sumMinorUnits(balance, transaction.amount);
      return { transaction, balance, before };
    })
    .reverse();
}

export function debtOperationLabel(amount: number, before: number): string {
  const t = getDict().debts;
  if (amount > 0) return before < 0 ? t.repaid : t.lent;
  return before > 0 ? t.receivedRepayment : t.borrowed;
}

export function debtTransferDraft(personId: string, walletId: string | undefined, direction: DebtDirection) {
  return {
    kind: 'transfer' as const,
    accountId: direction === 'out' ? walletId : personId,
    toAccountId: direction === 'out' ? personId : walletId,
  };
}
