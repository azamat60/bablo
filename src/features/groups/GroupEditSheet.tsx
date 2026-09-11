import { useState } from 'react';
import { useNavigate } from 'react-router';
import { X } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { AppIcon } from '@/components/AppIcon';
import {
  archiveCategoryGroup,
  createCategory,
  deleteCategoryIfUnused,
  updateCategory,
  updateCategoryGroup,
  type CategoryGroupWithCategories,
} from '@/db/queries/categories';
import { groupIcon } from '@/domain/groups';
import { ICON_KEYS } from '@/lib/icons';
import { GROUP_COLOR_OPTIONS } from '@/features/settings/categories/CategoriesPage.constants';
import { useT } from '@/i18n';
import styles from './GroupEditSheet.module.css';

type SubRow = { id?: string; name: string };

export type GroupEditSheetProps = {
  open: boolean;
  group: CategoryGroupWithCategories;
  onClose: () => void;
};

/**
 * Edits a group and its subcategories in one place — what Budget OK shows
 * when you tap the pencil on a category.
 */
export function GroupEditSheet({ open, group, onClose }: GroupEditSheetProps) {
  // Remounting on open re-seeds the form from the live group without an effect.
  if (!open) return null;
  return <GroupEditForm key={group.updatedAt} group={group} onClose={onClose} />;
}

function GroupEditForm({ group, onClose }: Omit<GroupEditSheetProps, 'open'>) {
  const t = useT();
  const navigate = useNavigate();
  const [name, setName] = useState(group.name);
  const [icon, setIcon] = useState(() => groupIcon(group, group.categories));
  const [color, setColor] = useState(group.color);
  const [rows, setRows] = useState<SubRow[]>(() =>
    group.categories.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name })),
  );
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const updateRow = (index: number, value: string) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, name: value } : row)));
  const removeRow = (index: number) => setRows((current) => current.filter((_, i) => i !== index));
  const addRow = () => setRows((current) => [...current, { name: '' }]);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);

    await updateCategoryGroup(group.id, { name: name.trim(), icon, color });

    const keptIds = new Set(rows.map((row) => row.id).filter(Boolean));
    for (const category of group.categories) {
      if (!category.archived && !keptIds.has(category.id)) await deleteCategoryIfUnused(category.id);
    }
    for (const row of rows) {
      const trimmed = row.name.trim();
      if (!trimmed) continue;
      if (row.id) {
        const existing = group.categories.find((c) => c.id === row.id);
        if (existing && existing.name !== trimmed) await updateCategory(row.id, { name: trimmed });
      } else {
        await createCategory({ groupId: group.id, name: trimmed, icon, color, bucket: group.bucket });
      }
    }

    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!window.confirm(t.groupEdit.deleteConfirm)) return;
    await archiveCategoryGroup(group.id);
    onClose();
    void navigate('/', { replace: true });
  };

  return (
    <Sheet open onClose={onClose} title={t.groupEdit.title}>
      <div className={styles.iconSection}>
        <span className={styles.iconLabel}>{t.groupEdit.icon}</span>
        <button
          type="button"
          className={styles.iconCircle}
          style={{ background: color, color }}
          onClick={() => setIconPickerOpen((v) => !v)}
          aria-expanded={iconPickerOpen}
        >
          <AppIcon name={icon} size={36} className={styles.iconGlyph} />
        </button>
      </div>

      {iconPickerOpen && (
        <>
          <div className={styles.colorRow}>
            {GROUP_COLOR_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={option}
                className={`${styles.colorSwatch} ${option === color ? styles.colorSwatchActive : ''}`}
                style={{ background: option }}
                onClick={() => setColor(option)}
              />
            ))}
          </div>
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
                aria-label={key}
              >
                <AppIcon name={key} size={18} />
              </button>
            ))}
          </div>
        </>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="group-edit-name">
          {t.groupEdit.name}
        </label>
        <input
          id="group-edit-name"
          className={styles.input}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className={styles.subTitle}>{t.groupEdit.subcategories}</div>
      <div className={styles.subList}>
        {rows.map((row, index) => (
          <div key={row.id ?? `new-${index}`} className={styles.subRow}>
            <input
              className={styles.subInput}
              value={row.name}
              placeholder={t.groupEdit.subcategoryPlaceholder}
              onChange={(event) => updateRow(index, event.target.value)}
              autoFocus={!row.id && row.name === ''}
            />
            <button
              type="button"
              className={styles.subRemove}
              onClick={() => removeRow(index)}
              aria-label={t.groupEdit.removeAria}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" className={styles.addRow} onClick={addRow}>
          {t.groupEdit.add}
        </button>
      </div>

      <button type="button" className={styles.save} disabled={!name.trim() || saving} onClick={() => void handleSave()}>
        {t.groupEdit.save}
      </button>
      <button type="button" className={styles.delete} onClick={() => void handleDelete()}>
        {t.groupEdit.delete}
      </button>
    </Sheet>
  );
}
