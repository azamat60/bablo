import { useT } from '@/i18n';
import type { OnboardingState } from '../OnboardingPage.types';
import styles from './FinishStep.module.css';

type FinishStepProps = {
  state: OnboardingState;
};

const PRESET_TITLE_KEY: Record<OnboardingState['preset'], 'presetFull' | 'presetMinimal' | 'presetEmpty'> = {
  full: 'presetFull',
  minimal: 'presetMinimal',
  empty: 'presetEmpty',
};

export function FinishStep({ state }: FinishStepProps) {
  const t = useT();
  const presetLabel = t.onboarding[PRESET_TITLE_KEY[state.preset]];

  return (
    <div>
      <div className={styles.card}>
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t.onboarding.summaryCategories}</span>
          <span className={styles.rowValue}>{presetLabel}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t.onboarding.summaryCurrency}</span>
          <span className={styles.rowValue}>{state.currency}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t.onboarding.summaryAccounts}</span>
          <span className={styles.rowValue}>
            {state.accounts.filter((a) => a.name.trim()).length || t.onboarding.summaryNone}
          </span>
        </div>
      </div>
      <div className={styles.card}>
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t.onboarding.ruleOfThumb}</span>
        </div>
        <div className={styles.gaugeBar}>
          <div className={styles.gaugeNeeds} />
          <div className={styles.gaugeWants} />
          <div className={styles.gaugeSavings} />
        </div>
        <div className={styles.legend}>
          <span>
            <span className={styles.legendDot} style={{ background: 'var(--bucket-needs)' }} />
            {t.onboarding.needsPercent(50)}
          </span>
          <span>
            <span className={styles.legendDot} style={{ background: 'var(--bucket-wants)' }} />
            {t.onboarding.wantsPercent(30)}
          </span>
          <span>
            <span className={styles.legendDot} style={{ background: 'var(--bucket-savings)' }} />
            {t.onboarding.savingsPercent(20)}
          </span>
        </div>
      </div>
    </div>
  );
}
