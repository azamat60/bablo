import styles from './AmountDisplay.module.css';

export type AmountDisplayProps = {
  caption: string;
  /** Raw calculator text, not a formatted money string. */
  text: string;
  symbol: string;
  tone?: 'expense' | 'income';
  /** True while an operator is pending, so the figure reads as intermediate. */
  computing?: boolean;
  onClick?: () => void;
};

export function AmountDisplay({ caption, text, symbol, tone = 'expense', computing, onClick }: AmountDisplayProps) {
  return (
    <button type="button" className={styles.root} onClick={onClick}>
      <span className={styles.caption}>{caption}</span>
      <span
        className={`${styles.value} ${tone === 'income' ? styles.income : ''} ${computing ? styles.computing : ''}`}
      >
        <span className={styles.symbol}>{symbol}</span>
        {text}
      </span>
    </button>
  );
}
