import { Sheet } from '@/components/Sheet';
import { AppIcon } from '@/components/AppIcon';
import { useAccounts } from '@/db/queries/accounts';
import { formatMoney } from '@/domain/money';
import { useAccountBalances } from '@/db/queries/transactions';
import { useT } from '@/i18n';
import styles from './AccountPickerSheet.module.css';

type AccountPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (accountId: string) => void;
  excludeAccountId?: string;
  title?: string;
};

export function AccountPickerSheet({ open, onClose, onSelect, excludeAccountId, title }: AccountPickerSheetProps) {
  const t = useT();
  const accounts = useAccounts().filter((account) => account.id !== excludeAccountId);
  // One live query for every balance, rather than one per row.
  const balances = useAccountBalances();

  return (
    <Sheet open={open} onClose={onClose} title={title ?? t.sheets.chooseAccount}>
      <div className={styles.list}>
        {accounts.map((account) => (
          <button key={account.id} type="button" className={styles.row} onClick={() => onSelect(account.id)}>
            <span className={styles.icon} style={{ background: account.color }}>
              <AppIcon name={account.icon} />
            </span>
            <span className={styles.name}>{account.name}</span>
            <span className={styles.balance}>
              {formatMoney(balances.get(account.id) ?? account.openingBalance, account.currency)}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
