import { useMemo, useState } from 'react';
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
import type {
  IncludeOverrides,
  StatementLine,
  StatementReviewLocationState,
  StatementRow,
} from './StatementReviewPage.types';
import {
  importStatementRows,
  isImportable,
  LOW_CONFIDENCE,
  linesFromStatement,
  resolveRows,
  sumByKind,
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
  const [overrides, setOverrides] = useState<IncludeOverrides>({});
  const rows = useMemo(() => resolveRows(lines, existing, overrides), [lines, existing, overrides]);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [categoryPickerForRow, setCategoryPickerForRow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setCategory = (localId: string, categoryId: string) =>
    setLines((prev) => prev.map((line) => (line.localId === localId ? { ...line, categoryId } : line)));
  const toggleInclude = (row: StatementRow) => setOverrides((prev) => ({ ...prev, [row.localId]: !row.include }));
  const setAll = (include: boolean) =>
    setOverrides(Object.fromEntries(lines.map((line) => [line.localId, include] as const)));

  const importable = rows.filter(isImportable);
  const canSave = Boolean(accountId) && importable.length > 0 && !saving;

  const handleImport = async () => {
    if (!canSave || !accountId) return;
    setSaving(true);
    await importStatementRows({ rows, accountId, currency, groups });
    setSaving(false);
    void navigate('/transactions', { replace: true });
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

      <div className={styles.fields}>
        <button type="button" className={styles.fieldRow} onClick={() => setAccountPickerOpen(true)}>
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
          setAccountIdOverride(id);
          setAccountPickerOpen(false);
        }}
      />
      <CategoryPickerSheet
        open={pickerRow !== undefined}
        onClose={() => setCategoryPickerForRow(null)}
        kind={pickerRow?.kind === 'income' ? 'income' : 'expense'}
        onSelect={(categoryId) => {
          if (categoryPickerForRow) setCategory(categoryPickerForRow, categoryId);
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
        <span className={styles.summaryIncome}>{formatMoney(sums.income, currency)}</span>
        <span className={styles.summaryLabel}>{t.statementReview.expenses}</span>
        <span className={styles.summaryExpense}>{formatMoney(sums.expense, currency)}</span>
      </div>
    </div>
  );
}

type StatementRowItemProps = {
  row: StatementRow;
  currency: string;
  onToggleInclude: () => void;
  onPickCategory: () => void;
};

function StatementRowItem({ row, currency, onToggleInclude, onPickCategory }: StatementRowItemProps) {
  const t = useT();
  const category = useLiveQuery(() => db.categories.get(row.categoryId), [row.categoryId]);
  const amountClass = row.kind === 'income' ? styles.amountIncome : styles.amountExpense;

  return (
    <div className={`${styles.row} ${!row.include ? styles.rowExcluded : ''}`}>
      <input type="checkbox" checked={row.include} onChange={onToggleInclude} />
      <div className={styles.rowMain}>
        <div className={styles.rowTopLine}>
          <span className={styles.rowDate}>{formatDay(row.date)}</span>
          <span className={styles.rowPayee}>{row.payee || row.memo || category?.name}</span>
        </div>
        <div className={styles.rowBottomLine}>
          <button type="button" className={styles.categoryButton} onClick={onPickCategory}>
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
