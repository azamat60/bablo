import { memo } from 'react';
import { Lock, Plus } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import type { TileProps } from './Tile.types';
import styles from './Tile.module.css';

const STATE_CLASS = {
  idle: '',
  lifted: styles.lifted,
  valid: styles.valid,
  invalid: styles.invalid,
  hover: styles.hover,
} as const;

/**
 * One circular dashboard tile.
 *
 * Props are deliberately primitives so the memo comparison is cheap and
 * actually hits: a dashboard renders ~30 of these and a drag changes the state
 * of only two at a time.
 */
export const Tile = memo(function Tile({
  id,
  kind,
  color,
  icon,
  label,
  amountText,
  secondaryText,
  locked = false,
  state = 'idle',
  onClick,
}: TileProps) {
  const isAdd = kind === 'add';

  return (
    <button
      type="button"
      data-tile-id={id}
      data-tile-kind={kind}
      className={`${styles.root} ${STATE_CLASS[state]}`}
      onClick={onClick ? () => onClick(id) : undefined}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.circleWrap}>
        <span
          className={`${styles.circle} ${isAdd ? styles.addCircle : ''}`}
          style={isAdd ? undefined : { background: color }}
        >
          {isAdd ? <Plus size={20} aria-hidden="true" /> : <AppIcon name={icon} size={22} />}
        </span>
        {locked && (
          <span className={styles.lock}>
            <Lock size={10} aria-hidden="true" />
          </span>
        )}
      </span>
      {amountText !== undefined && <span className={styles.amount}>{amountText}</span>}
      {secondaryText !== undefined && <span className={styles.secondary}>{secondaryText}</span>}
    </button>
  );
});
