import type { ChipRowProps } from './ChipRow.types';
import styles from './ChipRow.module.css';

/** Horizontal snap strip shared by the subcategory and date pickers. */
export function ChipRow({ items, activeId, onSelect, ariaLabel }: ChipRowProps) {
  return (
    <div className={styles.root} role="group" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            className={`${styles.chip} ${active ? styles.chipActive : ''}`}
            aria-pressed={active}
            onClick={() => onSelect(item.id)}
          >
            <span className={styles.glyph}>{item.glyph}</span>
            <span className={styles.label}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
