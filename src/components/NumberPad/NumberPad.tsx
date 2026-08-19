import { NUMBER_PAD_ROWS } from './NumberPad.constants';
import styles from './NumberPad.module.css';

type NumberPadProps = {
  onKey: (key: string) => void;
};

export function NumberPad({ onKey }: NumberPadProps) {
  return (
    <div className={styles.grid}>
      {NUMBER_PAD_ROWS.flat().map((def) => (
        <button
          key={def.key}
          type="button"
          className={`${styles.key} ${def.variant === 'operator' ? styles.operator : ''} ${def.variant === 'action' ? styles.action : ''}`}
          style={def.span ? { gridColumn: 'span 2' } : undefined}
          onClick={() => onKey(def.key)}
        >
          {def.key}
        </button>
      ))}
    </div>
  );
}
