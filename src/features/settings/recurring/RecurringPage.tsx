import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { db } from '@/db/db';
import { AppIcon } from '@/components/AppIcon';
import { useRecurring, deleteRecurring } from '@/db/queries/recurring';
import { formatMoney } from '@/domain/money';
import { monthLabel } from '@/domain/budget';
import { useT } from '@/i18n';
import type { Recurring } from '@/db/types';
import { FREQUENCY_LABEL_KEY } from './RecurringPage.constants';
import { RecurringFormSheet } from './RecurringFormSheet';
import styles from './RecurringPage.module.css';

export function RecurringPage() {
  const navigate = useNavigate();
  const t = useT();
  const items = useRecurring();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className={styles.root}>
      <button type="button" className={styles.back} onClick={() => void navigate(-1)}>
        <ArrowLeft size={18} aria-hidden="true" />
        {t.recurring.back}
      </button>
      <h1 className={styles.title}>{t.recurring.title}</h1>
      <div className={styles.list}>
        {items.length === 0 ? (
          <div className={styles.emptyState}>{t.recurring.empty}</div>
        ) : (
          items.map((item) => <RecurringRow key={item.id} item={item} />)
        )}
      </div>
      <button type="button" className={styles.addButton} onClick={() => setAddOpen(true)}>
        <Plus size={16} aria-hidden="true" />
        {t.recurring.addRecurring}
      </button>
      <RecurringFormSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function RecurringRow({ item }: { item: Recurring }) {
  const t = useT();
  const category = useLiveQuery(
    () => (item.categoryId ? db.categories.get(item.categoryId) : undefined),
    [item.categoryId],
  );
  const frequencyLabel = t.recurringConst[FREQUENCY_LABEL_KEY[item.frequency]];

  return (
    <div className={styles.row}>
      <AppIcon name={category?.icon ?? 'repeat'} size={18} className={styles.rowIcon} />
      <div className={styles.rowBody}>
        <div className={styles.rowTitle}>{category?.name ?? item.memo ?? t.recurring.fallbackTitle}</div>
        <div className={styles.rowSubtitle}>
          {t.recurring.nextRun(frequencyLabel, `${monthLabel(item.nextRun.slice(0, 7))} ${item.nextRun.slice(8, 10)}`)}
        </div>
      </div>
      <span className={styles.rowAmount}>{formatMoney(item.amount, item.currency)}</span>
      <button
        type="button"
        className={styles.removeButton}
        onClick={() => void deleteRecurring(item.id)}
        aria-label={t.recurring.deleteAria}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
