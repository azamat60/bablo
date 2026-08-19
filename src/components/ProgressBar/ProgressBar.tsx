import styles from './ProgressBar.module.css';

type ProgressBarProps = {
  value: number;
  color?: string;
  className?: string;
};

export function ProgressBar({ value, color, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const fillColor = color ?? (clamped >= 1 ? 'var(--color-expense)' : 'var(--color-income)');
  return (
    <div className={`${styles.track} ${className ?? ''}`}>
      <div className={styles.fill} style={{ width: `${clamped * 100}%`, background: fillColor }} />
    </div>
  );
}
