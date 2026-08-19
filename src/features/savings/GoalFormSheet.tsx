import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { AppIcon } from '@/components/AppIcon';
import { createGoal } from '@/db/queries/goals';
import { useSettings } from '@/db/queries/settings';
import { toMinorUnits } from '@/domain/money';
import { useT } from '@/i18n';
import { GOAL_COLORS, GOAL_ICON_OPTIONS } from './SavingsPage.constants';
import styles from './GoalFormSheet.module.css';

type GoalFormSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function GoalFormSheet({ open, onClose }: GoalFormSheetProps) {
  const t = useT();
  const settings = useSettings();
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [icon, setIcon] = useState(GOAL_ICON_OPTIONS[0] ?? 'piggy-bank');
  const [color, setColor] = useState(GOAL_COLORS[0] ?? '#5b5bd6');
  const [saving, setSaving] = useState(false);

  const resetAndClose = () => {
    setName('');
    setTargetAmount('');
    setTargetDate('');
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim() || !settings) return;
    setSaving(true);
    await createGoal({
      name: name.trim(),
      icon,
      color,
      targetAmount: toMinorUnits(targetAmount),
      targetDate: targetDate || undefined,
    });
    setSaving(false);
    resetAndClose();
  };

  return (
    <Sheet open={open} onClose={resetAndClose} title={t.goalForm.title}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="goal-name">
          {t.goalForm.name}
        </label>
        <input
          id="goal-name"
          className={styles.textInput}
          value={name}
          placeholder={t.goalForm.namePlaceholder}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="goal-amount">
          {t.goalForm.targetAmount(settings?.baseCurrency ?? '')}
        </label>
        <input
          id="goal-amount"
          className={styles.amountInput}
          inputMode="decimal"
          placeholder="0"
          value={targetAmount}
          onChange={(event) => setTargetAmount(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="goal-date">
          {t.goalForm.targetDateOptional}
        </label>
        <input
          id="goal-date"
          type="date"
          className={styles.textInput}
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{t.goalForm.icon}</span>
        <div className={styles.iconRow}>
          {GOAL_ICON_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`${styles.iconChip} ${icon === option ? styles.iconChipActive : ''}`}
              onClick={() => setIcon(option)}
            >
              <AppIcon name={option} size={18} />
            </button>
          ))}
        </div>
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{t.goalForm.color}</span>
        <div className={styles.colorRow}>
          {GOAL_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={option}
              className={styles.colorSwatch}
              style={{ background: option, borderColor: option === color ? 'var(--color-text)' : 'transparent' }}
              onClick={() => setColor(option)}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        className={styles.saveButton}
        disabled={!name.trim() || saving}
        onClick={() => void handleSave()}
      >
        {t.goalForm.save}
      </button>
    </Sheet>
  );
}
