import { useEffect } from 'react';
import { runDueRecurring } from '@/db/queries/recurring';

export function useRecurringProcessor(): void {
  useEffect(() => {
    void runDueRecurring();
  }, []);
}
