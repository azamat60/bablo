"use client";
import { type FormEvent, type ReactNode, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Check, LoaderCircle, Trash2 } from "lucide-react";
import {
  balance,
  money,
  today,
  type Budget,
  type Transaction,
  type Wallet,
} from "@/lib/budget";
export function Picker({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { id: string; name: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="picker">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
type Props = {
  modal: string;
  setModal: (v: string) => void;
  saving: boolean;
  budget: Budget;
  editing: Transaction | null;
  editingWallet: Wallet | null;
  demo: boolean;
  saveTransaction: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  saveWallet: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  commit: (budget: Budget) => Promise<boolean>;
  recovery: ReactNode;
};
export function BudgetForms({
  modal,
  setModal,
  saving,
  budget,
  editing,
  editingWallet,
  demo,
  saveTransaction,
  saveWallet,
  commit,
  recovery,
}: Props) {
  return (
    <>
      {" "}
      <Dialog
        open={modal === "transaction"}
        onOpenChange={(o) => {
          if (!o && !saving) setModal("");
        }}
      >
        <DialogContent className="app-dialog">
          {recovery}
          <DialogHeader>
            <DialogTitle>{editing ? "Операция" : "Новая операция"}</DialogTitle>
            <DialogDescription>
              Сумма, категория и кошелёк — всё, что нужно.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={saveTransaction}
            key={editing?.id || "new"}
            className="form-stack"
          >
            <FormPicker
              name="type"
              label="Тип операции"
              initial={editing?.type || "expense"}
              items={[
                { id: "expense", name: "Расход" },
                { id: "income", name: "Доход" },
              ]}
            />
            <div className="form-two">
              <label>
                Сумма, сом
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="10000000000"
                  required
                  defaultValue={editing ? editing.amount / 100 : ""}
                  placeholder="0"
                  autoFocus
                />
              </label>
              <label>
                Дата
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={editing?.date || today()}
                />
              </label>
            </div>
            <label>
              Описание
              <input
                name="name"
                required
                maxLength={120}
                defaultValue={editing?.name || ""}
                placeholder="Например, продукты в Globus"
              />
            </label>
            <FormPicker
              name="category"
              label="Категория"
              initial={editing?.category || "food"}
              items={budget.categories}
            />
            <FormPicker
              name="wallet"
              label="Кошелёк"
              initial={editing?.wallet || budget.wallets[0]?.id || ""}
              items={budget.wallets}
            />
            <button
              className="primary full"
              disabled={saving || !budget.wallets.length}
              type="submit"
            >
              {saving ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Check size={18} />
              )}
              Сохранить {demo ? "в демо" : ""}
            </button>
            {editing && (
              <DeleteTransaction
                key={editing.id}
                saving={saving}
                onDelete={async () => {
                  if (
                    await commit({
                      ...budget,
                      transactions: budget.transactions.filter(
                        (t) => t.id !== editing.id,
                      ),
                    })
                  )
                    setModal("");
                }}
              />
            )}
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "wallet"}
        onOpenChange={(o) => {
          if (!o && !saving) setModal("");
        }}
      >
        <DialogContent className="app-dialog">
          {recovery}
          <DialogHeader>
            <DialogTitle>
              {editingWallet ? "Настройки кошелька" : "Новый кошелёк"}
            </DialogTitle>
            <DialogDescription>
              Укажите остаток до начала учёта. Операции будут менять его
              автоматически.
            </DialogDescription>
          </DialogHeader>
          <form
            key={editingWallet?.id || "new"}
            onSubmit={saveWallet}
            className="form-stack"
          >
            <label>
              Название
              <input
                name="name"
                required
                maxLength={60}
                defaultValue={editingWallet?.name || ""}
                placeholder="Например, МБанк"
                autoFocus
              />
            </label>
            <label>
              Начальный баланс, сом
              <input
                name="opening"
                type="number"
                step="0.01"
                required
                defaultValue={editingWallet ? editingWallet.opening / 100 : 0}
              />
            </label>
            {editingWallet && (
              <p className="muted">
                Текущий баланс с операциями:{" "}
                {money(balance(budget, editingWallet.id))} сом
              </p>
            )}
            <button type="submit" className="primary full" disabled={saving}>
              {saving ? "Сохраняем…" : "Сохранить кошелёк"}
            </button>
            {editingWallet &&
              !budget.transactions.some(
                (t) => t.wallet === editingWallet.id,
              ) && (
                <button
                  className="danger-button"
                  type="button"
                  onClick={async () => {
                    if (
                      await commit({
                        ...budget,
                        wallets: budget.wallets.filter(
                          (w) => w.id !== editingWallet.id,
                        ),
                      })
                    )
                      setModal("");
                  }}
                >
                  Удалить пустой кошелёк
                </button>
              )}
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "categories"}
        onOpenChange={(o) => {
          if (!o && !saving) setModal("");
        }}
      >
        <DialogContent className="app-dialog">
          {recovery}
          <DialogHeader>
            <DialogTitle>Категории и лимиты</DialogTitle>
            <DialogDescription>
              Месячный лимит в сомах. Ноль — без ограничения.
            </DialogDescription>
          </DialogHeader>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const categories = budget.categories.map((c) => ({
                ...c,
                limit: Math.round(Number(f.get(c.id)) * 100),
              }));
              const name = String(f.get("newName") || "").trim();
              if (name)
                categories.push({
                  id: crypto.randomUUID(),
                  name,
                  color: "#95bdc9",
                  limit: Math.round(Number(f.get("newLimit") || 0) * 100),
                });
              if (await commit({ ...budget, categories })) setModal("");
            }}
          >
            <div className="category-settings">
              {budget.categories.map((c) => (
                <label className="category-limit-input" key={c.id}>
                  <span>
                    <i style={{ background: c.color }} />
                    {c.name}
                  </span>
                  <input
                    name={c.id}
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={c.limit / 100}
                    required
                    aria-label={`Лимит: ${c.name}`}
                  />
                </label>
              ))}
            </div>
            <div className="form-two">
              <label>
                Новая категория
                <input
                  name="newName"
                  maxLength={50}
                  placeholder="Например, питомцы"
                />
              </label>
              <label>
                Лимит, сом
                <input
                  name="newLimit"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                />
              </label>
            </div>
            <button type="submit" className="primary full" disabled={saving}>
              Сохранить
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormPicker({
  name,
  label,
  initial,
  items,
}: {
  name: string;
  label: string;
  initial: string;
  items: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <label>
      {label}
      <input type="hidden" name={name} value={value} />
      <Picker label={label} value={value} onChange={setValue} items={items} />
    </label>
  );
}

function DeleteTransaction({
  saving,
  onDelete,
}: {
  saving: boolean;
  onDelete: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <button
        className="danger-button"
        type="button"
        disabled={saving}
        onClick={() => setConfirming(true)}
      >
        <Trash2 size={15} />
        Удалить операцию
      </button>
    );
  return (
    <div role="alert" className="delete-confirmation">
      <p>Удалить операцию? Восстановить её через приложение нельзя.</p>
      <button
        type="button"
        className="danger-button"
        disabled={saving}
        onClick={onDelete}
      >
        Да, удалить
      </button>
      <button
        type="button"
        className="text-button"
        disabled={saving}
        onClick={() => setConfirming(false)}
      >
        Отмена
      </button>
    </div>
  );
}
