import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { monthLabel } from '@/domain/budget';
import { formatMoney, formatNumberCompact } from '@/domain/money';
import type { NetWorthPoint } from '@/domain/reports';

type NetWorthChartProps = {
  points: NetWorthPoint[];
  currency: string;
};

export function NetWorthChart({ points, currency }: NetWorthChartProps) {
  const data = points.map((point) => ({ ...point, label: monthLabel(point.month).slice(0, 3) }));

  return (
    <div style={{ width: '100%', height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--color-text-faint)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            width={42}
            domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 10, fill: 'var(--color-text-faint)' }}
            tickFormatter={(value) => formatNumberCompact(Number(value))}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => formatMoney(Number(value), currency)}
            contentStyle={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="netWorth"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
