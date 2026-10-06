import { useRef, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { AppIcon } from '@/components/AppIcon';
import { addRecommendedCategories, useCategoryRecommendations } from '@/db/queries/categoryRecommendations';
import { useLocale, useT } from '@/i18n';
import styles from './RecommendedCategoriesSheet.module.css';

export function RecommendedCategoriesSheet({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  const t = useT();
  const items = useCategoryRecommendations(locale);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const available = items ?? [];
  const selected = selection ?? new Set(available.map((item) => item.id));
  const selectedIds = available.filter((item) => selected.has(item.id)).map((item) => item.id);
  const groupNames = [...new Set(available.map((item) => item.group.name))];
  const toggle = (id: string) =>
    setSelection(() => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const save = async () => {
    if (savingRef.current || !selectedIds.length) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await addRecommendedCategories(selectedIds, locale);
      onClose();
    } catch {
      setError(t.categoriesPage.recommendFailed);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <Sheet
      open
      onClose={() => {
        if (!savingRef.current) onClose();
      }}
      title={t.categoriesPage.recommended}
    >
      <p className={styles.hint}>{t.categoriesPage.recommendedHint}</p>
      {items && !available.length && <p>{t.categoriesPage.allRecommendedAdded}</p>}
      <div className={styles.actions}>
        <button type="button" disabled={saving} onClick={() => setSelection(new Set(available.map((item) => item.id)))}>
          {t.statementReview.selectAll}
        </button>
        <button type="button" disabled={saving} onClick={() => setSelection(new Set())}>
          {t.statementReview.selectNone}
        </button>
      </div>
      {groupNames.map((name) => (
        <fieldset className={styles.group} key={name}>
          <legend>{name}</legend>
          {available
            .filter((item) => item.group.name === name)
            .map((item) => (
              <label className={styles.row} key={item.id}>
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  disabled={saving}
                  onChange={() => toggle(item.id)}
                />
                <AppIcon name={item.category.icon} size={18} />
                <span>{item.category.name}</span>
              </label>
            ))}
        </fieldset>
      ))}
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className={styles.save}
        disabled={saving || !selectedIds.length}
        onClick={() => void save()}
      >
        {saving ? t.onboarding.settingUp : t.categoriesPage.addRecommended(selectedIds.length)}
      </button>
    </Sheet>
  );
}
