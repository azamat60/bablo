import { Check } from 'lucide-react';
import { CURRENCY_OPTIONS } from '../OnboardingPage.constants';
import { useT } from '@/i18n';
import styles from './OptionList.module.css';

type CurrencyStepProps = {
  value: string;
  onChange: (currency: string) => void;
};

export function CurrencyStep({ value, onChange }: CurrencyStepProps) {
  const t = useT();
  return (
    <ul className={styles.list}>
      {CURRENCY_OPTIONS.map((option) => (
        <li key={option.code}>
          <button
            type="button"
            className={`${styles.option} ${value === option.code ? styles.optionSelected : ''}`}
            onClick={() => onChange(option.code)}
          >
            <span className={styles.optionCode}>{option.code}</span>
            <div className={styles.optionBody}>
              <div className={styles.optionTitle}>{t.currency[option.code as keyof typeof t.currency]}</div>
            </div>
            {value === option.code && <Check className={styles.check} size={18} aria-hidden="true" />}
          </button>
        </li>
      ))}
    </ul>
  );
}
