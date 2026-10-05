import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { db } from '@/db/db';
import { AppIcon } from '@/components/AppIcon';
import { useAccounts } from '@/db/queries/accounts';
import { useCategoryGroups } from '@/db/queries/categories';
import { useSettings } from '@/db/queries/settings';
import { useTransactions } from '@/db/queries/transactions';
import { AccountPickerSheet } from '@/components/AccountPickerSheet';
import { CategoryPickerSheet } from '@/components/CategoryPickerSheet';
import { formatMoney, toMinorUnits } from '@/domain/money';
import { useT } from '@/i18n';
import { getDateFnsLocale } from '@/i18n/dateFnsLocale';
import type { StatementLine, StatementReviewLocationState, StatementRow } from './StatementReviewPage.types';
import {
  importStatementRows,
  isImportable,
  isValidStatementLine,
  LOW_CONFIDENCE,
  linesFromStatement,
  resolveRows,
  sumByKind,
  statementImportErrorMessage,
  statementMessage,
  type ReviewedStatementRow,
  type StatementIncludeOverrides,
} from './StatementReviewPage.utils';
import styles from './StatementReviewPage.module.css';

export function StatementReviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const state = (location.state as StatementReviewLocationState | null) ?? null;

  const accounts = useAccounts();
  const settings = useSettings();
  const groups = useCategoryGroups();
  const [accountIdOverride, setAccountIdOverride] = useState<string | undefined>();
  const accountId = accountIdOverride ?? accounts[0]?.id;
  const account = accounts.find((a) => a.id === accountId);
  const existing = useTransactions({ accountId });
  const currency = state?.statement.currency ?? account?.currency ?? settings?.baseCurrency ?? 'USD';

  const [lines, setLines] = useState<StatementLine[]>(() => (state ? linesFromStatement(state.statement) : []));
  const [overrides, setOverrides] = useState<StatementIncludeOverrides>({});
  const payees = useLiveQuery(() => db.payees.toArray());
  const rows = resolveRows(lines, existing, overrides, { accountId: accountId ?? '', currency, payees });
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [categoryPickerForRow, setCategoryPickerForRow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setCategory = (localId: string, categoryId: string) =>
    setLines((prev) => prev.map((line) => (line.localId === localId ? { ...line, categoryId } : line)));
  const toggleInclude = (row: ReviewedStatementRow) => {
    if (savingRef.current) return;
    setError(null);
    setOverrides((prev) => ({
      ...prev,
      [row.localId]: {
        include: !row.include,
        fingerprint: row.fingerprint,
        confirmedDuplicate: row.duplicate && !row.include,
      },
    }));
  };
  const setAll = (include: boolean) => {
    if (savingRef.current) return;
    setError(null);
    setOverrides(
      Object.fromEntries(
        rows.map((row) => [
          row.localId,
          {
            include: include && !row.duplicate && row.kind !== 'transfer',
            fingerprint: row.fingerprint,
            confirmedDuplicate: false,
          },
        ]),
      ),
    );
  };

  const importable = rows.filter(isImportable);
  const currencyMatches = Boolean(account && account.currency.toUpperCase() === currency.toUpperCase());
  const sums = sumByKind(importable);
  const safeTotal = Number.isSafeInteger(sums.income) && Number.isSafeInteger(sums.expense);
  const canSave = Boolean(accountId) && currencyMatches && safeTotal && importable.length > 0 && !saving;
  const warning =
    !currencyMatches && account
      ? statementMessage('currency')
      : !safeTotal
        ? statementMessage('money')
        : lines.some((line) => !isValidStatementLine(line))
          ? statementMessage('data')
          : lines.some((line) => line.kind === 'transfer')
            ? statementMessage('transfer')
            : null;

  const handleImport = async () => {
    if (savingRef.current || !canSave || !accountId) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await importStatementRows({ rows, accountId, currency, groups });
      if (mountedRef.current) void navigate('/transactions', { replace: true });
    } catch (problem) {
      if (mountedRef.current) setError(statementImportErrorMessage(problem));
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

  if (!state) {
    return (
      <div className={styles.root}>
        <Header title={t.statementReview.title} onBack={() => void navigate(-1)} />
        <div className={styles.emptyState}>{t.statementReview.empty}</div>
      </div>
    );
  }

  const pickerRow = rows.find((r) => r.localId === categoryPickerForRow);

  return (
    <div className={styles.root}>
      <Header title={t.statementReview.title} onBack={() => void navigate(-1)} />
      <StatementMeta state={state} />
      {(error || warning) && (
        <div className={styles.emptyState} role="alert">
          {error ?? warning}
        </div>
      )}

      <div className={styles.fields}>
        <button type="button" className={styles.fieldRow} disabled={saving} onClick={() => setAccountPickerOpen(true)}>
          <AppIcon name={account?.icon ?? 'wallet'} size={18} className={styles.fieldIcon} />
          <span className={styles.fieldLabel}>{t.statementReview.account}</span>
          <span className={styles.fieldValue}>{account?.name ?? t.statementReview.choose}</span>
        </button>
      </div>

      <SummaryBar rows={importable} total={rows.length} currency={currency} onAll={setAll} />

      {rows.length === 0 ? (
        <div className={styles.emptyState}>{t.statementReview.empty}</div>
      ) : (
        <div className={styles.rowList}>
          {rows.map((row) => (
            <StatementRowItem
              key={row.localId}
              row={row}
              currency={currency}
              disabled={saving || row.kind === 'transfer' || !isValidStatementLine(row)}
              onToggleInclude={() => toggleInclude(row)}
              onPickCategory={() => setCategoryPickerForRow(row.localId)}
            />
          ))}
        </div>
      )}

      <div className={styles.footer}>
        <button type="button" className={styles.importButton} disabled={!canSave} onClick={() => void handleImport()}>
          {t.statementReview.import(importable.length)}
        </button>
      </div>

      <AccountPickerSheet
        open={accountPickerOpen}
        onClose={() => setAccountPickerOpen(false)}
        onSelect={(id) => {
          if (savingRef.current) return;
          setAccountIdOverride(id);
          setOverrides({});
          setError(null);
          setAccountPickerOpen(false);
        }}
      />
      <CategoryPickerSheet
        open={pickerRow !== undefined}
        onClose={() => setCategoryPickerForRow(null)}
        kind={pickerRow?.kind === 'income' ? 'income' : 'expense'}
        onSelect={(categoryId) => {
          if (savingRef.current) return;
          if (categoryPickerForRow) {
            setCategory(categoryPickerForRow, categoryId);
            setOverrides((prev) => {
              const next = { ...prev };
              delete next[categoryPickerForRow];
              return next;
            });
          }
          setError(null);
          setCategoryPickerForRow(null);
        }}
      />
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const t = useT();
  return (
    <div className={styles.header}>
      <button type="button" className={styles.back} onClick={onBack}>
        <ArrowLeft size={18} aria-hidden="true" />
        {t.capture.back}
      </button>
      <span className={styles.title}>{title}</span>
      <span className={styles.headerSpacer} />
    </div>
  );
}

function StatementMeta({ state }: { state: StatementReviewLocationState }) {
  const t = useT();
  const { accountName, periodStart, periodEnd } = state.statement;
  const period =
    periodStart && periodEnd ? t.statementReview.period(formatDay(periodStart), formatDay(periodEnd)) : null;
  return (
    <div className={styles.meta}>
      <span className={styles.metaName}>{accountName ?? state.fileName}</span>
      {period && <span className={styles.metaPeriod}>{period}</span>}
    </div>
  );
}

type SummaryBarProps = {
  rows: StatementRow[];
  total: number;
  currency: string;
  onAll: (include: boolean) => void;
};

function SummaryBar({ rows, total, currency, onAll }: SummaryBarProps) {
  const t = useT();
  const sums = sumByKind(rows);
  return (
    <div className={styles.summary}>
      <div className={styles.summaryLine}>
        <span className={styles.summaryCount}>{t.statementReview.summary(rows.length, total)}</span>
        <button type="button" className={styles.summaryAction} onClick={() => onAll(true)}>
          {t.statementReview.selectAll}
        </button>
        <button type="button" className={styles.summaryAction} onClick={() => onAll(false)}>
          {t.statementReview.selectNone}
        </button>
      </div>
      <div className={styles.summaryTotals}>
        <span className={styles.summaryLabel}>{t.statementReview.income}</span>
        <span className={styles.summaryIncome}>
          {Number.isSafeInteger(sums.income) ? formatMoney(sums.income, currency) : '—'}
        </span>
        <span className={styles.summaryLabel}>{t.statementReview.expenses}</span>
        <span className={styles.summaryExpense}>
          {Number.isSafeInteger(sums.expense) ? formatMoney(sums.expense, currency) : '—'}
        </span>
      </div>
    </div>
  );
}

type StatementRowItemProps = {
  row: StatementRow;
  currency: string;
  disabled: boolean;
  onToggleInclude: () => void;
  onPickCategory: () => void;
};

function StatementRowItem({ row, currency, disabled, onToggleInclude, onPickCategory }: StatementRowItemProps) {
  const t = useT();
  const category = useLiveQuery(() => db.categories.get(row.categoryId), [row.categoryId]);
  const amountClass = row.kind === 'income' ? styles.amountIncome : styles.amountExpense;

  return (
    <div className={`${styles.row} ${!row.include ? styles.rowExcluded : ''}`}>
      <input
        type="checkbox"
        checked={row.include}
        disabled={disabled}
        aria-label={`${formatDay(row.date)} ${row.payee || row.memo || row.amountText}`}
        onChange={onToggleInclude}
      />
      <div className={styles.rowMain}>
        <div className={styles.rowTopLine}>
          <span className={styles.rowDate}>{formatDay(row.date)}</span>
          <span className={styles.rowPayee}>{row.payee || row.memo || category?.name}</span>
        </div>
        <div className={styles.rowBottomLine}>
          <button type="button" className={styles.categoryButton} disabled={disabled} onClick={onPickCategory}>
            <AppIcon name={category?.icon} size={16} className={styles.categoryIcon} />
            <span className={styles.categoryLabel}>{category?.name ?? t.statementReview.chooseCategory}</span>
          </button>
          <RowBadges row={row} />
        </div>
      </div>
      <span className={`${styles.amount} ${amountClass}`}>{formatMoney(toMinorUnits(row.amountText), currency)}</span>
    </div>
  );
}

function RowBadges({ row }: { row: StatementRow }) {
  const t = useT();
  return (
    <>
      {row.duplicate && <span className={`${styles.badge} ${styles.badgeMuted}`}>{t.statementReview.duplicate}</span>}
      {row.kind === 'transfer' && (
        <span className={`${styles.badge} ${styles.badgeMuted}`}>{t.statementReview.transfer}</span>
      )}
      {row.confidence < LOW_CONFIDENCE && (
        <span className={`${styles.badge} ${styles.badgeWarning}`}>{t.statementReview.lowConfidence}</span>
      )}
    </>
  );
}

function formatDay(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM', { locale: getDateFnsLocale() });
  } catch {
    return iso;
  }
}
