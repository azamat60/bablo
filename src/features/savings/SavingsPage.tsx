import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { useGoals, useGoalTotals } from '@/db/queries/goals';
import { useSettings } from '@/db/queries/settings';
import { formatMoney } from '@/domain/money';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { ProgressBar } from '@/components/ProgressBar';
import { useT } from '@/i18n';
import { GoalFormSheet } from './GoalFormSheet';
import { ContributeSheet } from './ContributeSheet';
import { GoalRow } from './GoalRow';
import styles from './SavingsPage.module.css';
import type { SavingsGoal } from '@/db/types';

export function SavingsPage() {
  const navigate = useNavigate();
  const t = useT();
  const settings = useSettings();
  const goals = useGoals();
  const totals = useGoalTotals();
  const [addOpen, setAddOpen] = useState(false);
  const [contributeGoal, setContributeGoal] = useState<SavingsGoal | null>(null);

  const currency = settings?.baseCurrency ?? 'USD';
  const totalSaved = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  const totalTarget = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const percent = totalTarget > 0 ? Math.round(Math.min(1, totalSaved / totalTarget) * 100) : 0;
  const remainingAmount = Math.max(0, totalTarget - totalSaved);

  return (
    <div className={styles.root}>
      <PageHeader
        title={t.savings.title}
        onBack={() => void navigate(-1)}
        action={
          <button
            type="button"
            className={styles.addIcon}
            onClick={() => setAddOpen(true)}
            aria-label={t.savings.addGoal}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        }
      />

      <Card variant="gradient" className={styles.hero}>
        <div className={styles.heroLabel}>{t.savings.totalSaved}</div>
        <div className={styles.heroValue}>{formatMoney(totalSaved, currency)}</div>
        {totalTarget > 0 && (
          <>
            <ProgressBar className={styles.heroProgress} value={totalSaved / totalTarget} color="#fff" />
            <div className={styles.heroSubline}>{t.savings.percentComplete(percent)}</div>
            <div className={styles.heroSubline}>
              {t.savings.remaining} {formatMoney(remainingAmount, currency)}
            </div>
          </>
        )}
      </Card>

      {goals.length === 0 ? (
        <EmptyState label={t.savings.empty} />
      ) : (
        <div className={styles.list}>
          {goals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              savedMinorUnits={totals.get(goal.id) ?? 0}
              currency={currency}
              onClick={() => setContributeGoal(goal)}
            />
          ))}
        </div>
      )}

      <button type="button" className={styles.addButton} onClick={() => setAddOpen(true)}>
        <Plus size={16} aria-hidden="true" />
        {t.savings.addGoal}
      </button>

      <GoalFormSheet open={addOpen} onClose={() => setAddOpen(false)} />
      <ContributeSheet goal={contributeGoal} onClose={() => setContributeGoal(null)} />
    </div>
  );
}
