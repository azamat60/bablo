import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { AppIcon } from '@/components/AppIcon';
import { archiveCategory, createCategory, deleteCategoryIfUnused, updateCategory } from '@/db/queries/categories';
import { DEFAULT_ICON_KEY, ICON_KEYS } from '@/lib/icons';
import { useT } from '@/i18n';
import type { Bucket, Category, CategoryGroup } from '@/db/types';
import { BUCKET_LABEL_KEY, BUCKET_OPTIONS } from './CategoriesPage.constants';
import styles from './CategoryFormSheet.module.css';

type CategoryFormSheetProps = {
  open: boolean;
  onClose: () => void;
  group: CategoryGroup;
  category?: Category;
};

export function CategoryFormSheet({ open, onClose, group, category }: CategoryFormSheetProps) {
  const t = useT();
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? DEFAULT_ICON_KEY);
  const [bucket, setBucket] = useState<Bucket | undefined>(category?.bucket ?? group.bucket ?? 'needs');
  const [saving, setSaving] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const isIncomeGroup = group.kind === 'income';
  const isEditing = Boolean(category);

  const resetAndClose = () => {
    setName('');
    setIcon(DEFAULT_ICON_KEY);
    setBucket(group.bucket ?? 'needs');
    setIconPickerOpen(false);
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    if (category) {
      await updateCategory(category.id, { name: name.trim(), icon, bucket: isIncomeGroup ? undefined : bucket });
    } else {
      await createCategory({
        groupId: group.id,
        name: name.trim(),
        icon,
        color: group.color,
        bucket: isIncomeGroup ? undefined : bucket,
      });
    }
    setSaving(false);
    resetAndClose();
  };

  const handleArchive = async () => {
    if (!category) return;
    await archiveCategory(category.id);
    resetAndClose();
  };

  const handleDelete = async () => {
    if (!category) return;
    await deleteCategoryIfUnused(category.id);
    resetAndClose();
  };

  return (
    <Sheet
      open={open}
      onClose={resetAndClose}
      title={isEditing ? t.categoryForm.editTitle : t.categoryForm.addTitle(group.name)}
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor="category-name">
          {t.categoryForm.name}
        </label>
        <div className={styles.row}>
          <button
            type="button"
            className={styles.iconTrigger}
            aria-label={t.categoryForm.chooseIconAria}
            onClick={() => setIconPickerOpen((open) => !open)}
          >
            <AppIcon name={icon} size={22} />
          </button>
          <input
            id="category-name"
            className={styles.nameInput}
            value={name}
            placeholder={t.categoryForm.namePlaceholder}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        {iconPickerOpen && (
          <div className={styles.iconGrid}>
            {ICON_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`${styles.iconOption} ${icon === key ? styles.iconOptionActive : ''}`}
                onClick={() => {
                  setIcon(key);
                  setIconPickerOpen(false);
                }}
              >
                <AppIcon name={key} size={20} />
              </button>
            ))}
          </div>
        )}
      </div>
      {!isIncomeGroup && (
        <div className={styles.field}>
          <span className={styles.label}>{t.categoryForm.bucket}</span>
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
      <button
        type="button"
        className={styles.saveButton}
        disabled={!name.trim() || saving}
        onClick={() => void handleSave()}
      >
        {t.categoryForm.save}
      </button>
      {isEditing && !category?.isSystem && (
        <div className={styles.dangerRow}>
          <button type="button" className={styles.dangerButton} onClick={() => void handleArchive()}>
            {t.categoryForm.archive}
          </button>
          <button type="button" className={styles.dangerButton} onClick={() => void handleDelete()}>
            {t.categoryForm.delete}
          </button>
        </div>
      )}
    </Sheet>
  );
}
