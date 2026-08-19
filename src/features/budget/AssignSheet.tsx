import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { NumberPad } from '@/components/NumberPad';
import { useNumberPad } from '@/hooks/useNumberPad';
import { setAssigned } from '@/db/queries/budgets';
import { updateCategory } from '@/db/queries/categories';
import { formatMoney, toMinorUnits } from '@/domain/money';
import { useT } from '@/i18n';
import type { CategoryBudgetSummary } from '@/domain/budget';
import styles from './AssignSheet.module.css';

type AssignSheetProps = {
  open: boolean;
  onClose: () => void;
  summary: CategoryBudgetSummary;
  month: string;
  currency: string;
};

export function AssignSheet({ open, onClose, summary, month, currency }: AssignSheetProps) {
  if (!open) return null;
  return (
    <Sheet open={open} onClose={onClose} title={summary.category.name}>
      <AssignSheetBody
        key={`${summary.category.id}-${month}`}
        summary={summary}
        month={month}
        currency={currency}
        onDone={onClose}
      />
    </Sheet>
  );
}

type AssignSheetBodyProps = {
  summary: CategoryBudgetSummary;
  month: string;
  currency: string;
  onDone: () => void;
};

function AssignSheetBody({ summary, month, currency, onDone }: AssignSheetBodyProps) {
  const t = useT();
  const pad = useNumberPad(summary.assigned / 100);
  const [goalText, setGoalText] = useState(summary.category.goal ? String(summary.category.goal.amount / 100) : '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await setAssigned(month, summary.category.id, pad.minorUnits);
    const goalAmount = toMinorUnits(goalText);
    if (goalAmount > 0) {
      await updateCategory(summary.category.id, { goal: { type: 'target_balance', amount: goalAmount } });
    } else if (summary.category.goal) {
      await updateCategory(summary.category.id, { goal: undefined });
    }
    setSaving(false);
    onDone();
  };

  return (
    <div>
      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t.assignSheet.spent}</span>
          <span className={styles.summaryValue}>{formatMoney(Math.abs(summary.activity), currency)}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t.assignSheet.available}</span>
          <span className={styles.summaryValue}>{formatMoney(summary.available, currency)}</span>
        </div>
      </div>
      <div className={styles.amountWrap}>
        <span className={styles.amount}>
          {pad.displayText}
          <span className={styles.currency}>
            {currency}
            {t.assignSheet.assignedSuffix}
          </span>
        </span>
      </div>
      <div className={styles.goalField}>
        <span className={styles.goalLabel}>{t.assignSheet.targetBalanceOptional}</span>
        <input
          className={styles.goalInput}
          inputMode="decimal"
          placeholder="0"
          value={goalText}
          onChange={(event) => setGoalText(event.target.value)}
        />
      </div>
      <button type="button" className={styles.saveButton} disabled={saving} onClick={() => void handleSave()}>
        {t.assignSheet.save}
      </button>
      <NumberPad onKey={pad.press} />
    </div>
  );
}
