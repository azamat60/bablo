import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { addContribution } from '@/db/queries/goals';
import { useSettings } from '@/db/queries/settings';
import { todayIsoDate } from '@/domain/transactions';
import { toMinorUnits } from '@/domain/money';
import { useT } from '@/i18n';
import type { SavingsGoal } from '@/db/types';
import styles from './GoalFormSheet.module.css';

type ContributeSheetProps = {
  goal: SavingsGoal | null;
  onClose: () => void;
};

export function ContributeSheet({ goal, onClose }: ContributeSheetProps) {
  const t = useT();
  const settings = useSettings();
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const resetAndClose = () => {
    setAmount('');
    onClose();
  };

  const handleSave = async () => {
    if (!goal || toMinorUnits(amount) === 0) return;
    setSaving(true);
    await addContribution({ goalId: goal.id, amount: toMinorUnits(amount), date: todayIsoDate() });
    setSaving(false);
    resetAndClose();
  };

  return (
    <Sheet open={Boolean(goal)} onClose={resetAndClose} title={goal ? t.contribute.title(goal.name) : undefined}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="contribution-amount">
          {t.contribute.amount(settings?.baseCurrency ?? '')}
        </label>
        <input
          id="contribution-amount"
          className={styles.amountInput}
          inputMode="decimal"
          placeholder="0"
          autoFocus
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>
      <button
        type="button"
        className={styles.saveButton}
        disabled={toMinorUnits(amount) === 0 || saving}
        onClick={() => void handleSave()}
      >
        {t.contribute.add}
      </button>
    </Sheet>
  );
}
