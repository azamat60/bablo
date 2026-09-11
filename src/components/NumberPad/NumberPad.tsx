import { NUMBER_PAD_ROWS } from './NumberPad.constants';
import styles from './NumberPad.module.css';

type NumberPadProps = {
  onKey: (key: string) => void;
  /** Overrides the label of a key, e.g. to localise `Close`. */
  labels?: Record<string, string>;
};

const VARIANT_CLASS = {
  operator: styles.operator,
  action: styles.action,
  dismiss: styles.dismiss,
} as const;

export function NumberPad({ onKey, labels }: NumberPadProps) {
  return (
    <div className={styles.grid}>
      {NUMBER_PAD_ROWS.flat().map((def) => (
        <button
          key={def.key}
          type="button"
          className={`${styles.key} ${def.variant ? VARIANT_CLASS[def.variant] : ''}`}
          style={def.span ? { gridColumn: 'span 2' } : undefined}
          onClick={() => onKey(def.key)}
        >
          {labels?.[def.key] ?? def.label ?? def.key}
        </button>
      ))}
    </div>
  );
}
