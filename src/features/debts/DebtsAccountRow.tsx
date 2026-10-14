import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import { useDebtPeople } from '@/db/queries/debts';
import { useAccountBalances, useBalancesInBase } from '@/db/queries/transactions';
import { useSettings } from '@/db/queries/settings';
import { summarizeDebts, DEBT_COLOR, DEBT_ICON } from '@/domain/debts';
import { formatMoney } from '@/domain/money';
import { usePrivacyStore } from '@/store/privacy';
import { useT } from '@/i18n';
import styles from './DebtsPage.module.css';

export function DebtsAccountRow() {
  const t = useT();
  const people = useDebtPeople();
  const balances = useAccountBalances();
  const converted = useBalancesInBase();
  const settings = useSettings();
  const masked = usePrivacyStore((state) => state.hideAmounts);
  const summary = summarizeDebts(people, balances, converted);
  return (
    <Link to="/debts" className={styles.debtsLink}>
      <span className={styles.linkIcon} style={{ background: DEBT_COLOR }}>
        <AppIcon name={DEBT_ICON} size={22} />
      </span>
      <span className={styles.personBody}>
        <strong>{t.debts.title}</strong>
        <span className={styles.subtitle}>{t.debts.netBalance}</span>
      </span>
      <span>
        {masked ? '••••••' : formatMoney(summary.total, settings?.baseCurrency ?? 'KGS')}
        {summary.missing.length ? ' *' : ''}
      </span>
      <ChevronRight size={16} aria-hidden="true" />
    </Link>
  );
}
