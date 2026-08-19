import { useMemo, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { AppIcon } from '@/components/AppIcon';
import { useCategoryGroups } from '@/db/queries/categories';
import { useTransactions } from '@/db/queries/transactions';
import { useT } from '@/i18n';
import type { Category, CategoryGroupKind } from '@/db/types';
import styles from './CategoryPickerSheet.module.css';

type CategoryPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (categoryId: string) => void;
  kind: CategoryGroupKind;
};

const RECENT_LIMIT = 6;

export function CategoryPickerSheet({ open, onClose, onSelect, kind }: CategoryPickerSheetProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const groups = useCategoryGroups().filter((group) => group.kind === kind);
  const transactions = useTransactions();

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const group of groups) {
      for (const category of group.categories) map.set(category.id, category);
    }
    return map;
  }, [groups]);

  const recentCategories = useMemo(() => {
    const seen = new Set<string>();
    const result: Category[] = [];
    for (const tx of transactions) {
      if (!tx.categoryId || seen.has(tx.categoryId)) continue;
      const category = categoryById.get(tx.categoryId);
      if (!category) continue;
      seen.add(tx.categoryId);
      result.push(category);
      if (result.length >= RECENT_LIMIT) break;
    }
    return result;
  }, [transactions, categoryById]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = normalizedQuery
    ? groups
        .map((group) => ({
          ...group,
          categories: group.categories.filter((category) => category.name.toLowerCase().includes(normalizedQuery)),
        }))
        .filter((group) => group.categories.length > 0)
    : groups;
  const noResults = normalizedQuery !== '' && filteredGroups.length === 0;

  const handleSelect = (categoryId: string) => {
    setQuery('');
    onSelect(categoryId);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t.sheets.chooseCategory}>
      <div className={styles.body}>
        <input
          className={styles.search}
          placeholder={t.common.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {!normalizedQuery && recentCategories.length > 0 && (
          <div className={styles.group}>
            <div className={styles.groupName}>{t.sheets.recent}</div>
            <div className={styles.grid}>
              {recentCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={styles.chip}
                  onClick={() => handleSelect(category.id)}
                >
                  <AppIcon name={category.icon} size={20} className={styles.chipIcon} />
                  <span className={styles.chipLabel}>{category.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {noResults && <div className={styles.noResults}>{t.sheets.noResults}</div>}
        {filteredGroups.map((group) => (
          <div className={styles.group} key={group.id}>
            <div className={styles.groupName}>{group.name}</div>
            <div className={styles.grid}>
              {group.categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={styles.chip}
                  onClick={() => handleSelect(category.id)}
                >
                  <AppIcon name={category.icon} size={20} className={styles.chipIcon} />
                  <span className={styles.chipLabel}>{category.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
