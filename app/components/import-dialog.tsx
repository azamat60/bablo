"use client";
import type { Dispatch, SetStateAction, RefObject, ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sparkles,
  Camera,
  Square,
  Mic,
  FileUp,
  X,
  ShieldCheck,
  LoaderCircle,
  Check,
} from "lucide-react";
import { MAX_AI_TEXT } from "@/lib/import-input";
import type { Review } from "@/lib/import-review";
import type { Budget, Transaction } from "@/lib/budget";
import type { RecordingState } from "@/lib/microphone";
import { Picker } from "./budget-forms";
type Props = {
  modal: string;
  saving: boolean;
  cancelImport: () => void;
  review: Review[];
  recovery: ReactNode;
  text: string;
  setText: (text: string) => void;
  recognizing: boolean;
  photoInput: RefObject<HTMLInputElement | null>;
  fileInput: RefObject<HTMLInputElement | null>;
  record: () => Promise<void>;
  recording: boolean;
  recordingState: RecordingState;
  seconds: number;
  file: File | null;
  setFile: (file: File | null) => void;
  aiReady: boolean;
  demo: boolean;
  recognize: () => Promise<void>;
  setReview: Dispatch<SetStateAction<Review[]>>;
  budget: Budget;
  updateReview: (id: string, patch: Partial<Review>) => void;
  confirmImport: () => Promise<void>;
  warnings: string[];
};
export function ImportDialog({
  modal,
  saving,
  cancelImport,
  review,
  recovery,
  text,
  setText,
  recognizing,
  photoInput,
  fileInput,
  record,
  recording,
  recordingState,
  seconds,
  file,
  setFile,
  aiReady,
  demo,
  recognize,
  setReview,
  budget,
  updateReview,
  confirmImport,
  warnings,
}: Props) {
  return (
    <Dialog
      open={modal === "import"}
      onOpenChange={(o) => {
        if (!o && !saving) cancelImport();
      }}
    >
      <DialogContent
        className={"app-dialog " + (review.length ? "review-dialog" : "")}
      >
        {recovery}
        <DialogHeader>
          <DialogTitle>
            <span className="title-icon">
              <Sparkles size={21} />{" "}
              {review.length
                ? "Проверьте операции"
                : "Пусть AI заполнит за вас"}
            </span>
          </DialogTitle>
          <DialogDescription>
            {review.length
              ? "Исправьте детали и выберите операции для добавления. Ничего ещё не сохранено."
              : "Текст, чек, голос или выписка — превратим их в понятные операции."}
          </DialogDescription>
        </DialogHeader>
        {!review.length ? (
          <>
            <textarea
              className="import-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_AI_TEXT}
              disabled={recognizing}
              placeholder="Вчера потратил 450 сом на обед и 230 на такси"
              aria-label="Текст для распознавания"
            />
            <div className="input-methods">
              <button
                disabled={recognizing}
                onClick={() => photoInput.current?.click()}
              >
                <Camera />
                Фото
              </button>
              <button
                disabled={
                  recognizing ||
                  recordingState === "requesting" ||
                  recordingState === "stopping"
                }
                onClick={record}
              >
                {recording ? <Square /> : <Mic />}
                {recordingState === "requesting"
                  ? "Разрешение…"
                  : recordingState === "stopping"
                    ? "Останавливаем…"
                    : recording
                      ? `${seconds} с · стоп`
                      : "Голос"}
              </button>
              <button
                disabled={recognizing}
                onClick={() => fileInput.current?.click()}
              >
                <FileUp />
                Файл
              </button>
            </div>
            {file && (
              <div className="file-pill">
                <FileUp size={17} />
                <span>
                  {file.name}
                  <small>{(file.size / 1024).toFixed(0)} КБ</small>
                </span>
                <button
                  aria-label="Убрать файл"
                  disabled={recognizing}
                  onClick={() => setFile(null)}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <p className="muted">
              PDF, Excel, CSV, JPG, PNG, WebP или аудио · до 10 МБ. До 300
              операций за один импорт. Текст — до 20 000 символов (
              {text.length.toLocaleString("ru-RU")}).
            </p>
            <div className="privacy-note">
              <ShieldCheck size={18} />
              <span>
                Нажимая «Распознать», вы отправляете выбранный файл и текст в
                OpenAI. Оригинал файла в приложении не сохраняется.
              </span>
            </div>
            {!aiReady && (
              <div className="notice compact">
                {demo
                  ? "Для распознавания войдите через Google."
                  : "Распознавание временно недоступно. Ручной ввод работает."}
              </div>
            )}
            <button
              className="primary full"
              disabled={
                recognizing ||
                recording ||
                demo ||
                !aiReady ||
                (!text.trim() && !file)
              }
              onClick={recognize}
            >
              {recognizing ? (
                <>
                  <LoaderCircle className="spin" size={18} />
                  Распознаём…
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Распознать
                </>
              )}
            </button>
          </>
        ) : (
          <>
            <div className="review-summary">
              <span>
                {review.length} найдено ·{" "}
                {review.filter((r) => r.selected).length} выбрано
              </span>
              <button
                className="text-button"
                disabled={saving}
                onClick={() => setReview([])}
              >
                Назад
              </button>
            </div>
            <div className="review-list">
              {review.map((r) => (
                <div
                  className={"review-item " + (!r.selected ? "unselected" : "")}
                  key={r.id}
                >
                  <div className="review-item-head">
                    <Checkbox
                      checked={r.selected}
                      disabled={r.currency !== "KGS" || saving}
                      aria-label={`Добавить ${r.name}`}
                      onCheckedChange={(v) =>
                        updateReview(r.id, { selected: v === true })
                      }
                    />
                    <input
                      aria-label="Описание операции"
                      value={r.name}
                      maxLength={120}
                      onChange={(e) =>
                        updateReview(r.id, { name: e.target.value })
                      }
                    />
                    <span>{r.currency}</span>
                  </div>
                  <div className="form-two">
                    <label>
                      Сумма
                      <input
                        aria-label="Сумма операции"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={r.amount / 100 || ""}
                        onChange={(e) =>
                          updateReview(r.id, {
                            amount: Math.round(Number(e.target.value) * 100),
                          })
                        }
                      />
                    </label>
                    <label>
                      Дата
                      <input
                        aria-label="Дата операции"
                        type="date"
                        value={r.date}
                        onChange={(e) =>
                          updateReview(r.id, { date: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="review-pickers">
                    <Picker
                      label="Тип"
                      value={r.type}
                      onChange={(v) =>
                        updateReview(r.id, { type: v as Transaction["type"] })
                      }
                      items={[
                        { id: "expense", name: "Расход" },
                        { id: "income", name: "Доход" },
                      ]}
                    />
                    <Picker
                      label="Категория"
                      value={r.category}
                      onChange={(v) => updateReview(r.id, { category: v })}
                      items={budget.categories}
                    />
                    <Picker
                      label="Кошелёк"
                      value={r.wallet}
                      onChange={(v) => updateReview(r.id, { wallet: v })}
                      items={budget.wallets}
                    />
                  </div>
                  {r.currency !== "KGS" ? (
                    <p className="review-warning">
                      Валюта {r.currency} не поддерживается. Операция исключена:
                      кошельки в KGS.
                    </p>
                  ) : r.duplicate ? (
                    <p className="review-warning">
                      Возможный дубликат. Отметьте, только если это отдельная
                      операция.
                    </p>
                  ) : r.confidence === "low" ? (
                    <p className="review-warning">
                      Нужна ваша проверка. {r.note}
                    </p>
                  ) : r.note ? (
                    <p className="muted">{r.note}</p>
                  ) : null}
                </div>
              ))}
            </div>
            <button
              className="primary full"
              disabled={saving || !review.some((r) => r.selected)}
              onClick={confirmImport}
            >
              {saving ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Check size={18} />
              )}
              Добавить выбранные · {review.filter((r) => r.selected).length}
            </button>
          </>
        )}
        {warnings.map((w, i) => (
          <p className="review-warning" key={i}>
            {w}
          </p>
        ))}
      </DialogContent>
    </Dialog>
  );
}
