import { useEffect } from 'react';
import { refreshRatesIfStale } from '@/db/queries/rates';

/**
 * Keeps exchange rates fresh: once per mount and again whenever the device
 * comes back online. The query itself throttles to one fetch a day.
 */
export function useRatesSync(baseCurrency: string | undefined): void {
  useEffect(() => {
    if (!baseCurrency) return;
    const refresh = () => void refreshRatesIfStale(baseCurrency);
    refresh();
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, [baseCurrency]);
}
