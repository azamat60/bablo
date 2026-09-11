import type { ReactNode, Ref } from 'react';
import styles from './TileGrid.module.css';

export type TileGridProps = {
  children: ReactNode;
  className?: string;
  /** The drag gesture attaches its delegated pointer handlers here. */
  ref?: Ref<HTMLDivElement>;
};

export function TileGrid({ children, className, ref }: TileGridProps) {
  return (
    <div ref={ref} className={`${styles.root} ${className ?? ''}`}>
      {children}
    </div>
  );
}
