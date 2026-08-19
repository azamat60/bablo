import type { Locale } from './types';

let activeLocale: Locale = 'ru';

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
}

export function getActiveLocale(): Locale {
  return activeLocale;
}

export function detectLocale(): Locale {
  const lang = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'ru';
  return lang.startsWith('en') ? 'en' : 'ru';
}
