import { useNavigate } from 'react-router';
import { AppIcon } from '@/components/AppIcon';
import { AmountText } from '@/components/AmountText';
import { availableCredit } from '@/domain/accounts';
import { formatMoney } from '@/domain/money';
import { useT } from '@/i18n';
import type { Account } from '@/db/types';
import styles from './AccountRow.module.css';

type AccountRowProps = {
  account: Account;
  balance: number;
  masked?: boolean;
};

export function AccountRow({ account, balance, masked }: AccountRowProps) {
  const navigate = useNavigate();
  const t = useT();
  const available = availableCredit(account, balance);

  return (
    <button type="button" className={styles.row} onClick={() => void navigate(`/accounts/${account.id}`)}>
      <span className={styles.icon} style={{ background: account.color }}>
        <AppIcon name={account.icon} />
      </span>
      <span className={styles.body}>
        <span className={styles.name}>{account.name}</span>
        {available !== undefined && (
          <span className={styles.available}>
            {t.accounts.avail}
            {masked ? '••••••' : formatMoney(available, account.currency)}
          </span>
        )}
      </span>
      <AmountText className={styles.balance} minorUnits={balance} currency={account.currency} masked={masked} />
    </button>
  );
}
