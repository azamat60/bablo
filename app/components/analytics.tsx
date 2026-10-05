"use client";
import type { ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Settings,
  Sparkles,
  ChartNoAxesCombined,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { money, type Budget } from "@/lib/budget";
type Totals = (Budget["categories"][number] & { total: number })[];
export function CategoryPanel({
  categoryTotals,
  expense,
  gradient,
  onCategory,
}: {
  categoryTotals: Totals;
  expense: number;
  gradient: string;
  onCategory: (id: string) => void;
}) {
  return (
    <div className="panel categories">
      <div className="section-heading">
        <h2>Куда уходят деньги</h2>
        <ChartNoAxesCombined size={18} />
      </div>
      <div className="donut-wrap">
        <div
          className="donut"
          role="img"
          aria-label={`Расходы за месяц: ${money(expense)} сом`}
          style={{
            background: expense ? `conic-gradient(${gradient})` : "#eef1e9",
          }}
        >
          <div>
            <small>Расходы за месяц</small>
            <strong>{money(expense)}</strong>
            <span>сом</span>
          </div>
        </div>
      </div>
      {categoryTotals.length ? (
        categoryTotals.map((c) => (
          <button
            className="category-row"
            key={c.id}
            onClick={() => {
              onCategory(c.id);
            }}
          >
            <i style={{ background: c.color }} />
            <span>{c.name}</span>
            <b>
              {money(c.total)} <small>сом</small>
            </b>
          </button>
        ))
      ) : (
        <p className="muted centered">В этом месяце расходов пока нет.</p>
      )}
    </div>
  );
}
export function Analytics({
  budget,
  categoryTotals,
  expense,
  income,
  onSettings,
  children,
}: {
  budget: Budget;
  categoryTotals: Totals;
  expense: number;
  income: number;
  onSettings: () => void;
  children: ReactNode;
}) {
  return (
    <div className="dashboard-grid analytics-grid">
      <section>
        <div className="summary-grid">
          <div className="panel">
            <ArrowDownLeft size={19} />
            <small>Доходы</small>
            <strong className="positive">
              {money(income)} <span>сом</span>
            </strong>
          </div>
          <div className="panel">
            <ArrowUpRight size={19} />
            <small>Расходы</small>
            <strong>
              {money(expense)} <span>сом</span>
            </strong>
          </div>
        </div>
        <div className="panel budget-limits">
          <div className="section-heading">
            <h2>Бюджеты по категориям</h2>
            <button onClick={() => onSettings()}>
              Настроить <Settings size={15} />
            </button>
          </div>
          {budget.categories
            .filter((c) => c.limit > 0)
            .map((c) => {
              const spent =
                categoryTotals.find((x) => x.id === c.id)?.total || 0;
              const pct = Math.min(100, (spent / c.limit) * 100);
              return (
                <div className="limit-row" key={c.id}>
                  <div>
                    <span>{c.name}</span>
                    <b>
                      {money(spent)} <small>/ {money(c.limit)} сом</small>
                    </b>
                  </div>
                  <Progress
                    value={pct}
                    className={spent > c.limit ? "over-budget" : ""}
                  />
                  <small>
                    {spent > c.limit
                      ? `Превышение на ${money(spent - c.limit)} сом`
                      : `Осталось ${money(c.limit - spent)} сом`}
                  </small>
                </div>
              );
            })}
        </div>
      </section>
      <aside>
        {children}
        <div className="monthly-result">
          <Sparkles size={20} />
          <div>
            <strong>
              {income >= expense
                ? "Доходы покрывают расходы"
                : "Расходы выше доходов"}
            </strong>
            <p>Разница за месяц: {money(income - expense)} сом.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
