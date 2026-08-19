import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router';
import { format, parseISO, subDays } from 'date-fns';
import { ArrowLeft, ArrowLeftRight, Calendar, CalendarDays, StickyNote, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { AppIcon } from '@/components/AppIcon';
import { ProgressBar } from '@/components/ProgressBar';
import { useAccounts } from '@/db/queries/accounts';
import { useSettings } from '@/db/queries/settings';
import { useBudgets } from '@/db/queries/budgets';
import { createTransaction, deleteTransaction, updateTransaction, useTransactions } from '@/db/queries/transactions';
import { useNumberPad } from '@/hooks/useNumberPad';
import { NumberPad } from '@/components/NumberPad';
import { AccountPickerSheet } from '@/components/AccountPickerSheet';
import { CategoryPickerSheet } from '@/components/CategoryPickerSheet';
import { todayIsoDate } from '@/domain/transactions';
import { summarizeCategory } from '@/domain/budget';
import { formatMoney, toMinorUnits } from '@/domain/money';
import { useT } from '@/i18n';
import { getDateFnsLocale } from '@/i18n/dateFnsLocale';
import { SplitsEditor } from './SplitsEditor';
import type { SplitRow, TransactionDirection } from './TransactionForm.types';
import type { Transaction } from '@/db/types';
import styles from './TransactionForm.module.css';

type TransactionFormProps = {
  direction?: TransactionDirection;
  transactionId?: string;
};

export function TransactionForm({ direction, transactionId }: TransactionFormProps) {
  const existing = useLiveQuery(
    () => (transactionId ? db.transactions.get(transactionId) : undefined),
    [transactionId],
  );

  if (transactionId && !existing) return null;

  return <TransactionFormFields key={transactionId ?? 'new'} direction={direction} existing={existing} />;
}

function splitsToRows(splits: Transaction['splits']): SplitRow[] {
  return (splits ?? []).map((split) => ({
    localId: crypto.randomUUID(),
    categoryId: split.categoryId,
    amountText: String(Math.abs(split.amount) / 100),
  }));
}

type TransactionFormFieldsProps = {
  direction?: TransactionDirection;
  existing?: Transaction;
};

function TransactionFormFields({ direction: propDirection, existing }: TransactionFormFieldsProps) {
  const navigate = useNavigate();
  const t = useT();
  const settings = useSettings();
  const accounts = useAccounts();
  const transactionId = existing?.id;

  const pad = useNumberPad(existing ? Math.abs(existing.amount) / 100 : 0);
  const [direction, setDirection] = useState<TransactionDirection>(
    propDirection ?? (existing ? (existing.amount < 0 ? 'expense' : 'income') : 'expense'),
  );
  const [accountIdOverride, setAccountIdOverride] = useState<string | undefined>(existing?.accountId);
  const [categoryId, setCategoryId] = useState<string | undefined>(existing?.categoryId);
  const [date, setDate] = useState(existing?.date ?? todayIsoDate());
  const [memo, setMemo] = useState(existing?.memo ?? '');
  const [splitMode, setSplitMode] = useState(Boolean(existing?.splits?.length));
  const [splits, setSplits] = useState<SplitRow[]>(() => splitsToRows(existing?.splits));
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const accountId = accountIdOverride ?? accounts[0]?.id;
  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? settings?.baseCurrency ?? 'USD';
  const category = useLiveQuery(() => (categoryId ? db.categories.get(categoryId) : undefined), [categoryId]);
  const budgets = useBudgets();
  const budgetTransactions = useTransactions();
  const budgetSummary =
    !splitMode && category
      ? summarizeCategory(category, budgets, budgetTransactions, format(parseISO(date), 'yyyy-MM'))
      : undefined;

  const splitsAssigned = splits.reduce((sum, row) => sum + toMinorUnits(row.amountText), 0);
  const splitsValid = splitMode ? splitsAssigned === pad.minorUnits && splits.every((row) => row.categoryId) : true;

  const canSave = Boolean(accountId) && pad.minorUnits > 0 && splitsValid && (splitMode || Boolean(categoryId));
  const disabledReason =
    pad.minorUnits <= 0 ? t.addTx.reasonNoAmount : !splitMode && !categoryId ? t.addTx.reasonNoCategory : undefined;

  const handleSave = async () => {
    if (!canSave || !accountId) return;
    const signedAmount = direction === 'expense' ? -pad.minorUnits : pad.minorUnits;
    const payload = {
      accountId,
      date,
      amount: signedAmount,
      currency,
      categoryId: splitMode ? undefined : categoryId,
      memo: memo.trim() || undefined,
      splits: splitMode
        ? splits.map((row) => ({
            categoryId: row.categoryId!,
            amount: direction === 'expense' ? -toMinorUnits(row.amountText) : toMinorUnits(row.amountText),
          }))
        : undefined,
    };
    if (transactionId) {
      await updateTransaction(transactionId, payload);
    } else {
      await createTransaction(payload);
    }
    void navigate(-1);
  };

  const handleDelete = async () => {
    if (!transactionId) return;
    await deleteTransaction(transactionId);
    void navigate(-1);
  };

  const title = transactionId
    ? t.addTx.titleEdit
    : direction === 'expense'
      ? t.addTx.titleExpense
      : t.addTx.titleIncome;

  const todayIso = todayIsoDate();
  const yesterdayIso = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const isToday = date === todayIso;
  const isYesterday = date === yesterdayIso;
  const isCustomDate = !isToday && !isYesterday;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={() => void navigate(-1)}>
          <ArrowLeft size={18} aria-hidden="true" />
          {t.addTx.back}
        </button>
        <span className={styles.title}>{title}</span>
        <span className={styles.headerSpacer} />
      </div>

      <div className={styles.amountWrap}>
        <span className={`${styles.amount} ${direction === 'expense' ? styles.amountExpense : styles.amountIncome}`}>
          {pad.displayText}
          <span className={styles.currency}>{currency}</span>
        </span>
      </div>

      <div className={styles.fields}>
        {!transactionId && (
          <div className={styles.fieldRow}>
            <ArrowLeftRight className={styles.fieldIcon} size={18} aria-hidden="true" />
            <span className={styles.fieldLabel}>{t.addTx.type}</span>
            <button
              type="button"
              className={styles.fieldValue}
              onClick={() => setDirection((d) => (d === 'expense' ? 'income' : 'expense'))}
            >
              {direction === 'expense' ? t.common.expense : t.common.income}
            </button>
          </div>
        )}
        <button type="button" className={styles.fieldRow} onClick={() => setAccountPickerOpen(true)}>
          <AppIcon name={account?.icon ?? 'wallet'} size={18} className={styles.fieldIcon} />
          <span className={styles.fieldLabel}>{t.addTx.account}</span>
          <span className={styles.fieldValue}>{account?.name ?? t.common.choose}</span>
        </button>
        {!splitMode && (
          <button type="button" className={styles.fieldRow} onClick={() => setCategoryPickerOpen(true)}>
            <AppIcon name={category?.icon} size={18} className={styles.fieldIcon} />
            <span className={styles.fieldLabel}>{t.addTx.category}</span>
            <span className={styles.fieldValue}>{category?.name ?? t.common.choose}</span>
          </button>
        )}
        {budgetSummary && budgetSummary.assigned > 0 && (
          <div className={styles.budgetHint}>
            <div className={styles.budgetHintRow}>
              <span>{t.addTx.spent(formatMoney(Math.abs(budgetSummary.activity), currency))}</span>
              <span>{t.addTx.left(formatMoney(budgetSummary.available, currency))}</span>
            </div>
            <ProgressBar
              value={Math.abs(budgetSummary.activity) / budgetSummary.assigned}
              color={budgetSummary.available < 0 ? 'var(--color-expense)' : undefined}
            />
          </div>
        )}
        <div className={styles.fieldRow}>
          <Calendar className={styles.fieldIcon} size={18} aria-hidden="true" />
          <span className={styles.fieldLabel}>{t.addTx.date}</span>
          <div className={styles.dateChips}>
            <button
              type="button"
              className={`${styles.dateChip} ${isToday ? styles.dateChipActive : ''}`}
              onClick={() => setDate(todayIso)}
            >
              {t.common.today}
            </button>
            <button
              type="button"
              className={`${styles.dateChip} ${isYesterday ? styles.dateChipActive : ''}`}
              onClick={() => setDate(yesterdayIso)}
            >
              {t.common.yesterday}
            </button>
            <label
              className={`${styles.dateChip} ${styles.dateChipCustom} ${isCustomDate ? styles.dateChipActive : ''}`}
            >
              {isCustomDate ? (
                format(parseISO(date), 'd MMM', { locale: getDateFnsLocale() })
              ) : (
                <CalendarDays size={14} aria-hidden="true" />
              )}
              <input
                type="date"
                className={styles.dateInputHidden}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
          </div>
        </div>
        <div className={styles.fieldRow}>
          <StickyNote className={styles.fieldIcon} size={18} aria-hidden="true" />
          <input
            className={styles.memoInput}
            placeholder={t.addTx.memoPlaceholder}
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
          />
        </div>
        {direction === 'expense' && (
          <div className={styles.splitToggle}>
            <span className={styles.splitToggleLabel}>{t.addTx.splitToggle}</span>
            <input type="checkbox" checked={splitMode} onChange={(event) => setSplitMode(event.target.checked)} />
          </div>
        )}
        {splitMode && (
          <SplitsEditor
            rows={splits}
            onChange={setSplits}
            totalMinorUnits={pad.minorUnits}
            currency={currency}
            kind="expense"
          />
        )}
        {transactionId && (
          <button type="button" className={styles.fieldRow} onClick={() => void handleDelete()}>
            <Trash2
              className={styles.fieldIcon}
              size={18}
              aria-hidden="true"
              style={{ color: 'var(--color-expense)' }}
            />
            <span style={{ color: 'var(--color-expense)' }}>{t.addTx.deleteTransaction}</span>
          </button>
        )}
      </div>

      <div className={styles.primaryWrap}>
        {!canSave && disabledReason && <div className={styles.disabledReason}>{disabledReason}</div>}
        <button type="button" className={styles.primaryButton} disabled={!canSave} onClick={() => void handleSave()}>
          {t.addTx.save}
        </button>
      </div>
      <div className={styles.padWrap}>
        <NumberPad onKey={pad.press} />
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
        open={categoryPickerOpen}
        onClose={() => setCategoryPickerOpen(false)}
        kind={direction === 'expense' ? 'expense' : 'income'}
        onSelect={(id) => {
          setCategoryId(id);
          setCategoryPickerOpen(false);
        }}
      />
    </div>
  );
}
