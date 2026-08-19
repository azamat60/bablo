import type { ReactNode } from 'react';
import styles from './SectionHeading.module.css';

type SectionHeadingProps = {
  title: string;
  action?: ReactNode;
};

export function SectionHeading({ title, action }: SectionHeadingProps) {
  return (
    <div className={styles.root}>
      <span className={styles.title}>{title}</span>
      {action && <span className={styles.action}>{action}</span>}
    </div>
  );
}
