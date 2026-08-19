import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Calendar } from 'lucide-react';
import { db } from '@/db/db';
import { AppIcon } from '@/components/AppIcon';
import { useAccounts } from '@/db/queries/accounts';
import { useSettings } from '@/db/queries/settings';
import { createTransaction } from '@/db/queries/transactions';
import { upsertPayee } from '@/db/queries/payees';
import { deleteAiJob } from '@/db/queries/aiJobs';
import { AccountPickerSheet } from '@/components/AccountPickerSheet';
import { CategoryPickerSheet } from '@/components/CategoryPickerSheet';
import { todayIsoDate } from '@/domain/transactions';
import { formatMoney, toMinorUnits } from '@/domain/money';
import { useT } from '@/i18n';
import type { ReviewLocationState, ReviewRow } from './ReviewDraftPage.types';
import styles from './ReviewDraftPage.module.css';

function rowsFromDraft(state: ReviewLocationState | null): ReviewRow[] {
  if (!state?.draft.transactions) return [];
  return state.draft.transactions.map((tx) => ({
    localId: uuidv4(),
    include: true,
    amountText: String(tx.amount),
    direction: tx.direction,
    categoryId: tx.categoryId,
    memo: tx.memo ?? '',
    confidence: tx.confidence,
  }));
}

export function ReviewDraftPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const state = (location.state as ReviewLocationState | null) ?? null;

  const accounts = useAccounts();
  const settings = useSettings();
  const [accountIdOverride, setAccountIdOverride] = useState<string | undefined>();
  const [date, setDate] = useState(state?.draft.date ?? todayIsoDate());
  const [rows, setRows] = useState<ReviewRow[]>(() => rowsFromDraft(state));
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [categoryPickerForRow, setCategoryPickerForRow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const accountId = accountIdOverride ?? accounts[0]?.id;
  const account = accounts.find((a) => a.id === accountId);
  const currency = state?.draft.currency ?? account?.currency ?? settings?.baseCurrency ?? 'USD';

  const updateRow = (localId: string, patch: Partial<ReviewRow>) => {
    setRows((prev) => prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  };

  const includedRows = rows.filter((row) => row.include && toMinorUnits(row.amountText) > 0 && row.categoryId);
  const canSave = Boolean(accountId) && includedRows.length > 0;

  const handleSave = async () => {
    if (!canSave || !accountId) return;
    setSaving(true);
    const payeeId = state?.draft.merchant
      ? await upsertPayee(state.draft.merchant, includedRows[0]?.categoryId)
      : undefined;
    for (const row of includedRows) {
      const amount = toMinorUnits(row.amountText);
      await createTransaction({
        accountId,
        date,
        amount: row.direction === 'expense' ? -amount : amount,
        currency,
        categoryId: row.categoryId,
        memo: row.memo.trim() || undefined,
        payeeId,
        source: state?.source ?? 'text',
      });
    }
    if (state?.jobId) {
      await deleteAiJob(state.jobId);
    }
    setSaving(false);
    void navigate('/', { replace: true });
  };

  const handleDiscard = async () => {
    if (state?.jobId) await deleteAiJob(state.jobId);
    void navigate(-1);
  };

  if (!state) {
    return (
      <div className={styles.root}>
        <div className={styles.header}>
          <button type="button" className={styles.back} onClick={() => void navigate(-1)}>
            <ArrowLeft size={18} aria-hidden="true" />
            {t.reviewDraft.back}
          </button>
          <span className={styles.title}>{t.reviewDraft.review}</span>
          <span />
        </div>
        <div className={styles.emptyState}>{t.reviewDraft.empty}</div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={() => void handleDiscard()}>
          <ArrowLeft size={18} aria-hidden="true" />
          {t.reviewDraft.discard}
        </button>
        <span className={styles.title}>{t.reviewDraft.review}</span>
        <button type="button" className={styles.save} disabled={!canSave || saving} onClick={() => void handleSave()}>
          {t.reviewDraft.save}
        </button>
      </div>

      {state.draft.merchant && <div className={styles.merchant}>{t.reviewDraft.detected(state.draft.merchant)}</div>}

      <div className={styles.fields}>
        <button type="button" className={styles.fieldRow} onClick={() => setAccountPickerOpen(true)}>
          <AppIcon name={account?.icon ?? 'wallet'} size={18} className={styles.fieldIcon} />
          <span className={styles.fieldLabel}>{t.reviewDraft.account}</span>
          <span className={styles.fieldValue}>{account?.name ?? t.reviewDraft.choose}</span>
        </button>
        <div className={styles.fieldRow}>
          <Calendar className={styles.fieldIcon} size={18} aria-hidden="true" />
          <span className={styles.fieldLabel}>{t.reviewDraft.date}</span>
          <input
            type="date"
            className={styles.dateInput}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
      </div>

      <div className={styles.rowsHeading}>{t.reviewDraft.found(rows.length)}</div>
      <div className={styles.rowList}>
        {rows.map((row) => (
          <ReviewRowItem
            key={row.localId}
            row={row}
            currency={currency}
            onToggleInclude={() => updateRow(row.localId, { include: !row.include })}
            onAmountChange={(amountText) => updateRow(row.localId, { amountText })}
            onMemoChange={(memo) => updateRow(row.localId, { memo })}
            onPickCategory={() => setCategoryPickerForRow(row.localId)}
          />
        ))}
      </div>

      <AccountPickerSheet
        open={accountPickerOpen}
        onClose={() => setAccountPickerOpen(false)}
        onSelect={(id) => {
          setAccountIdOverride(id);
          setAccountPickerOpen(false);
        }}
      />
      <CategoryPickerSheet
        open={categoryPickerForRow !== null}
        onClose={() => setCategoryPickerForRow(null)}
        kind={rows.find((r) => r.localId === categoryPickerForRow)?.direction === 'income' ? 'income' : 'expense'}
        onSelect={(categoryId) => {
          if (categoryPickerForRow) updateRow(categoryPickerForRow, { categoryId });
          setCategoryPickerForRow(null);
        }}
      />
    </div>
  );
}

type ReviewRowItemProps = {
  row: ReviewRow;
  currency: string;
  onToggleInclude: () => void;
  onAmountChange: (value: string) => void;
  onMemoChange: (value: string) => void;
  onPickCategory: () => void;
};

function ReviewRowItem({
  row,
  currency,
  onToggleInclude,
  onAmountChange,
  onMemoChange,
  onPickCategory,
}: ReviewRowItemProps) {
  const t = useT();
  const category = useLiveQuery(() => db.categories.get(row.categoryId), [row.categoryId]);

  return (
    <div className={`${styles.row} ${!row.include ? styles.rowExcluded : ''}`}>
      <input type="checkbox" checked={row.include} onChange={onToggleInclude} />
      <div className={styles.rowMain}>
        <div className={styles.rowTopLine}>
          <button type="button" className={styles.categoryButton} onClick={onPickCategory}>
            <AppIcon name={category?.icon} size={18} className={styles.categoryIcon} />
            <span className={styles.categoryLabel}>{category?.name ?? t.reviewDraft.chooseCategory}</span>
          </button>
          {row.confidence < 0.6 && <span className={styles.confidenceBadge}>{t.reviewDraft.lowConfidence}</span>}
        </div>
        <input
          className={`${styles.amountInput} ${row.direction === 'expense' ? styles.amountExpense : styles.amountIncome}`}
          inputMode="decimal"
          value={row.amountText}
          onChange={(event) => onAmountChange(event.target.value)}
        />
        <input
          className={styles.memoInput}
          placeholder={t.reviewDraft.memoPlaceholder}
          value={row.memo}
          onChange={(event) => onMemoChange(event.target.value)}
        />
      </div>
      <span className={styles.fieldValue}>{formatMoney(toMinorUnits(row.amountText), currency)}</span>
    </div>
  );
}
