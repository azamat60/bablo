import { useState } from 'react';
import { Eye, EyeOff, Plus } from 'lucide-react';
import { useAccounts } from '@/db/queries/accounts';
import { useSettings } from '@/db/queries/settings';
import { useAccountBalances } from '@/db/queries/transactions';
import { usePrivacyStore } from '@/store/privacy';
import { groupAccounts, netWorthBreakdown } from '@/domain/accounts';
import { formatMoney } from '@/domain/money';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { useT } from '@/i18n';
import { AccountFormSheet } from './AccountFormSheet';
import { AccountSection } from './AccountSection';
import styles from './AccountsPage.module.css';

export function AccountsPage() {
  const accounts = useAccounts();
  const settings = useSettings();
  const balances = useAccountBalances();
  const hideAmounts = usePrivacyStore((s) => s.hideAmounts);
  const toggleHideAmounts = usePrivacyStore((s) => s.toggleHideAmounts);
  const [addOpen, setAddOpen] = useState(false);
  const t = useT();

  const currency = settings?.baseCurrency ?? 'USD';
  const { assets, liabilities, netWorth } = netWorthBreakdown(accounts, balances);
  const sections = groupAccounts(accounts, balances);

  return (
    <div className={styles.root}>
      <div className={styles.topRow}>
        <h1 className={styles.title}>{t.accounts.title}</h1>
        <button
          type="button"
          className={styles.addIcon}
          onClick={() => setAddOpen(true)}
          aria-label={t.accounts.addAccount}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>

      <Card variant="gradient" className={styles.hero}>
        <div className={styles.heroTop}>
          <button
            type="button"
            className={styles.eyeButton}
            onClick={toggleHideAmounts}
            aria-label={hideAmounts ? t.accounts.showAmounts : t.accounts.hideAmounts}
          >
            {hideAmounts ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          </button>
        </div>
        <div className={styles.heroLabel}>{t.accounts.netWorth}</div>
        <div className={styles.heroValue}>{hideAmounts ? '••••••' : formatMoney(netWorth, currency)}</div>
        <div className={styles.heroSplit}>
          <div>
            <div className={styles.splitLabel}>{t.accounts.assets}</div>
            <div className={styles.splitValue}>{hideAmounts ? '••••••' : formatMoney(assets, currency)}</div>
          </div>
          <div className={styles.splitDivider} />
          <div>
            <div className={styles.splitLabel}>{t.accounts.liabilities}</div>
            <div className={styles.splitValue}>{hideAmounts ? '••••••' : formatMoney(liabilities, currency)}</div>
          </div>
        </div>
      </Card>

      {sections.length === 0 ? (
        <EmptyState label={t.accounts.empty} />
      ) : (
        sections.map((section) => (
          <AccountSection
            key={section.key}
            section={section}
            balances={balances}
            currency={currency}
            masked={hideAmounts}
          />
        ))
      )}

      <button type="button" className={styles.addButton} onClick={() => setAddOpen(true)}>
        <Plus size={16} aria-hidden="true" />
        {t.accounts.addAccount}
      </button>
      <AccountFormSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
