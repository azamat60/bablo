import { useEffect } from 'react';
import { setActiveLocale } from '@/i18n/state';
import type { Locale } from '@/i18n/types';

export function useLocaleSync(locale: Locale | undefined): void {
  useEffect(() => {
    if (locale) setActiveLocale(locale);
  }, [locale]);
}
