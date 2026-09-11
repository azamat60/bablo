import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { format } from 'date-fns';
import { ArrowLeft, ChevronLeft, ChevronRight, Minus, Pencil, Plus, Search } from 'lucide-react';
import { TransactionRow } from '@/components/TransactionRow';
import { ProgressBar } from '@/components/ProgressBar';
import { useCategoryGroup } from '@/db/queries/categories';
import { useBudgets } from '@/db/queries/budgets';
import { useSettings } from '@/db/queries/settings';
import { useTransactionsInRange } from '@/db/queries/transactions';
import { useBudgetMonthStore } from '@/store/budgetMonth';
import { useTxDraftStore } from '@/store/txDraft';
import { monthLabel, shiftMonth } from '@/domain/budget';
import { formatMoney, formatMoneyWhole } from '@/domain/money';
import { groupTransactionsByDate, todayIsoDate } from '@/domain/transactions';
import {
  groupTransactionsInGroup,
  monthlyTotals,
  percentChange,
  perDay,
  subcategoryBreakdown,
} from '@/domain/groupStats';
import { getDateFnsLocale } from '@/i18n/dateFnsLocale';
import { useT } from '@/i18n';
import { GroupEditSheet } from './GroupEditSheet';
import styles from './GroupDetailPage.module.css';

const BAR_MONTHS = 9;

function monthEndIso(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y!, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const t = useT();
  const settings = useSettings();
  const group = useCategoryGroup(id);
  const budgets = useBudgets();
  const month = useBudgetMonthStore((s) => s.month);
  const setMonth = useBudgetMonthStore((s) => s.setMonth);
  const beginDraft = useTxDraftStore((s) => s.begin);
  const [query, setQuery] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const barsRef = useRef<HTMLDivElement>(null);

  // One indexed range covers the bar chart's months and the selected month.
  const months = useMemo(
    () => Array.from({ length: BAR_MONTHS }, (_, i) => shiftMonth(month, i - (BAR_MONTHS - 2))),
    [month],
  );
  const transactions = useTransactionsInRange(`${months[0]}-01`, monthEndIso(months[months.length - 1]!));

  const currency = settings?.baseCurrency ?? 'USD';
  const categoryIds = useMemo(() => new Set((group?.categories ?? []).map((c) => c.id)), [group]);
  const inGroup = useMemo(() => groupTransactionsInGroup(transactions, categoryIds), [transactions, categoryIds]);
  const inMonth = useMemo(() => inGroup.filter((tx) => tx.date.startsWith(month)), [inGroup, month]);

  const bars = useMemo(() => monthlyTotals(inGroup, categoryIds, months), [inGroup, categoryIds, months]);
  const total = bars.find((b) => b.month === month)?.amount ?? 0;
  const previous = bars.find((b) => b.month === shiftMonth(month, -1))?.amount ?? 0;
  const delta = percentChange(total, previous);
  const today = todayIsoDate();
  const daily = perDay(total, month, today);
  const dailyPrev = perDay(previous, shiftMonth(month, -1), today);
  const maxBar = Math.max(1, ...bars.map((b) => b.amount));

  // Keep the selected month in view; it sits near the trailing edge. Depends
  // on `bars` too, because the first render happens before the group loads.
  useEffect(() => {
    const container = barsRef.current;
    const active = container?.querySelector<HTMLElement>('[data-active="true"]');
    if (!container || !active) return;
    container.scrollLeft = active.offsetLeft - (container.clientWidth - active.clientWidth) / 2;
  }, [month, bars]);

  const assigned = budgets
    .filter((b) => b.month === month && categoryIds.has(b.categoryId))
    .reduce((sum, b) => sum + b.assigned, 0);

  const slices = useMemo(() => subcategoryBreakdown(inMonth, group?.categories ?? []), [inMonth, group]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? inMonth.filter((tx) => tx.memo?.toLowerCase().includes(q)) : inMonth;
  }, [inMonth, query]);
  const days = useMemo(() => groupTransactionsByDate(visible), [visible]);

  if (!id || !group) return null;
  const isIncome = group.kind === 'income';

  const addTransaction = () => {
    beginDraft({ kind: isIncome ? 'income' : 'expense', groupId: group.id });
    void navigate('/add/tx');
  };

  return (
    <div className={styles.root}>
      <div className={styles.topRow}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => void navigate(-1)}
          aria-label={t.common.back}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setEditOpen(true)}
          aria-label={t.groupDetail.editAria}
        >
          <Pencil size={18} aria-hidden="true" />
        </button>
      </div>

      <h1 className={styles.title}>{group.name}</h1>

      <label className={styles.search}>
        <Search size={18} aria-hidden="true" />
        <input
          className={styles.searchInput}
          placeholder={t.groupDetail.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className={styles.monthRow}>
        <button type="button" className={styles.monthArrow} onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <span className={styles.monthLabel}>{monthLabel(month)}</span>
        <button type="button" className={styles.monthArrow} onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.stats}>
        {!isIncome && (
          <div>
            <div className={styles.statLabel}>{t.groupDetail.budget}</div>
            <div className={styles.statValue}>{formatMoneyWhole(assigned, currency)}</div>
            <button
              type="button"
              className={`${styles.statSub} ${styles.statLink}`}
              onClick={() => void navigate('/budget')}
            >
              {t.groupDetail.change}
            </button>
          </div>
        )}
        <div>
          <div className={styles.statLabel}>{isIncome ? t.groupDetail.income : t.groupDetail.expense}</div>
          <div className={`${styles.statValue} ${styles.statValueHero}`}>{formatMoneyWhole(total, currency)}</div>
          {delta !== null && (
            <div className={`${styles.statSub} ${delta > 0 !== isIncome ? styles.up : styles.down}`}>
              {delta > 0 ? '+' : ''}
              {delta}%
            </div>
          )}
        </div>
        <div>
          <div className={styles.statLabel}>{t.groupDetail.perDay}</div>
          <div className={styles.statValue}>{formatMoneyWhole(daily, currency)}</div>
          {dailyPrev > 0 && (
            <div className={`${styles.statSub} ${daily > dailyPrev !== isIncome ? styles.up : styles.down}`}>
              {daily > dailyPrev ? '+' : ''}
              {formatMoneyWhole(daily - dailyPrev, currency)}
            </div>
          )}
        </div>
      </div>

      <div className={styles.bars} ref={barsRef}>
        {bars.map((bar) => (
          <button
            key={bar.month}
            type="button"
            className={`${styles.bar} ${bar.month === month ? styles.barActive : ''}`}
            data-active={bar.month === month}
            onClick={() => setMonth(bar.month)}
          >
            <span className={styles.barTrack}>
              <span className={styles.barFill} style={{ height: `${Math.max(4, (bar.amount / maxBar) * 100)}%` }} />
            </span>
            <span className={styles.barLabel}>
              {format(new Date(`${bar.month}-01T00:00:00`), 'LLL', { locale: getDateFnsLocale() })}
            </span>
          </button>
        ))}
      </div>

      {slices.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>{t.groupDetail.subcategories}</h2>
          {slices.map((slice) => (
            <div key={slice.category.id} className={styles.subRow}>
              <div className={styles.subBody}>
                <div className={styles.subName}>
                  {slice.category.name} {Math.round(slice.share * 100)}%
                </div>
                <ProgressBar className={styles.subTrack} value={slice.share} color={slice.category.color} />
              </div>
              <span className={styles.subAmount}>{formatMoney(slice.amount, currency)}</span>
            </div>
          ))}
        </>
      )}

      <h2 className={styles.sectionTitle}>{t.groupDetail.operations}</h2>
      {days.length === 0 ? (
        <div className={styles.empty}>{t.groupDetail.empty}</div>
      ) : (
        days.map((day) => (
          <div key={day.date}>
            <div className={styles.dayLabel}>
              <span>{day.label}</span>
              <span>
                {formatMoney(
                  day.items.reduce((sum, tx) => sum + tx.amount, 0),
                  currency,
                )}
              </span>
            </div>
            <div className={styles.dayGroup}>
              {day.items.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  showAccount
                  onClick={() => void navigate(`/transactions/${tx.id}`)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <button
        type="button"
        className={`${styles.fab} ${isIncome ? styles.fabIncome : ''}`}
        onClick={addTransaction}
        aria-label={t.groupDetail.addAria}
      >
        {isIncome ? <Plus size={24} aria-hidden="true" /> : <Minus size={24} aria-hidden="true" />}
      </button>

      <GroupEditSheet open={editOpen} group={group} onClose={() => setEditOpen(false)} />
    </div>
  );
}
