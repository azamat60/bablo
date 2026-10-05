import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Calendar } from 'lucide-react';
import { db } from '@/db/db';
import { AppIcon } from '@/components/AppIcon';
import { useAccounts } from '@/db/queries/accounts';
import { useSettings } from '@/db/queries/settings';
import { importStatementRows, resolveRows, type StatementIncludeOverrides } from './StatementReviewPage.utils';
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
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const [choices, setChoices] = useState<StatementIncludeOverrides>({});
  const existing = useLiveQuery(() => db.transactions.toArray(), []) ?? [];
  const payees = useLiveQuery(() => db.payees.toArray(), []) ?? [];

  const accountId = accountIdOverride ?? accounts[0]?.id;
  const account = accounts.find((a) => a.id === accountId);
  const currency = state?.draft.currency ?? account?.currency ?? settings?.baseCurrency ?? 'USD';

  const updateRow = (localId: string, patch: Partial<ReviewRow>) => {
    setRows((prev) => prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  };

  const reviewed = resolveRows(
    rows.map((row) => ({ ...row, date, kind: row.direction, payee: state?.draft.merchant ?? '' })),
    existing,
    choices,
    { accountId: accountId ?? '', currency, payees },
  );
  const canSave =
    Boolean(accountId) && account?.currency === currency && reviewed.some((row) => row.include && row.categoryId);

  const handleSave = async () => {
    if (!canSave || !accountId || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await db.transaction(
        'rw',
        [
          db.accounts,
          db.categories,
          db.categoryGroups,
          db.payees,
          db.transactions,
          db.settings,
          db.rates,
          db.syncQueue,
          db.aiJobs,
        ],
        async () => {
          await importStatementRows({
            rows: reviewed,
            accountId,
            currency,
            groups: [],
            source: state?.source ?? 'text',
          });
          if (state?.jobId) await deleteAiJob(state.jobId);
        },
      );
      void navigate('/', { replace: true });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Не удалось сохранить.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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

      {error && <p role="alert">{error}</p>}
      {account && account.currency !== currency && (
        <p role="alert">Валюта распознавания: {currency}. Выберите счёт в этой валюте.</p>
      )}
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
        {rows.map((row, index) => (
          <div key={row.localId}>
            {reviewed[index]?.duplicate && <p role="status">Дубль. Отметьте строку для явного подтверждения.</p>}
            <ReviewRowItem
              key={row.localId}
              row={{ ...row, include: reviewed[index]?.include ?? false }}
              currency={currency}
              onToggleInclude={() => {
                const checked = reviewed[index];
                if (checked)
                  setChoices((prev) => ({
                    ...prev,
                    [row.localId]: {
                      include: !checked.include,
                      fingerprint: checked.fingerprint,
                      confirmedDuplicate: checked.duplicate && !checked.include,
                    },
                  }));
              }}
              onAmountChange={(amountText) => updateRow(row.localId, { amountText })}
              onMemoChange={(memo) => updateRow(row.localId, { memo })}
              onPickCategory={() => setCategoryPickerForRow(row.localId)}
            />
          </div>
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
