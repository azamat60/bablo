import { useRef, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { Segmented } from '@/components/Segmented';
import type { Account } from '@/db/types';
import { saveDebtPerson } from '@/db/queries/debts';
import { useSettings } from '@/db/queries/settings';
import { decimalFromMinor, parseMinorUnits } from '@/domain/money';
import { CURRENCY_SYMBOL } from '@/domain/money.constants';
import { useT } from '@/i18n';
import styles from './DebtsPage.module.css';

type Props = { open: boolean; onClose: () => void; person?: Account; onSaved?: (id: string) => void };

export function DebtPersonFormSheet({ open, onClose, person, onSaved }: Props) {
  const t = useT();
  const settings = useSettings();
  return (
    <Sheet open={open} onClose={onClose} title={person ? t.debts.editPerson : t.debts.addPerson}>
      {open && (
        <DebtPersonForm
          person={person}
          defaultCurrency={settings?.baseCurrency ?? 'KGS'}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Sheet>
  );
}

function DebtPersonForm({
  person,
  defaultCurrency,
  onClose,
  onSaved,
}: Omit<Props, 'open'> & { defaultCurrency: string }) {
  const t = useT();
  const [name, setName] = useState(person?.name ?? '');
  const [currency, setCurrency] = useState(person?.currency ?? defaultCurrency);
  const [amount, setAmount] = useState(person?.openingBalance ? decimalFromMinor(Math.abs(person.openingBalance)) : '');
  const [direction, setDirection] = useState<'owed' | 'receivable'>(
    person && person.openingBalance < 0 ? 'owed' : 'receivable',
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const minor = amount.trim() ? parseMinorUnits(amount) : 0;
  const validAmount = minor !== undefined && minor >= 0;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !validAmount || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      const id = await saveDebtPerson(
        { name, currency, openingBalance: direction === 'owed' ? -minor : minor },
        person?.id,
      );
      onClose();
      onSaved?.(id);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t.debts.saveError);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={(event) => void save(event)}>
      <label className={styles.field}>
        <span>{t.debts.person}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t.debts.namePlaceholder}
          maxLength={200}
          required
          disabled={saving}
        />
      </label>
      <label className={styles.field}>
        <span>{t.debts.currency}</span>
        <select
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          disabled={Boolean(person) || saving}
        >
          {[...new Set([currency, ...Object.keys(CURRENCY_SYMBOL)])].map((code) => (
            <option key={code} value={code}>
              {code} · {CURRENCY_SYMBOL[code] ?? code}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>{t.debts.openingBalance}</span>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          placeholder="0"
          aria-invalid={!validAmount}
          disabled={saving}
        />
      </label>
      <Segmented
        options={[
          { value: 'receivable', label: t.debts.owedToMe },
          { value: 'owed', label: t.debts.iOwe },
        ]}
        value={direction}
        onChange={setDirection}
      />
      <p className={styles.hint}>{t.debts.openingHint}</p>
      {!validAmount && (
        <p className={styles.error} role="alert">
          {t.debts.invalidAmount}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button className={styles.primaryButton} type="submit" disabled={saving || !name.trim() || !validAmount}>
        {t.common.save}
      </button>
    </form>
  );
}
