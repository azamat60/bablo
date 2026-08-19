import { getDict } from '@/i18n';
import type { Account, AccountType } from '@/db/types';

export type AccountSectionKey = 'debit' | 'credit' | 'savings' | 'invest' | 'loan';

const SECTION_BY_TYPE: Record<AccountType, AccountSectionKey> = {
  cash: 'debit',
  debit_card: 'debit',
  ewallet: 'debit',
  credit_card: 'credit',
  savings: 'savings',
  investment: 'invest',
  loan: 'loan',
};

function sectionLabel(key: AccountSectionKey): string {
  const t = getDict();
  const labels: Record<AccountSectionKey, string> = {
    debit: t.accounts.sectionDebit,
    credit: t.accounts.sectionCredit,
    savings: t.accounts.sectionSavings,
    invest: t.accounts.sectionInvest,
    loan: t.accounts.sectionLoan,
  };
  return labels[key];
}

const SECTION_ORDER: readonly AccountSectionKey[] = ['debit', 'credit', 'savings', 'invest', 'loan'];

export type AccountSection = {
  key: AccountSectionKey;
  label: string;
  accounts: Account[];
  totalMinorUnits: number;
};

export function groupAccounts(accounts: Account[], balances: Map<string, number>): AccountSection[] {
  const buckets = new Map<AccountSectionKey, Account[]>();
  for (const account of accounts) {
    const key = SECTION_BY_TYPE[account.type];
    const list = buckets.get(key) ?? [];
    list.push(account);
    buckets.set(key, list);
  }
  return SECTION_ORDER.filter((key) => buckets.has(key)).map((key) => {
    const sectionAccounts = buckets.get(key) ?? [];
    const totalMinorUnits = sectionAccounts.reduce((sum, account) => sum + (balances.get(account.id) ?? 0), 0);
    return { key, label: sectionLabel(key), accounts: sectionAccounts, totalMinorUnits };
  });
}

export type NetWorthBreakdown = { assets: number; liabilities: number; netWorth: number };

const LIABILITY_TYPES: readonly AccountType[] = ['credit_card', 'loan'];

export function netWorthBreakdown(accounts: Account[], balances: Map<string, number>): NetWorthBreakdown {
  let assets = 0;
  let liabilities = 0;
  for (const account of accounts) {
    const balance = balances.get(account.id) ?? 0;
    const isLiability = LIABILITY_TYPES.includes(account.type) && balance < 0;
    if (isLiability) liabilities += -balance;
    else assets += balance;
  }
  return { assets, liabilities, netWorth: assets - liabilities };
}

export function availableCredit(account: Account, balance: number): number | undefined {
  if (account.type !== 'credit_card' || account.creditLimit === undefined) return undefined;
  return account.creditLimit + balance;
}
