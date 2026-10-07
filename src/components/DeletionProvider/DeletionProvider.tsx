import { useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, RotateCcw, X } from 'lucide-react';
import { db } from '@/db/db';
import { deleteAccount, getAccountDeletionImpact } from '@/db/queries/accounts';
import { deleteTransaction, restoreTransaction } from '@/db/queries/transactions';
import { deleteCategory, deleteCategoryGroup, getCategoryDeletionImpact } from '@/db/queries/categoryDeletion';
import { AppIcon } from '@/components/AppIcon';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { formatMoney } from '@/domain/money';
import { groupIcon } from '@/domain/groups';
import { usePrivacyStore } from '@/store/privacy';
import { useT } from '@/i18n';
import { DeletionContext } from './DeletionProvider.context';
import styles from './DeletionProvider.module.css';

type DeletionRequest = {
  kind: 'account' | 'transaction' | 'category' | 'group';
  id: string;
  onDeleted?: () => void;
};

type Notice = { text: string; undoId?: string; error?: string };

export function DeletionProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const masked = usePrivacyStore((state) => state.hideAmounts);
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [restoring, setRestoring] = useState(false);
  const busyRef = useRef(false);

  const result = useLiveQuery(async () => {
    if (!request) return null;
    if (request.kind === 'group') {
      const group = await db.categoryGroups.get(request.id);
      if (!group || group.deleted) return { kind: 'unavailable' as const, id: request.id, requestKind: request.kind };
      const categories = await db.categories.where('groupId').equals(group.id).toArray();
      const impact = await getCategoryDeletionImpact(categories.map((category) => category.id));
      return { kind: 'group' as const, id: request.id, group, categories, impact };
    }
    if (request.kind === 'category') {
      const category = await db.categories.get(request.id);
      if (!category || category.deleted)
        return { kind: 'unavailable' as const, id: request.id, requestKind: request.kind };
      const group = await db.categoryGroups.get(category.groupId);
      const impact = await getCategoryDeletionImpact([category.id]);
      return { kind: 'category' as const, id: request.id, category, group, impact };
    }
    if (request.kind === 'account') {
      const account = await db.accounts.get(request.id);
      if (!account || account.deleted)
        return { kind: 'unavailable' as const, id: request.id, requestKind: request.kind };
      const impact = await getAccountDeletionImpact(request.id);
      return { kind: 'account' as const, id: request.id, account, impact };
    }
    const transaction = await db.transactions.get(request.id);
    if (!transaction || transaction.deleted)
      return { kind: 'unavailable' as const, id: request.id, requestKind: request.kind };
    const account = await db.accounts.get(transaction.accountId);
    return { kind: 'transaction' as const, id: request.id, account, transaction };
  }, [request?.kind, request?.id]);
  const details = result?.kind === 'unavailable' ? null : result;

  const open = (kind: DeletionRequest['kind'], id: string, onDeleted?: () => void) => {
    if (busyRef.current) return;
    setError('');
    setRequest({ kind, id, onDeleted });
  };
  const close = () => {
    if (!busyRef.current) setRequest(null);
  };
  const confirm = async () => {
    if (!request || !details || details.id !== request.id || details.kind !== request.kind || busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    setError('');
    try {
      if (request.kind === 'account') {
        await deleteAccount(request.id);
        setNotice({ text: t.deletion.accountDeleted });
      } else if (request.kind === 'group') {
        await deleteCategoryGroup(request.id);
        setNotice({ text: t.deletion.categoryDeleted });
      } else if (request.kind === 'category') {
        await deleteCategory(request.id);
        setNotice({ text: t.deletion.categoryDeleted });
      } else {
        await deleteTransaction(request.id);
        setNotice({
          text:
            details.kind === 'transaction' && details.transaction.transferId
              ? t.deletion.transferDeleted
              : t.deletion.transactionDeleted,
          undoId: request.id,
        });
      }
      setRequest(null);
      request.onDeleted?.();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t.deletion.deleteError);
    } finally {
      busyRef.current = false;
      setPending(false);
    }
  };
  const undo = async () => {
    if (!notice?.undoId || busyRef.current) return;
    busyRef.current = true;
    setRestoring(true);
    try {
      await restoreTransaction(notice.undoId);
      setNotice({ text: t.deletion.restored });
    } catch (problem) {
      setNotice({ ...notice, error: problem instanceof Error ? problem.message : t.deletion.undoError });
    } finally {
      busyRef.current = false;
      setRestoring(false);
    }
  };

  const isAccount = request?.kind === 'account';
  const isGroup = request?.kind === 'group';
  const isCategory = request?.kind === 'category';
  const isTransfer = details?.kind === 'transaction' && Boolean(details.transaction.transferId);
  const title = isGroup
    ? t.deletion.groupTitle
    : isCategory
      ? t.deletion.categoryTitle
      : isAccount
        ? t.deletion.accountTitle
        : isTransfer
          ? t.deletion.transferTitle
          : t.deletion.transactionTitle;
  const description = isGroup
    ? t.deletion.groupDescription
    : isCategory
      ? t.deletion.categoryDescription
      : isAccount
        ? t.deletion.accountDescription
        : isTransfer
          ? t.deletion.transferDescription
          : t.deletion.transactionDescription;
  const transaction = details?.kind === 'transaction' ? details.transaction : undefined;
  const amount = transaction ? formatMoney(transaction.amount, transaction.currency) : undefined;
  const transactionLabel = isTransfer
    ? t.composer.titleTransfer
    : transaction && transaction.amount > 0
      ? t.common.income
      : t.common.expense;
  const preview =
    details?.kind === 'group'
      ? { ...details.group, icon: groupIcon(details.group, details.categories) }
      : details?.kind === 'category'
        ? details.category
        : details?.account;
  const previewSubtitle =
    details?.kind === 'category'
      ? details.group?.name
      : details?.kind === 'group'
        ? t.common[details.group.kind]
        : details?.account?.currency;

  return (
    <DeletionContext
      value={{
        requestAccountDeletion: (id, onDeleted) => open('account', id, onDeleted),
        requestTransactionDeletion: (id, onDeleted) => open('transaction', id, onDeleted),
        requestCategoryDeletion: (id, onDeleted) => open('category', id, onDeleted),
        requestCategoryGroupDeletion: (id, onDeleted) => open('group', id, onDeleted),
      }}
    >
      {children}
      <ConfirmDialog
        open={Boolean(request && details && request.id === details.id && request.kind === details.kind)}
        title={title}
        description={description}
        confirmLabel={isAccount ? t.deletion.accountAction : isGroup ? t.groupEdit.delete : t.common.delete}
        pending={pending}
        error={error}
        onClose={close}
        onConfirm={() => void confirm()}
      >
        <div className={styles.preview}>
          <span className={styles.previewIcon} style={{ background: preview?.color }}>
            <AppIcon name={preview?.icon ?? 'wallet'} size={20} />
          </span>
          <div className={styles.previewBody}>
            <span className={styles.previewTitle}>
              {isAccount || isGroup || isCategory ? preview?.name : transaction?.memo || transactionLabel}
            </span>
            <span className={styles.previewSubtitle}>
              {isAccount || isGroup || isCategory ? (
                previewSubtitle
              ) : (
                <>
                  <span>{preview?.name}</span>
                  <span className={styles.date}>{transaction?.date}</span>
                </>
              )}
            </span>
          </div>
          {amount && <span className={styles.amount}>{masked ? '••••••' : amount}</span>}
        </div>
        {details?.kind === 'account' && (
          <>
            <ul className={styles.impact}>
              <li>{t.deletion.transactions(details.impact.transactionCount)}</li>
              {details.impact.transferCount > 0 && <li>{t.deletion.transfers(details.impact.transferCount)}</li>}
              {details.impact.recurringCount > 0 && <li>{t.deletion.recurring(details.impact.recurringCount)}</li>}
            </ul>
            {details.impact.transferCount > 0 && <p className={styles.warning}>{t.deletion.transferWarning}</p>}
            {details.impact.goalCount > 0 && <p className={styles.hint}>{t.deletion.goalsWarning}</p>}
          </>
        )}
        {(details?.kind === 'category' || details?.kind === 'group') && (
          <>
            <ul className={styles.impact}>
              {details.kind === 'group' && <li>{t.deletion.categories(details.impact.categoryCount)}</li>}
              <li>{t.deletion.transactions(details.impact.transactionCount)}</li>
              {details.impact.recurringCount > 0 && <li>{t.deletion.recurring(details.impact.recurringCount)}</li>}
              {details.impact.budgetCount > 0 && <li>{t.deletion.budgets(details.impact.budgetCount)}</li>}
            </ul>
            {details.impact.splitCount > 0 && <p className={styles.warning}>{t.deletion.splitWarning}</p>}
            {details.impact.transferCount > 0 && <p className={styles.warning}>{t.deletion.transferWarning}</p>}
          </>
        )}
      </ConfirmDialog>
      {request &&
        result?.kind === 'unavailable' &&
        request.id === result.id &&
        request.kind === result.requestKind &&
        !pending && (
          <ConfirmDialog
            open
            title={title}
            description={t.deletion.unavailable}
            confirmLabel={t.common.close}
            onClose={close}
            onConfirm={close}
          />
        )}
      {notice && (
        <div
          className={`${styles.toast} ${notice.error ? styles.toastError : ''}`}
          role={notice.error ? 'alert' : 'status'}
        >
          <Check size={18} className={styles.toastIcon} aria-hidden="true" />
          <span className={styles.toastText}>{notice.error ?? notice.text}</span>
          {notice.undoId && (
            <button type="button" className={styles.undo} disabled={restoring} onClick={() => void undo()}>
              <RotateCcw size={15} aria-hidden="true" />
              {restoring ? t.deletion.restoring : t.deletion.undo}
            </button>
          )}
          <button
            type="button"
            className={styles.dismiss}
            aria-label={t.common.close}
            disabled={restoring}
            onClick={() => setNotice(null)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </DeletionContext>
  );
}
