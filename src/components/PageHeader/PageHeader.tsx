import { ArrowLeft } from 'lucide-react';
import { useT } from '@/i18n';
import type { PageHeaderProps } from './PageHeader.types';
import styles from './PageHeader.module.css';

export function PageHeader({ title, onBack, action }: PageHeaderProps) {
  const t = useT();
  return (
    <div className={styles.root}>
      {onBack && (
        <button type="button" className={styles.back} onClick={onBack} aria-label={t.common.back}>
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
      )}
      <h1 className={styles.title}>{title}</h1>
      {action}
    </div>
  );
}
