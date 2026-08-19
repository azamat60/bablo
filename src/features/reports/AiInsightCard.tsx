import { useState } from 'react';
import { useT } from '@/i18n';
import type { CategorySlice } from '@/domain/reports';
import styles from './ReportsPage.module.css';

type AiInsightCardProps = {
  month: string;
  baseCurrency: string;
  totalIncome: number;
  totalExpense: number;
  byCategory: CategorySlice[];
};

export function AiInsightCard({ month, baseCurrency, totalIncome, totalExpense, byCategory }: AiInsightCardProps) {
  const t = useT();
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          month,
          baseCurrency,
          totalIncome,
          totalExpense,
          byCategory: byCategory.map((s) => ({ name: s.name, amount: s.amount })),
        }),
      });
      const body = (await response.json()) as { summary?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? t.reports.failedInsight);
      setSummary(body.summary ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.reports.failedInsight);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>{t.reports.aiInsight}</div>
      {summary && <p className={styles.insightText}>{summary}</p>}
      {error && <p className={styles.insightError}>{error}</p>}
      {!summary && (
        <button type="button" className={styles.insightButton} disabled={loading} onClick={() => void generate()}>
          {loading ? t.reports.thinking : t.reports.generateInsight}
        </button>
      )}
    </div>
  );
}
