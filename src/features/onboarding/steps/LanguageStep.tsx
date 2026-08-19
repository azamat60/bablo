import { Check } from 'lucide-react';
import { LANGUAGE_OPTIONS } from '../OnboardingPage.constants';
import type { Locale } from '@/i18n/types';
import styles from './OptionList.module.css';

type LanguageStepProps = {
  value: Locale;
  onChange: (locale: Locale) => void;
};

export function LanguageStep({ value, onChange }: LanguageStepProps) {
  return (
    <ul className={styles.list}>
      {LANGUAGE_OPTIONS.map((option) => (
        <li key={option.code}>
          <button
            type="button"
            className={`${styles.option} ${value === option.code ? styles.optionSelected : ''}`}
            onClick={() => onChange(option.code)}
          >
            <div className={styles.optionBody}>
              <div className={styles.optionTitle}>{option.native}</div>
            </div>
            {value === option.code && <Check className={styles.check} size={18} aria-hidden="true" />}
          </button>
        </li>
      ))}
    </ul>
  );
}
