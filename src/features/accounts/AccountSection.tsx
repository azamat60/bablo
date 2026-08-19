import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AmountText } from '@/components/AmountText';
import type { AccountSection as AccountSectionVm } from '@/domain/accounts';
import { AccountRow } from './AccountRow';
import styles from './AccountsPage.module.css';

type AccountSectionProps = {
  section: AccountSectionVm;
  balances: Map<string, number>;
  currency: string;
  masked?: boolean;
};

export function AccountSection({ section, balances, currency, masked }: AccountSectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className={styles.section}>
      <button type="button" className={styles.sectionHeader} onClick={() => setOpen((value) => !value)}>
        <span className={styles.sectionLabel}>{section.label}</span>
        <AmountText
          className={styles.sectionTotal}
          minorUnits={section.totalMinorUnits}
          currency={currency}
          signed={false}
          masked={masked}
        />
        <ChevronDown
          className={`${styles.sectionChevron} ${open ? styles.sectionChevronOpen : ''}`}
          size={16}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className={styles.list}>
          {section.accounts.map((account) => (
            <AccountRow key={account.id} account={account} balance={balances.get(account.id) ?? 0} masked={masked} />
          ))}
        </div>
      )}
    </div>
  );
}
