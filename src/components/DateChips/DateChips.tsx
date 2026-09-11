import { useEffect, useMemo, useRef } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { todayIsoDate } from '@/domain/transactions';
import { getDateFnsLocale } from '@/i18n/dateFnsLocale';
import { useT } from '@/i18n';
import styles from './DateChips.module.css';

export type DateChipsProps = {
  value: string;
  onChange: (dateIso: string) => void;
  /** How many recent days to offer, most recent last. */
  days?: number;
};

export function DateChips({ value, onChange, days = 4 }: DateChipsProps) {
  const t = useT();
  const locale = getDateFnsLocale();
  const today = todayIsoDate();

  const chips = useMemo(() => {
    const base = parseISO(today);
    // Oldest first so "Today" sits at the trailing edge, where the thumb is.
    return Array.from({ length: days }, (_, i) => {
      const date = subDays(base, days - 1 - i);
      return { iso: format(date, 'yyyy-MM-dd'), date };
    });
  }, [today, days]);

  const yesterday = format(subDays(parseISO(today), 1), 'yyyy-MM-dd');
  const isCustom = !chips.some((chip) => chip.iso === value);

  // Today sits at the trailing edge, so the row starts scrolled to the end.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rowRef.current;
    if (row) row.scrollLeft = row.scrollWidth;
  }, []);

  return (
    <div className={styles.root} ref={rowRef}>
      <label className={`${styles.calendar} ${isCustom ? styles.chipActive : ''}`}>
        <CalendarDays size={18} aria-hidden="true" />
        <input
          type="date"
          className={styles.calendarInput}
          value={value}
          onChange={(event) => event.target.value && onChange(event.target.value)}
          aria-label={t.common.date}
        />
      </label>
      {chips.map(({ iso, date }) => {
        const relative = iso === today ? t.common.today : iso === yesterday ? t.common.yesterday : undefined;
        return (
          <button
            key={iso}
            type="button"
            className={`${styles.chip} ${iso === value ? styles.chipActive : ''}`}
            aria-pressed={iso === value}
            onClick={() => onChange(iso)}
          >
            <span className={styles.day}>{format(date, 'dd')}</span>
            <span className={styles.month}>{format(date, 'LLLL', { locale })}</span>
            <span className={`${styles.weekday} ${relative ? styles.relative : ''}`}>
              {relative ?? format(date, 'EEEE', { locale })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
