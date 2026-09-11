import { Sparkles, X } from 'lucide-react';
import { useT } from '@/i18n';
import styles from './SuggestionChip.module.css';

export type SuggestionChipProps = {
  /** Already-localised description, e.g. "Most often: Groceries". */
  text: string;
  /** Formatted amount, omitted when past amounts were too scattered to guess. */
  amountText?: string;
  onApply: () => void;
  onDismiss: () => void;
};

export function SuggestionChip({ text, amountText, onApply, onDismiss }: SuggestionChipProps) {
  const t = useT();
  return (
    <div className={styles.root}>
      <button type="button" className={styles.apply} onClick={onApply}>
        <Sparkles className={styles.spark} size={16} aria-hidden="true" />
        <span className={styles.text}>{text}</span>
        {amountText && <span className={styles.amount}>{amountText}</span>}
      </button>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label={t.suggest.dismiss}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
