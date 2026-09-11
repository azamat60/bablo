import { ChevronDown } from 'lucide-react';
import type { SectionHeaderProps } from './SectionHeader.types';
import styles from './SectionHeader.module.css';

export function SectionHeader({
  title,
  total,
  secondaryTotal,
  open = true,
  onToggle,
  action,
  controls,
}: SectionHeaderProps) {
  const content = (
    <>
      {onToggle && (
        <ChevronDown className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} size={18} aria-hidden="true" />
      )}
      <span className={styles.title}>{title}</span>
      {action}
      <span className={styles.totals}>
        {total !== undefined && <span className={styles.total}>{total}</span>}
        {secondaryTotal !== undefined && <span className={styles.secondary}>{secondaryTotal}</span>}
      </span>
    </>
  );

  if (!onToggle) return <div className={styles.root}>{content}</div>;

  return (
    <button type="button" className={styles.root} onClick={onToggle} aria-expanded={open} aria-controls={controls}>
      {content}
    </button>
  );
}
