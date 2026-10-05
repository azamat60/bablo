import { getActiveLocale } from '@/i18n/state';
import { CURRENCY_SYMBOL } from './money.constants';

const INTL_LOCALE: Record<'ru' | 'en', string> = { ru: 'ru-RU', en: 'en-US' };

function activeIntlLocale(): string {
  return INTL_LOCALE[getActiveLocale()];
}

export function parseMinorUnits(input: string): number | undefined {
  const match = /^([+-]?)(\d*)(?:[.,](\d*))?$/.exec(input.trim());
  if (!match || (!match[2] && !match[3])) return undefined;
  const whole = (match[2] ?? '').replace(/^0+/, '') || '0';
  if (whole.length > 14) return undefined;
  const fraction = match[3] ?? '';
  const cents = BigInt(fraction.slice(0, 2).padEnd(2, '0'));
  const rounded = BigInt(whole) * 100n + cents + (Number(fraction[2] ?? '0') >= 5 ? 1n : 0n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
  const value = Number(rounded);
  return match[1] === '-' && value !== 0 ? -value : value;
}

export function toMinorUnits(input: string): number {
  return parseMinorUnits(input) ?? 0;
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
  if (!Number.isSafeInteger(minorUnits)) throw new Error('Небезопасная денежная сумма.');
  const absolute = BigInt(Math.abs(minorUnits));
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, '0');
  const formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign =
    minorUnits < 0 ? (formatter.formatToParts(-1).find((part) => part.type === 'minusSign')?.value ?? '-') : '';
  const number =
    sign +
    formatter
      .formatToParts(whole)
      .map((part) => (part.type === 'fraction' ? fraction : part.value))
      .join('');
  const symbol = currencySymbol(currency);
  return PREFIX_CURRENCIES.has(currency) ? `${symbol}${number}` : `${number} ${symbol}`;
}

/** Whole units only — for tight stat tiles where ",00" is noise. */
export function formatMoneyWhole(minorUnits: number, currency: string, locale = activeIntlLocale()): string {
  const number = formatNumber(Math.round(minorUnits / 100), locale, { maximumFractionDigits: 0 });
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

export function decimalFromMinor(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error('Небезопасная денежная сумма.');
  const absolute = BigInt(Math.abs(minor));
  return `${minor < 0 ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
