import { dailyTotals, monthGridDays } from '@/domain/calendar';
import { formatNumberCompact } from '@/domain/money';
import { useT } from '@/i18n';
import type { Transaction } from '@/db/types';
import styles from './CalendarMonth.module.css';

type CalendarMonthProps = {
  month: string;
  transactions: Transaction[];
  selectedDate?: string;
  onSelectDate: (date: string) => void;
};

export function CalendarMonth({ month, transactions, selectedDate, onSelectDate }: CalendarMonthProps) {
  const t = useT();
  const totals = dailyTotals(transactions);
  const days = monthGridDays(month);

  return (
    <div className={styles.root}>
      <div className={styles.weekdayRow}>
        {t.calendar.weekdays.map((label, index) => (
          <span key={index} className={styles.weekday}>
            {label}
          </span>
        ))}
      </div>
      <div className={styles.grid}>
        {days.map((day) => {
          const total = totals.get(day.date);
          return (
            <button
              key={day.date}
              type="button"
              className={`${styles.cell} ${day.date === selectedDate ? styles.cellSelected : ''}`}
              onClick={() => onSelectDate(day.date)}
            >
              <span
                className={`${styles.dayNumber} ${day.isToday ? styles.dayNumberToday : ''} ${!day.inMonth ? styles.outOfMonth : ''}`}
              >
                {day.dayOfMonth}
              </span>
              {total && total.income > 0 && (
                <span className={`${styles.dayIncome} ${!day.inMonth ? styles.outOfMonth : ''}`}>
                  {formatNumberCompact(total.income)}
                </span>
              )}
              {total && total.expense > 0 && (
                <span className={`${styles.dayExpense} ${!day.inMonth ? styles.outOfMonth : ''}`}>
                  {formatNumberCompact(total.expense)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
