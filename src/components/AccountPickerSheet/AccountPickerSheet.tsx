import { Sheet } from '@/components/Sheet';
import { AppIcon } from '@/components/AppIcon';
import { useAccounts } from '@/db/queries/accounts';
import { formatMoney } from '@/domain/money';
import { useAccountBalance } from '@/db/queries/transactions';
import { useT } from '@/i18n';
import type { Account } from '@/db/types';
import styles from './AccountPickerSheet.module.css';

type AccountPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (accountId: string) => void;
  excludeAccountId?: string;
};

export function AccountPickerSheet({ open, onClose, onSelect, excludeAccountId }: AccountPickerSheetProps) {
  const t = useT();
  const accounts = useAccounts().filter((account) => account.id !== excludeAccountId);

  return (
    <Sheet open={open} onClose={onClose} title={t.sheets.chooseAccount}>
      <div className={styles.list}>
        {accounts.map((account) => (
          <AccountRow key={account.id} account={account} onSelect={onSelect} />
        ))}
      </div>
    </Sheet>
  );
}

function AccountRow({ account, onSelect }: { account: Account; onSelect: (id: string) => void }) {
  const balance = useAccountBalance(account.id);
  return (
    <button type="button" className={styles.row} onClick={() => onSelect(account.id)}>
      <span className={styles.icon} style={{ background: account.color }}>
        <AppIcon name={account.icon} />
      </span>
      <span className={styles.name}>{account.name}</span>
      <span className={styles.balance}>{formatMoney(balance, account.currency)}</span>
    </button>
  );
}
