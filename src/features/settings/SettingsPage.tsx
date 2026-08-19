import { Link } from 'react-router';
import { ChevronRight, Tags, Repeat, Package, Coins, Bot, PiggyBank } from 'lucide-react';
import { useSettings, updateSettings } from '@/db/queries/settings';
import { useT } from '@/i18n';
import { setActiveLocale } from '@/i18n/state';
import type { Locale } from '@/i18n/types';
import type { ThemePref } from '@/db/types';
import { THEME_OPTIONS } from './SettingsPage.constants';
import styles from './SettingsPage.module.css';

const THEME_LABEL_KEY: Record<ThemePref, 'themeCream' | 'themeDark' | 'themeSystem'> = {
  light: 'themeCream',
  dark: 'themeDark',
  system: 'themeSystem',
};

const LOCALE_OPTIONS: readonly Locale[] = ['ru', 'en'];
const LOCALE_LABEL_KEY: Record<Locale, 'languageRu' | 'languageEn'> = {
  ru: 'languageRu',
  en: 'languageEn',
};

export function SettingsPage() {
  const settings = useSettings();
  const t = useT();

  const handleLocaleChange = (locale: Locale) => {
    setActiveLocale(locale);
    void updateSettings({ locale });
  };

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>{t.settings.title}</h1>

      <div className={styles.list}>
        <Link to="/settings/categories" className={styles.row}>
          <Tags className={styles.rowIcon} size={20} aria-hidden="true" />
          <span className={styles.rowLabel}>{t.settings.categories}</span>
          <ChevronRight className={styles.chevron} size={18} aria-hidden="true" />
        </Link>
        <Link to="/settings/recurring" className={styles.row}>
          <Repeat className={styles.rowIcon} size={20} aria-hidden="true" />
          <span className={styles.rowLabel}>{t.settings.recurring}</span>
          <ChevronRight className={styles.chevron} size={18} aria-hidden="true" />
        </Link>
        <Link to="/savings" className={styles.row}>
          <PiggyBank className={styles.rowIcon} size={20} aria-hidden="true" />
          <span className={styles.rowLabel}>{t.settings.savingsGoals}</span>
          <ChevronRight className={styles.chevron} size={18} aria-hidden="true" />
        </Link>
        <Link to="/settings/import-export" className={styles.row}>
          <Package className={styles.rowIcon} size={20} aria-hidden="true" />
          <span className={styles.rowLabel}>{t.settings.importExport}</span>
          <ChevronRight className={styles.chevron} size={18} aria-hidden="true" />
        </Link>
      </div>

      <div className={styles.sectionLabel}>{t.settings.appearance}</div>
      <div className={styles.list}>
        <div className={styles.themeRow}>
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.themeOption} ${settings?.theme === option.value ? styles.themeOptionActive : ''}`}
              onClick={() => void updateSettings({ theme: option.value })}
            >
              {t.settings[THEME_LABEL_KEY[option.value]]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.sectionLabel}>{t.settings.language}</div>
      <div className={styles.list}>
        <div className={styles.themeRow}>
          {LOCALE_OPTIONS.map((locale) => (
            <button
              key={locale}
              type="button"
              className={`${styles.themeOption} ${
                (settings?.locale ?? 'ru') === locale ? styles.themeOptionActive : ''
              }`}
              onClick={() => handleLocaleChange(locale)}
            >
              {t.settings[LOCALE_LABEL_KEY[locale]]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.sectionLabel}>{t.settings.general}</div>
      <div className={styles.list}>
        <div className={styles.row}>
          <Coins className={styles.rowIcon} size={20} aria-hidden="true" />
          <span className={styles.rowLabel}>{t.settings.baseCurrency}</span>
          <span className={styles.rowValue}>{settings?.baseCurrency}</span>
        </div>
        <div className={styles.row}>
          <Bot className={styles.rowIcon} size={20} aria-hidden="true" />
          <span className={styles.rowLabel}>{t.settings.aiModel}</span>
          <span className={styles.rowValue}>{settings?.aiModel}</span>
        </div>
      </div>
    </div>
  );
}
