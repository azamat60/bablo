import { useState } from 'react';
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { useAccounts } from '@/db/queries/accounts';
import { useSettings } from '@/db/queries/settings';
import { setManualRate } from '@/db/queries/rates';
import { rateId } from '@/domain/rates';
import { PageHeader } from '@/components/PageHeader';
import { getDateFnsLocale } from '@/i18n/dateFnsLocale';
import { useT } from '@/i18n';
import styles from './RatesPage.module.css';

/**
 * Manual rate entry, so an offline-first app is never stuck without a rate.
 * Automatic refresh fills these in when there is a connection; this is the
 * fallback and the override.
 */
export function RatesPage() {
  const t = useT();
  const settings = useSettings();
  const accounts = useAccounts();
  const base = settings?.baseCurrency ?? 'USD';

  const quotes = [...new Set(accounts.map((account) => account.currency))].filter((code) => code !== base).sort();
  const rates = useLiveQuery(() => db.rates.where('base').equals(base).toArray(), [base]) ?? [];

  return (
    <div className={styles.root}>
      <PageHeader title={t.settings.rates} />
      <p className={styles.hint}>{t.rates.hint(base)}</p>
      <div className={styles.list}>
        {quotes.length === 0 && <p className={styles.hint}>{t.rates.empty}</p>}
        {quotes.map((quote) => (
          <RateRow key={quote} base={base} quote={quote} rate={rates.find((r) => r.id === rateId(base, quote))} />
        ))}
      </div>
      {rates.length > 0 && (
        <p className={styles.stamp}>
          {t.rates.updated(
            format(new Date(Math.max(...rates.map((r) => r.fetchedAt))), 'd MMM yyyy, HH:mm', {
              locale: getDateFnsLocale(),
            }),
          )}
        </p>
      )}
    </div>
  );
}

type RateRowProps = { base: string; quote: string; rate?: { rate: number } };

function RateRow({ base, quote, rate }: RateRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? (rate ? String(Number(rate.rate.toFixed(6))) : '');

  const commit = () => {
    if (draft === null) return;
    const parsed = Number.parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) void setManualRate(base, quote, parsed);
    setDraft(null);
  };

  return (
    <label className={styles.row}>
      <span className={styles.pair}>{`1 ${quote} =`}</span>
      <input
        className={styles.input}
        inputMode="decimal"
        value={value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        aria-label={`1 ${quote} in ${base}`}
      />
      <span className={styles.pair} style={{ flex: '0 0 auto' }}>
        {base}
      </span>
    </label>
  );
}
