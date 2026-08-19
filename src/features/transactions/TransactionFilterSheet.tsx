import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { db } from '@/db/db';
import { Sheet } from '@/components/Sheet';
import { AccountPickerSheet } from '@/components/AccountPickerSheet';
import { CategoryPickerSheet } from '@/components/CategoryPickerSheet';
import { useT } from '@/i18n';
import type { TransactionFilter } from '@/domain/transactions';
import styles from './TransactionFilterSheet.module.css';

type TransactionFilterSheetProps = {
  open: boolean;
  onClose: () => void;
  filter: TransactionFilter;
  onChange: (filter: TransactionFilter) => void;
};

export function TransactionFilterSheet({ open, onClose, filter, onChange }: TransactionFilterSheetProps) {
  const t = useT();
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const account = useLiveQuery(
    () => (filter.accountId ? db.accounts.get(filter.accountId) : undefined),
    [filter.accountId],
  );
  const category = useLiveQuery(
    () => (filter.categoryId ? db.categories.get(filter.categoryId) : undefined),
    [filter.categoryId],
  );

  return (
    <Sheet open={open} onClose={onClose} title={t.transactionFilter.title}>
      <div className={styles.field}>
        <span className={styles.label}>{t.transactionFilter.account}</span>
        <button type="button" className={styles.row} onClick={() => setAccountPickerOpen(true)}>
          <span className={styles.rowValue}>{account?.name ?? t.transactionFilter.allAccounts}</span>
          {filter.accountId && (
            <span
              className={styles.clearIcon}
              onClick={(event) => {
                event.stopPropagation();
                onChange({ ...filter, accountId: undefined });
              }}
            >
              <X size={14} aria-hidden="true" />
            </span>
          )}
        </button>
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{t.transactionFilter.category}</span>
        <button type="button" className={styles.row} onClick={() => setCategoryPickerOpen(true)}>
          <span className={styles.rowValue}>{category?.name ?? t.transactionFilter.allCategories}</span>
          {filter.categoryId && (
            <span
              className={styles.clearIcon}
              onClick={(event) => {
                event.stopPropagation();
                onChange({ ...filter, categoryId: undefined });
              }}
            >
              <X size={14} aria-hidden="true" />
            </span>
          )}
        </button>
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{t.transactionFilter.dateRange}</span>
        <div className={styles.dateRow}>
          <input
            type="date"
            className={styles.dateInput}
            value={filter.dateFrom ?? ''}
            onChange={(event) => onChange({ ...filter, dateFrom: event.target.value || undefined })}
          />
          <input
            type="date"
            className={styles.dateInput}
            value={filter.dateTo ?? ''}
            onChange={(event) => onChange({ ...filter, dateTo: event.target.value || undefined })}
          />
        </div>
      </div>
      <button type="button" className={styles.clearButton} onClick={() => onChange({})}>
        {t.transactionFilter.clearAll}
      </button>
      <AccountPickerSheet
        open={accountPickerOpen}
        onClose={() => setAccountPickerOpen(false)}
        onSelect={(accountId) => {
          onChange({ ...filter, accountId });
          setAccountPickerOpen(false);
        }}
      />
      <CategoryPickerSheet
        open={categoryPickerOpen}
        onClose={() => setCategoryPickerOpen(false)}
        kind="expense"
        onSelect={(categoryId) => {
          onChange({ ...filter, categoryId });
          setCategoryPickerOpen(false);
        }}
      />
    </Sheet>
  );
}
