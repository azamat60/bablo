import { AppIcon } from '@/components/AppIcon';
import { formatMoney } from '@/domain/money';
import { useT } from '@/i18n';
import type { CategoryBudgetSummary } from '@/domain/budget';
import styles from './CategoryBudgetRow.module.css';

type CategoryBudgetRowProps = {
  summary: CategoryBudgetSummary;
  currency: string;
  onClick: () => void;
};

export function CategoryBudgetRow({ summary, currency, onClick }: CategoryBudgetRowProps) {
  const t = useT();
  const { category, assigned, activity, available } = summary;
  const availableClass =
    available > 0 ? styles.availablePositive : available < 0 ? styles.availableNegative : styles.availableZero;
  const goal = category.goal;
  const goalProgress = goal && goal.amount > 0 ? Math.min(1, Math.max(0, available / goal.amount)) : null;

  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <AppIcon name={category.icon} size={20} className={styles.icon} />
      <span className={styles.body}>
        <span className={styles.name}>{category.name}</span>
        <span className={styles.subRow}>
          <span>
            {t.budget.assigned}
            {formatMoney(assigned, currency)}
          </span>
          <span>
            {t.budget.spent}
            {formatMoney(Math.abs(activity), currency)}
          </span>
        </span>
        {goalProgress !== null && (
          <span className={styles.goalBar}>
            <span className={styles.goalFill} style={{ width: `${goalProgress * 100}%` }} />
          </span>
        )}
      </span>
      <span className={styles.availableWrap}>
        <span className={styles.availableLabel}>{t.budget.remaining}</span>
        <span className={`${styles.available} ${availableClass}`}>{formatMoney(available, currency)}</span>
      </span>
    </button>
  );
}
