import { db } from '@/db/db';
import { touchMeta } from '@/db/meta';
import { readLedger } from '@/db/cloud';
import { useAccounts, createAccount } from './accounts';
import { DEBT_COLOR, DEBT_ICON, DEBT_TYPE } from '@/domain/debts';
import { LEDGER_TABLES, validateLedger } from '../../../shared/ledger';

export type DebtPersonInput = { name: string; currency: string; openingBalance: number };

export function useDebtPeople() {
  return useAccounts(false, true).filter((account) => account.type === DEBT_TYPE);
}

export async function saveDebtPerson(input: DebtPersonInput, id?: string): Promise<string> {
  if (!input.name.trim() || input.name.trim().length > 200) throw new Error('Укажите имя длиной до 200 символов.');
  if (!Number.isSafeInteger(input.openingBalance)) throw new Error('Неверная сумма долга.');
  return db.transaction(
    'rw',
    LEDGER_TABLES.map((name) => db.table(name)),
    async () => {
      let personId = id;
      if (id) {
        const person = await db.accounts.get(id);
        if (!person || person.deleted || person.type !== DEBT_TYPE) throw new Error('Человек больше недоступен.');
        if (person.currency !== input.currency) throw new Error('Валюту существующего долга менять нельзя.');
        await db.accounts.update(id, {
          name: input.name.trim(),
          openingBalance: input.openingBalance,
          ...touchMeta(person.rev),
        });
      } else {
        personId = await createAccount({
          ...input,
          name: input.name.trim(),
          type: DEBT_TYPE,
          color: DEBT_COLOR,
          icon: DEBT_ICON,
        });
      }
      validateLedger(await readLedger());
      return personId!;
    },
  );
}
