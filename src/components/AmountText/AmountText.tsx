import { formatMoney } from '@/domain/money';
import styles from './AmountText.module.css';

type AmountTextProps = {
  minorUnits: number;
  currency: string;
  signed?: boolean;
  masked?: boolean;
  className?: string;
};

export function AmountText({ minorUnits, currency, signed = true, masked, className }: AmountTextProps) {
  const tone = !signed ? 'neutral' : minorUnits < 0 ? 'expense' : minorUnits > 0 ? 'income' : 'neutral';
  return (
    <span className={`${styles.text} ${styles[tone]} ${className ?? ''}`}>
      {masked ? '••••••' : formatMoney(minorUnits, currency)}
    </span>
  );
}
