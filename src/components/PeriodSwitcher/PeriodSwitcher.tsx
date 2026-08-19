import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { periodLabel, shiftPeriod, isTodayPeriod, type Period, type PeriodKind } from '@/domain/period';
import { useT } from '@/i18n';
import { PERIOD_KIND_OPTIONS } from './PeriodSwitcher.constants';
import styles from './PeriodSwitcher.module.css';

type PeriodSwitcherProps = {
  period: Period;
  onChange: (period: Period) => void;
};

export function PeriodSwitcher({ period, onChange }: PeriodSwitcherProps) {
  const t = useT();
  const periodKindLabel: Record<PeriodKind, string> = {
    day: t.period.daily,
    week: t.period.weekly,
    month: t.period.monthly,
    year: t.period.yearly,
  };

  const handleKindChange = (kind: PeriodKind) => {
    onChange({ kind, anchor: period.anchor });
  };

  return (
    <div className={styles.root}>
      <div className={styles.kindSelectWrap}>
        <select
          className={styles.kindSelect}
          value={period.kind}
          onChange={(event) => handleKindChange(event.target.value as PeriodKind)}
          aria-label={t.period.selectAria}
        >
          {PERIOD_KIND_OPTIONS.map((kind) => (
            <option key={kind} value={kind}>
              {periodKindLabel[kind]}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.chevron} size={14} aria-hidden="true" />
      </div>
      <div className={styles.rangeNav}>
        <button
          type="button"
          className={styles.rangeArrow}
          onClick={() => onChange(shiftPeriod(period, -1))}
          aria-label={t.period.previousAria}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className={styles.rangeLabel}>{isTodayPeriod(period) ? t.period.today : periodLabel(period)}</span>
        <button
          type="button"
          className={styles.rangeArrow}
          onClick={() => onChange(shiftPeriod(period, 1))}
          aria-label={t.period.nextAria}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
