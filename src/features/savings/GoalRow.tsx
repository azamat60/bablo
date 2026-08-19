import { AppIcon } from '@/components/AppIcon';
import { ProgressBar } from '@/components/ProgressBar';
import { formatMoney } from '@/domain/money';
import { goalProgress } from '@/domain/goals';
import { useT } from '@/i18n';
import type { SavingsGoal } from '@/db/types';
import styles from './SavingsPage.module.css';

type GoalRowProps = {
  goal: SavingsGoal;
  savedMinorUnits: number;
  currency: string;
  onClick: () => void;
};

export function GoalRow({ goal, savedMinorUnits, currency, onClick }: GoalRowProps) {
  const t = useT();
  const progress = goalProgress(goal, savedMinorUnits);

  return (
    <button type="button" className={styles.goalRow} onClick={onClick}>
      <span className={styles.goalIcon} style={{ background: goal.color }}>
        <AppIcon name={goal.icon} size={18} />
      </span>
      <span className={styles.goalBody}>
        <span className={styles.goalTopLine}>
          <span className={styles.goalName}>{goal.name}</span>
          <span className={styles.goalAmount}>{formatMoney(savedMinorUnits, currency)}</span>
        </span>
        <ProgressBar value={progress} color={goal.color} />
        <span className={styles.goalTarget}>{t.savings.goalPrefix(formatMoney(goal.targetAmount, currency))}</span>
      </span>
    </button>
  );
}
