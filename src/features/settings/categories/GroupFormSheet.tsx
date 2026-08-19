import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { createCategoryGroup } from '@/db/queries/categories';
import { useT } from '@/i18n';
import type { Bucket, CategoryGroupKind } from '@/db/types';
import { BUCKET_LABEL_KEY, BUCKET_OPTIONS, GROUP_COLOR_OPTIONS, GROUP_KIND_OPTIONS } from './CategoriesPage.constants';
import styles from './CategoryFormSheet.module.css';

const KIND_LABEL_KEY: Record<CategoryGroupKind, 'kindExpense' | 'kindIncome'> = {
  expense: 'kindExpense',
  income: 'kindIncome',
};

type GroupFormSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function GroupFormSheet({ open, onClose }: GroupFormSheetProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryGroupKind>('expense');
  const [bucket, setBucket] = useState<Bucket>('needs');
  const [color, setColor] = useState(GROUP_COLOR_OPTIONS[0] ?? '#4f8dfd');
  const [saving, setSaving] = useState(false);

  const resetAndClose = () => {
    setName('');
    setKind('expense');
    setBucket('needs');
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await createCategoryGroup({ name: name.trim(), kind, bucket: kind === 'expense' ? bucket : undefined, color });
    setSaving(false);
    resetAndClose();
  };

  return (
    <Sheet open={open} onClose={resetAndClose} title={t.groupForm.title}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="group-name">
          {t.groupForm.name}
        </label>
        <input
          id="group-name"
          className={styles.nameInput}
          value={name}
          placeholder={t.groupForm.namePlaceholder}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{t.groupForm.type}</span>
        <div className={styles.chipRow}>
          {GROUP_KIND_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.chip} ${kind === option.value ? styles.chipActive : ''}`}
              onClick={() => setKind(option.value)}
            >
              {t.categoriesPage[KIND_LABEL_KEY[option.value]]}
            </button>
          ))}
        </div>
      </div>
      {kind === 'expense' && (
        <div className={styles.field}>
          <span className={styles.label}>{t.groupForm.defaultBucket}</span>
          <div className={styles.chipRow}>
            {BUCKET_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.chip} ${bucket === option.value ? styles.chipActive : ''}`}
                onClick={() => setBucket(option.value)}
              >
                {t.categoriesPage[BUCKET_LABEL_KEY[option.value]]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={styles.field}>
        <span className={styles.label}>{t.groupForm.color}</span>
        <div className={styles.chipRow}>
          {GROUP_COLOR_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={option}
              className={styles.chip}
              style={{
                background: option,
                border: option === color ? '2px solid var(--color-text)' : '1.5px solid transparent',
              }}
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
        {t.groupForm.save}
      </button>
    </Sheet>
  );
}
