import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import styles from './EmptyState.module.css';

type EmptyStateProps = {
  label: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ label, description, icon: Icon = Inbox, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className={styles.root}>
      <Icon className={styles.icon} size={28} aria-hidden="true" />
      <span className={styles.title}>{label}</span>
      {description && <span className={styles.description}>{description}</span>}
      {actionLabel && onAction && (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
