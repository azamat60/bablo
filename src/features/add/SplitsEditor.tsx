import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X } from 'lucide-react';
import { db } from '@/db/db';
import { AppIcon } from '@/components/AppIcon';
import { CategoryPickerSheet } from '@/components/CategoryPickerSheet';
import { toMinorUnits, formatMoney } from '@/domain/money';
import { useT } from '@/i18n';
import type { CategoryGroupKind } from '@/db/types';
import type { SplitRow } from './TransactionForm.types';
import styles from './SplitsEditor.module.css';

type SplitsEditorProps = {
  rows: SplitRow[];
  onChange: (rows: SplitRow[]) => void;
  totalMinorUnits: number;
  currency: string;
  kind: CategoryGroupKind;
};

export function SplitsEditor({ rows, onChange, totalMinorUnits, currency, kind }: SplitsEditorProps) {
  const t = useT();
  const [pickerForRow, setPickerForRow] = useState<string | null>(null);

  const assigned = rows.reduce((sum, row) => sum + toMinorUnits(row.amountText), 0);
  const remaining = totalMinorUnits - assigned;

  const updateRow = (localId: string, patch: Partial<SplitRow>) => {
    onChange(rows.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  };

  const removeRow = (localId: string) => {
    onChange(rows.filter((row) => row.localId !== localId));
  };

  const addRow = () => {
    onChange([...rows, { localId: uuidv4(), amountText: '' }]);
  };

  return (
    <div>
      <div className={styles.list}>
        {rows.map((row) => (
          <SplitRowItem
            key={row.localId}
            row={row}
            onPickCategory={() => setPickerForRow(row.localId)}
            onAmountChange={(amountText) => updateRow(row.localId, { amountText })}
            onRemove={() => removeRow(row.localId)}
          />
        ))}
      </div>
      <button type="button" className={styles.addButton} onClick={addRow}>
        <Plus size={16} aria-hidden="true" />
        {t.splits.addSplit}
      </button>
      <div className={`${styles.remaining} ${remaining === 0 ? styles.remainingOk : styles.remainingBad}`}>
        {remaining === 0 ? t.splits.matchTotal : t.splits.remaining(formatMoney(remaining, currency))}
      </div>
      <CategoryPickerSheet
        open={pickerForRow !== null}
        onClose={() => setPickerForRow(null)}
        kind={kind}
        onSelect={(categoryId) => {
          if (pickerForRow) updateRow(pickerForRow, { categoryId });
          setPickerForRow(null);
        }}
      />
    </div>
  );
}

type SplitRowItemProps = {
  row: SplitRow;
  onPickCategory: () => void;
  onAmountChange: (value: string) => void;
  onRemove: () => void;
};

function SplitRowItem({ row, onPickCategory, onAmountChange, onRemove }: SplitRowItemProps) {
  const t = useT();
  const category = useLiveQuery(
    () => (row.categoryId ? db.categories.get(row.categoryId) : undefined),
    [row.categoryId],
  );

  return (
    <div className={styles.row}>
      <button type="button" className={styles.categoryButton} onClick={onPickCategory}>
        <AppIcon name={category?.icon} size={16} className={styles.categoryIcon} />
        <span className={styles.categoryLabel}>{category?.name ?? t.splits.chooseCategory}</span>
      </button>
      <input
        className={styles.amountInput}
        inputMode="decimal"
        placeholder="0"
        value={row.amountText}
        onChange={(event) => onAmountChange(event.target.value)}
      />
      <button type="button" className={styles.removeButton} onClick={onRemove} aria-label={t.splits.removeAria}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
