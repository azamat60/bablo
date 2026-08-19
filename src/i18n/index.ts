import { useSettings } from '@/db/queries/settings';
import { en } from './en';
import type { Dictionary } from './en';
import { ru } from './ru';
import { getActiveLocale } from './state';
import type { Locale } from './types';

const DICTS: Record<Locale, Dictionary> = { en, ru };

export function useLocale(): Locale {
  const settings = useSettings();
  return settings?.locale ?? getActiveLocale();
}

export function useT(): Dictionary {
  const locale = useLocale();
  return DICTS[locale];
}

export function getDict(): Dictionary {
  return DICTS[getActiveLocale()];
}

export { setActiveLocale, getActiveLocale, detectLocale } from './state';
export type { Locale } from './types';
export type { Dictionary } from './en';
