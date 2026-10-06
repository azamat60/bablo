import { Check } from 'lucide-react';
import { PRESET_OPTIONS } from '../OnboardingPage.constants';
import { useLocale, useT } from '@/i18n';
import { getCategoryPreset, type CategoryPreset } from '@/db/seed';
import styles from './OptionList.module.css';

type PresetStepProps = {
  value: CategoryPreset;
  onChange: (preset: CategoryPreset) => void;
};

const PRESET_TITLE_KEY: Record<CategoryPreset, 'presetFull' | 'presetMinimal' | 'presetEmpty'> = {
  full: 'presetFull',
  minimal: 'presetMinimal',
  empty: 'presetEmpty',
};

const PRESET_DESC_KEY: Record<CategoryPreset, 'presetFullDesc' | 'presetMinimalDesc' | 'presetEmptyDesc'> = {
  full: 'presetFullDesc',
  minimal: 'presetMinimalDesc',
  empty: 'presetEmptyDesc',
};

export function PresetStep({ value, onChange }: PresetStepProps) {
  const t = useT();
  const groups = getCategoryPreset(value, useLocale());
  return (
    <>
      <ul className={styles.list}>
        {PRESET_OPTIONS.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              className={`${styles.option} ${value === option.id ? styles.optionSelected : ''}`}
              aria-pressed={value === option.id}
              onClick={() => onChange(option.id)}
            >
              <div className={styles.optionBody}>
                <div className={styles.optionTitle}>{t.onboarding[PRESET_TITLE_KEY[option.id]]}</div>
                <div className={styles.optionDescription}>{t.onboarding[PRESET_DESC_KEY[option.id]]}</div>
              </div>
              {value === option.id && <Check className={styles.check} size={18} aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
      <section className={styles.preview} aria-label={t.onboarding.summaryCategories}>
        <h2>
          {t.onboarding.summaryCategories}: {groups.reduce((sum, group) => sum + group.categories.length, 0)}
        </h2>
        {groups.map((group) => (
          <div key={group.name}>
            <h3>{group.name}</h3>
            <p>{group.categories.map((category) => category.name).join(', ')}</p>
          </div>
        ))}
      </section>
    </>
  );
}
