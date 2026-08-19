import { ru, enUS } from 'date-fns/locale';
import type { Locale as DateFnsLocale } from 'date-fns';
import { getActiveLocale } from './state';

const DATE_FNS_LOCALE: Record<'ru' | 'en', DateFnsLocale> = { ru, en: enUS };

export function getDateFnsLocale(): DateFnsLocale {
  return DATE_FNS_LOCALE[getActiveLocale()];
}
