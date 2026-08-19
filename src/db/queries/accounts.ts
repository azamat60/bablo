import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { newMeta, touchMeta } from '@/db/meta';
import type { Account, AccountType } from '@/db/types';

export function useAccounts(includeArchived = false): Account[] {
  return (
    useLiveQuery(async () => {
      const all = await db.accounts.orderBy('order').toArray();
      return includeArchived ? all : all.filter((account) => !account.archived);
    }, [includeArchived]) ?? []
  );
}

export type NewAccountInput = {
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
  color: string;
  icon: string;
  creditLimit?: number;
};

export async function createAccount(input: NewAccountInput): Promise<string> {
  const order = await db.accounts.count();
  const account: Account = {
    ...newMeta(),
    ...input,
    order,
    archived: false,
  };
  await db.accounts.add(account);
  return account.id;
}

export async function archiveAccount(id: string): Promise<void> {
  const account = await db.accounts.get(id);
  if (!account) return;
  await db.accounts.update(id, { archived: true, ...touchMeta(account.rev) });
}
