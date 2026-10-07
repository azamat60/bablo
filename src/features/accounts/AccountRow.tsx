import { useNavigate } from 'react-router';
import { Trash2 } from 'lucide-react';
import { useDeletion } from '@/components/DeletionProvider';
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
  const { requestAccountDeletion } = useDeletion();
  const available = availableCredit(account, balance);

  return (
    <div className={styles.row}>
      <button type="button" className={styles.main} onClick={() => void navigate(`/accounts/${account.id}`)}>
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
      <button
        type="button"
        className={styles.delete}
        aria-label={t.deletion.accountAria(account.name)}
        onClick={() => requestAccountDeletion(account.id)}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
