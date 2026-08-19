import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { seedCategoriesForPreset } from '@/db/seed';
import { createAccount } from '@/db/queries/accounts';
import { updateSettings } from '@/db/queries/settings';
import { toMinorUnits } from '@/domain/money';
import { getDict, useT } from '@/i18n';
import { detectLocale, setActiveLocale } from '@/i18n/state';
import { LanguageStep } from './steps/LanguageStep';
import { PresetStep } from './steps/PresetStep';
import { CurrencyStep } from './steps/CurrencyStep';
import { AccountsStep } from './steps/AccountsStep';
import { FinishStep } from './steps/FinishStep';
import { ACCOUNT_COLORS, ACCOUNT_TYPE_OPTIONS, TOTAL_STEPS } from './OnboardingPage.constants';
import type { OnboardingState } from './OnboardingPage.types';
import styles from './OnboardingPage.module.css';

function initialState(): OnboardingState {
  const locale = detectLocale();
  setActiveLocale(locale);
  const t = getDict();
  return {
    step: 0,
    locale,
    preset: 'full',
    currency: 'KGS',
    accounts: [
      { localId: uuidv4(), name: t.accountType.cash, type: 'cash', openingBalance: '' },
      { localId: uuidv4(), name: t.accountType.debit_card, type: 'debit_card', openingBalance: '' },
    ],
  };
}

export function OnboardingPage() {
  const [state, setState] = useState<OnboardingState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const STEP_COPY = [
    { heading: t.onboarding.languageHeading, subheading: t.onboarding.languageSubheading },
    { heading: t.onboarding.welcomeHeading, subheading: t.onboarding.welcomeSubheading },
    { heading: t.onboarding.currencyHeading, subheading: t.onboarding.currencySubheading },
    { heading: t.onboarding.accountsHeading, subheading: t.onboarding.accountsSubheading },
    { heading: t.onboarding.finishHeading, subheading: t.onboarding.finishSubheading },
  ];

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [state.step]);

  const canContinue = state.step !== 3 || state.accounts.some((account) => account.name.trim().length > 0);

  const handleBack = () => {
    setState((prev) => ({ ...prev, step: Math.max(0, prev.step - 1) }));
  };

  const handleContinue = () => {
    if (state.step < TOTAL_STEPS - 1) {
      setState((prev) => ({ ...prev, step: prev.step + 1 }));
      return;
    }
    void finishOnboarding();
  };

  const finishOnboarding = async () => {
    setSubmitting(true);
    await seedCategoriesForPreset(state.preset, state.locale);
    let colorIndex = 0;
    for (const draft of state.accounts) {
      if (!draft.name.trim()) continue;
      const icon = ACCOUNT_TYPE_OPTIONS.find((option) => option.type === draft.type)?.icon ?? 'wallet';
      await createAccount({
        name: draft.name.trim(),
        type: draft.type,
        currency: state.currency,
        openingBalance: toMinorUnits(draft.openingBalance),
        color: ACCOUNT_COLORS[colorIndex % ACCOUNT_COLORS.length] ?? '#4f8dfd',
        icon,
      });
      colorIndex += 1;
    }
    await updateSettings({ baseCurrency: state.currency, onboardingComplete: true, locale: state.locale });
  };

  const copy = STEP_COPY[state.step];

  return (
    <div className={styles.root}>
      <div className={styles.progress}>
        {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
          <div key={index} className={`${styles.dot} ${index <= state.step ? styles.dotActive : ''}`} />
        ))}
      </div>
      <div className={styles.content} ref={contentRef}>
        <h1 className={styles.heading}>{copy?.heading}</h1>
        <p className={styles.subheading}>{copy?.subheading}</p>
        {state.step === 0 && (
          <LanguageStep
            value={state.locale}
            onChange={(locale) => {
              setActiveLocale(locale);
              setState((prev) => ({ ...prev, locale }));
            }}
          />
        )}
        {state.step === 1 && (
          <PresetStep value={state.preset} onChange={(preset) => setState((prev) => ({ ...prev, preset }))} />
        )}
        {state.step === 2 && (
          <CurrencyStep value={state.currency} onChange={(currency) => setState((prev) => ({ ...prev, currency }))} />
        )}
        {state.step === 3 && (
          <AccountsStep
            accounts={state.accounts}
            currency={state.currency}
            onChange={(accounts) => setState((prev) => ({ ...prev, accounts }))}
          />
        )}
        {state.step === 4 && <FinishStep state={state} />}
      </div>
      <div className={styles.footer}>
        {state.step > 0 && (
          <button type="button" className={styles.backButton} onClick={handleBack} disabled={submitting}>
            {t.onboarding.back}
          </button>
        )}
        <button
          type="button"
          className={styles.continueButton}
          onClick={() => void handleContinue()}
          disabled={!canContinue || submitting}
        >
          {state.step === TOTAL_STEPS - 1
            ? submitting
              ? t.onboarding.settingUp
              : t.onboarding.getStarted
            : t.onboarding.continueBtn}
        </button>
      </div>
    </div>
  );
}
