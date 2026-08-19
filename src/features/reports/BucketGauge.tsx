import { formatMoney } from '@/domain/money';
import { useT } from '@/i18n';
import type { BucketTotals } from '@/domain/reports';
import styles from './ReportsPage.module.css';

type BucketGaugeProps = {
  totals: BucketTotals;
  currency: string;
};

export function BucketGauge({ totals, currency }: BucketGaugeProps) {
  const t = useT();
  const total = totals.needs + totals.wants + totals.savings;
  if (total === 0) return <div className={styles.emptyState}>{t.reports.noCategorized}</div>;

  const needsPct = (totals.needs / total) * 100;
  const wantsPct = (totals.wants / total) * 100;
  const savingsPct = (totals.savings / total) * 100;

  return (
    <div>
      <div className={styles.gaugeBar}>
        <div className={styles.gaugeSegment} style={{ width: `${needsPct}%`, background: 'var(--bucket-needs)' }} />
        <div className={styles.gaugeSegment} style={{ width: `${wantsPct}%`, background: 'var(--bucket-wants)' }} />
        <div className={styles.gaugeSegment} style={{ width: `${savingsPct}%`, background: 'var(--bucket-savings)' }} />
      </div>
      <div className={styles.gaugeLegend}>
        <div className={styles.gaugeLegendItem}>
          <span className={styles.gaugeLegendValue}>{needsPct.toFixed(0)}%</span>
          <span className={styles.gaugeLegendLabel}>{t.categoriesPage.bucketNeeds}</span>
          <span className={styles.gaugeLegendAmount}>{formatMoney(totals.needs, currency)}</span>
        </div>
        <div className={styles.gaugeLegendItem}>
          <span className={styles.gaugeLegendValue}>{wantsPct.toFixed(0)}%</span>
          <span className={styles.gaugeLegendLabel}>{t.categoriesPage.bucketWants}</span>
          <span className={styles.gaugeLegendAmount}>{formatMoney(totals.wants, currency)}</span>
        </div>
        <div className={styles.gaugeLegendItem}>
          <span className={styles.gaugeLegendValue}>{savingsPct.toFixed(0)}%</span>
          <span className={styles.gaugeLegendLabel}>{t.categoriesPage.bucketSavings}</span>
          <span className={styles.gaugeLegendAmount}>{formatMoney(totals.savings, currency)}</span>
        </div>
      </div>
    </div>
  );
}
