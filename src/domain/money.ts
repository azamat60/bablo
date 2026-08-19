import { getActiveLocale } from '@/i18n/state';
import { CURRENCY_SYMBOL } from './money.constants';

const INTL_LOCALE: Record<'ru' | 'en', string> = { ru: 'ru-RU', en: 'en-US' };

function activeIntlLocale(): string {
  return INTL_LOCALE[getActiveLocale()];
}

export function toMinorUnits(input: string): number {
  const normalized = input.replace(',', '.').trim();
  if (normalized === '') return 0;
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}

const PREFIX_CURRENCIES = new Set(['USD']);

function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOL[currency] ?? currency;
}

function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return value.toFixed(options?.maximumFractionDigits ?? 2);
  }
}

export function formatMoney(minorUnits: number, currency: string, locale = activeIntlLocale()): string {
  const value = minorUnits / 100;
  const number = formatNumber(value, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbol = currencySymbol(currency);
  return PREFIX_CURRENCIES.has(currency) ? `${symbol}${number}` : `${number} ${symbol}`;
}

export function formatMoneyCompact(minorUnits: number, currency: string, locale = activeIntlLocale()): string {
  const value = minorUnits / 100;
  const number = formatNumber(value, locale, { notation: 'compact', maximumFractionDigits: 1 });
  const symbol = currencySymbol(currency);
  return PREFIX_CURRENCIES.has(currency) ? `${symbol}${number}` : `${number} ${symbol}`;
}

export function formatNumberCompact(minorUnits: number, locale = activeIntlLocale()): string {
  const value = minorUnits / 100;
  return formatNumber(value, locale, { notation: 'compact', maximumFractionDigits: 1 });
}
