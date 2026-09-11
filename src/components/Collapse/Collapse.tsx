import type { ReactNode } from 'react';
import styles from './Collapse.module.css';

export type CollapseProps = {
  open: boolean;
  children: ReactNode;
  id?: string;
};

export function Collapse({ open, children, id }: CollapseProps) {
  return (
    <div id={id} className={`${styles.root} ${open ? styles.open : ''}`} aria-hidden={!open}>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
