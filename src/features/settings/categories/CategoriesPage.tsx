import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Plus } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import { useCategoryGroups } from '@/db/queries/categories';
import { useT } from '@/i18n';
import type { Category, CategoryGroup } from '@/db/types';
import { CategoryFormSheet } from './CategoryFormSheet';
import { GroupFormSheet } from './GroupFormSheet';
import { BUCKET_LABEL_KEY } from './CategoriesPage.constants';
import styles from './CategoriesPage.module.css';

type EditTarget = { group: CategoryGroup; category?: Category };

export function CategoriesPage() {
  const groups = useCategoryGroups();
  const navigate = useNavigate();
  const t = useT();
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);

  return (
    <div className={styles.root}>
      <button type="button" className={styles.back} onClick={() => void navigate(-1)}>
        <ArrowLeft size={18} aria-hidden="true" />
        {t.categoriesPage.back}
      </button>
      <h1 className={styles.title}>{t.categoriesPage.title}</h1>
      {groups.map((group) => (
        <div className={styles.group} key={group.id}>
          <div className={styles.groupHeader}>
            <span className={styles.groupDot} style={{ background: group.color }} />
            <span className={styles.groupName}>{group.name}</span>
            {group.bucket && (
              <span className={styles.groupBucket}>{t.categoriesPage[BUCKET_LABEL_KEY[group.bucket]]}</span>
            )}
          </div>
          <div className={styles.categoryList}>
            {group.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={styles.categoryRow}
                onClick={() => setEditTarget({ group, category })}
              >
                <AppIcon name={category.icon} size={18} className={styles.categoryIcon} />
                <span className={styles.categoryName}>{category.name}</span>
                {category.bucket && (
                  <span className={styles.categoryBucket}>{t.categoriesPage[BUCKET_LABEL_KEY[category.bucket]]}</span>
                )}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.categoryRow} ${styles.addCategoryRow}`}
              onClick={() => setEditTarget({ group })}
            >
              <Plus size={16} aria-hidden="true" />
              {t.categoriesPage.addCategory}
            </button>
          </div>
        </div>
      ))}
      <button type="button" className={styles.addGroupButton} onClick={() => setAddingGroup(true)}>
        <Plus size={16} aria-hidden="true" />
        {t.categoriesPage.addGroup}
      </button>
      {editTarget && (
        <CategoryFormSheet
          open
          onClose={() => setEditTarget(null)}
          group={editTarget.group}
          category={editTarget.category}
        />
      )}
      <GroupFormSheet open={addingGroup} onClose={() => setAddingGroup(false)} />
    </div>
  );
}
