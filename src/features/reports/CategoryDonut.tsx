import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { AppIcon } from '@/components/AppIcon';
import { formatMoney } from '@/domain/money';
import { useT } from '@/i18n';
import type { CategorySlice } from '@/domain/reports';
import styles from './ReportsPage.module.css';

type CategoryDonutProps = {
  slices: CategorySlice[];
  currency: string;
};

export function CategoryDonut({ slices, currency }: CategoryDonutProps) {
  const t = useT();
  if (slices.length === 0) return <div className={styles.emptyState}>{t.reports.noExpenses}</div>;

  const top = slices.slice(0, 6);
  const rest = slices.slice(6);
  const restTotal = rest.reduce((sum, s) => sum + s.amount, 0);
  const chartData =
    restTotal > 0
      ? [...top, { categoryId: 'other', name: t.common.other, icon: 'more', color: '#5b6779', amount: restTotal }]
      : top;

  return (
    <div className={styles.donutRow}>
      <div style={{ width: 120, height: 120, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="amount"
              nameKey="name"
              innerRadius={36}
              outerRadius={58}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {chartData.map((slice) => (
                <Cell key={slice.categoryId} fill={slice.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legend}>
        {chartData.map((slice) => (
          <div className={styles.legendItem} key={slice.categoryId}>
            <span className={styles.legendDot} style={{ background: slice.color }} />
            <span className={styles.legendName}>
              <AppIcon name={slice.icon} size={14} />
              {slice.name}
            </span>
            <span className={styles.legendAmount}>{formatMoney(slice.amount, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
