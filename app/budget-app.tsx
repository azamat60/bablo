"use client";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Wallet as WalletIcon,
  LayoutGrid,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Sparkles,
  Settings,
  ChevronLeft,
  ChevronRight,
  Camera,
  Mic,
  FileUp,
  ArrowUp,
  ShoppingBasket,
  Coffee,
  Car,
  ShieldCheck,
  Search,
  Download,
  Square,
  ShoppingBag,
  House,
  Heart,
  Ellipsis,
  Briefcase,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster, toast } from "sonner";
import {
  balance,
  money,
  today,
  demoBudget,
  budgetSchema,
  transactionSchema,
  type Budget,
  type Transaction,
  type Wallet,
} from "@/lib/budget";
import { describeChanges } from "@/lib/budget-sync";
import { useBudget } from "@/hooks/use-budget";
import { checkDuplicates, editReview, type Review } from "@/lib/import-review";
import { AI_TIMEOUT, requestJSON } from "@/lib/request";
import { FILE_ACCEPT, MAX_AI_TEXT, fileError } from "@/lib/import-input";
import { Microphone, type RecordingState } from "@/lib/microphone";
import { BudgetForms, Picker } from "./components/budget-forms";
import { ImportDialog } from "./components/import-dialog";
import { Analytics, CategoryPanel } from "./components/analytics";
const nav = [
  { name: "Обзор", icon: LayoutGrid },
  { name: "Операции", icon: ArrowLeftRight },
  { name: "Кошельки", icon: WalletIcon },
  { name: "Аналитика", icon: ChartNoAxesCombined },
];
const icons: Record<string, typeof WalletIcon> = {
  food: ShoppingBasket,
  cafe: Coffee,
  transport: Car,
  shopping: ShoppingBag,
  home: House,
  health: Heart,
  other: Ellipsis,
  salary: Briefcase,
};

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function BudgetApp({
  account,
  demoMode,
  onExit,
  onStart,
}: {
  account: { id: string; email: string } | null;
  demoMode: boolean;
  onExit: () => void;
  onStart: () => void;
}) {
  const session = useBudget(account?.id || "", !demoMode);
  useEffect(() => {
    if (session.authExpired) onExit();
  }, [session.authExpired, onExit]);
  const [demoState, setDemoState] = useState<Budget>(demoBudget);
  const budget = demoMode ? demoState : session.state;
  const demo = demoMode,
    ready = demoMode || session.ready,
    saving = session.saving;
  const aiReady = !demoMode && session.aiReady,
    loadError = session.error;
  const load = useCallback(() => session.sync.load(), [session.sync]);
  const [view, setView] = useState("Обзор"),
    [online, setOnline] = useState(true),
    [month, setMonth] = useState(today().slice(0, 7));
  const [modal, setModal] = useState(""),
    [editing, setEditing] = useState<Transaction | null>(null),
    [editingWallet, setEditingWallet] = useState<Wallet | null>(null),
    [walletFilter, setWalletFilter] = useState("all"),
    [categoryFilter, setCategoryFilter] = useState("all"),
    [typeFilter, setTypeFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [recognizing, setRecognizing] = useState(false),
    [review, setReview] = useState<Review[]>([]),
    [warnings, setWarnings] = useState<string[]>([]),
    [recordingState, setRecordingState] = useState<RecordingState>("idle"),
    [seconds, setSeconds] = useState(0),
    [install, setInstall] = useState<InstallEvent | null>(null);
  const microphone = useRef<Microphone | null>(null),
    recognition = useRef<AbortController | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    photoInput = useRef<HTMLInputElement>(null);
  const recording = recordingState !== "idle";
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    const installHandler = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    queueMicrotask(on);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    window.addEventListener("beforeinstallprompt", installHandler);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
      window.removeEventListener("beforeinstallprompt", installHandler);
      recognition.current?.abort();
      microphone.current?.cancel();
    };
  }, []);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (t: unknown, o: unknown) => Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: "start_expense_entry",
          title: "Открыть ввод расхода",
          description: "Открывает ручной ввод расхода. Ничего не сохраняет.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute: (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).length
            )
              throw Error("Expected empty object");
            setEditing(null);
            setModal("transaction");
            return { status: "entry_opened" };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, []);
  async function commit(next: Budget) {
    if (!demo && !ready) {
      toast.error("Сначала дождитесь загрузки бюджета.");
      return false;
    }
    const valid = budgetSchema.safeParse(next);
    if (!valid.success) {
      toast.error(valid.error.issues[0].message);
      return false;
    }
    if (demo) {
      setDemoState(valid.data);
      toast.success("Изменено в демо");
      return true;
    }
    const success = await session.sync.commit(valid.data);
    if (success) toast.success("Сохранено");
    return success;
  }
  function start() {
    onStart();
  }
  function newTransaction() {
    if (!ready) {
      toast.error("Сначала дождитесь загрузки бюджета.");
      return;
    }
    setEditing(null);
    if (!budget.wallets.length) {
      setEditingWallet(null);
      setModal("wallet");
      toast("Сначала добавьте кошелёк");
    } else setModal("transaction");
  }
  function changeMonth(step: number) {
    const d = new Date(month + "-01T12:00:00");
    d.setMonth(d.getMonth() + step);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const monthly = budget.transactions.filter((t) => t.date.startsWith(month));
  const expense = monthly
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0),
    income = monthly
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);
  const categoryTotals = budget.categories
    .map((c) => ({
      ...c,
      total: monthly
        .filter((t) => t.type === "expense" && t.category === c.id)
        .reduce((s, t) => s + t.amount, 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const gradient = categoryTotals
    .reduce<{ parts: string[]; start: number }>(
      (result, c) => {
        const end = result.start + (c.total / expense) * 100;
        return {
          start: end,
          parts: [
            ...result.parts,
            `${c.color} ${result.start}% ${Math.max(result.start, end - 1)}%, #fff ${Math.max(result.start, end - 1)}% ${end}%`,
          ],
        };
      },
      { parts: [], start: 0 },
    )
    .parts.join(",");
  const filtered = monthly
    .filter(
      (t) =>
        (walletFilter === "all" || t.wallet === walletFilter) &&
        (categoryFilter === "all" || t.category === categoryFilter) &&
        (typeFilter === "all" || t.type === typeFilter) &&
        t.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  function exportCSV() {
    const rows = [
      ["Дата", "Описание", "Тип", "Сумма", "Валюта", "Категория", "Кошелёк"],
      ...filtered.map((t) => [
        t.date,
        t.name,
        t.type === "expense" ? "Расход" : "Доход",
        (t.amount / 100).toFixed(2),
        "KGS",
        budget.categories.find((c) => c.id === t.category)?.name || "",
        budget.wallets.find((w) => w.id === t.wallet)?.name || "",
      ]),
    ];
    const csv =
      "\ufeff" +
      rows
        .map((r) =>
          r
            .map(
              (s) =>
                '"' +
                String(s)
                  .replace(/^[=+@-]/, "'" + "$&")
                  .replaceAll('"', '""') +
                '"',
            )
            .join(";"),
        )
        .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    a.download = `bablo-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function chooseFile(f?: File) {
    if (!f) return;
    if (fileError(f)) {
      toast.error(fileError(f));
      return;
    }
    microphone.current?.cancel();
    setFile(f);
    setReview([]);
    setWarnings([]);
    setModal("import");
  }
  function openAI() {
    setReview([]);
    setWarnings([]);
    setModal("import");
  }
  async function recognize() {
    if (recognition.current || demo || !aiReady) return;
    if (text.length > MAX_AI_TEXT) {
      toast.error("Текст — максимум 20 000 символов.");
      return;
    }
    if (!text.trim() && !file) {
      toast.error("Добавьте текст, фото, голос или выписку.");
      return;
    }
    if (!budget.wallets.length) {
      toast.error("Добавьте кошелёк перед распознаванием.");
      return;
    }
    const controller = new AbortController();
    recognition.current = controller;
    setRecognizing(true);
    try {
      const form = new FormData();
      form.set("text", text);
      form.set("date", today());
      form.set(
        "categories",
        JSON.stringify(budget.categories.map(({ id, name }) => ({ id, name }))),
      );
      if (file) form.set("file", file);
      const data = await requestJSON<{
        error?: string;
        transactions: {
          name: string;
          amount: number;
          date: string;
          category: string;
          type: "expense" | "income";
          confidence: string;
          note: string;
          currency: string;
        }[];
        warnings: string[];
      }>(
        "/api/recognize",
        { method: "POST", body: form, signal: controller.signal },
        AI_TIMEOUT,
      );
      if (controller.signal.aborted) return;

      const rows: Review[] = data.transactions.map(
        (r: {
          name: string;
          amount: number;
          date: string;
          category: string;
          type: "expense" | "income";
          confidence: string;
          note: string;
          currency: string;
        }) => {
          const t = {
            id: crypto.randomUUID(),
            name: r.name,
            amount: Math.round(r.amount * 100),
            date: r.date,
            category: budget.categories.some((c) => c.id === r.category)
              ? r.category
              : "other",
            type: r.type,
            wallet: budget.wallets[0].id,
            source: (file ? "import" : "ai") as "import" | "ai",
          };

          return {
            ...t,
            confidence: r.confidence,
            note: r.note,
            currency: r.currency,
            duplicate: false,
            selected: r.currency === "KGS" && r.confidence === "high",
          };
        },
      );
      setReview(checkDuplicates(rows, budget.transactions));
      setWarnings([
        ...data.warnings,
        ...(file && /\.(xls|xlsx|csv)$/i.test(file.name)
          ? [
              "Сверьте число строк с выпиской. За один раз импортируйте не более 300 операций; OpenAI читает только первые 1 000 строк каждого листа.",
            ]
          : []),
      ]);
      if (!rows.length)
        toast("Операции не найдены. Проверьте документ и предупреждения.");
    } catch (e) {
      if (!controller.signal.aborted)
        toast.error(
          (e as Error).name === "TimeoutError"
            ? "Распознавание заняло слишком долго. Попробуйте меньший файл."
            : (e as Error).message,
        );
    } finally {
      if (recognition.current === controller) {
        recognition.current = null;
        setRecognizing(false);
      }
    }
  }
  function updateReview(id: string, patch: Partial<Review>) {
    setReview((old) => editReview(old, id, patch, budget.transactions));
  }
  async function confirmImport() {
    const checked = checkDuplicates(review, budget.transactions);
    setReview(checked);
    if (checked.some((r, i) => review[i].selected && !r.selected)) {
      toast.error(
        "Найдены новые дубли. Проверьте выделение и подтвердите отдельные операции.",
      );
      return;
    }
    const selected = checked.filter((r) => r.selected);
    if (!selected.length) return;
    for (const r of selected) {
      if (r.currency !== "KGS") {
        toast.error("Импортируйте только суммы в сомах.");
        return;
      }
      const result = transactionSchema.safeParse(r);
      if (!result.success) {
        toast.error("Проверьте даты, названия и положительные суммы.");
        return;
      }
    }
    if (
      await commit({
        ...budget,
        transactions: [
          ...budget.transactions,
          ...selected.map((r) => transactionSchema.parse(r)),
        ],
      })
    ) {
      setModal("");
      setReview([]);
      setText("");
      setFile(null);
      setView("Операции");
      setMonth(selected[0].date.slice(0, 7));
    }
  }
  function cancelImport() {
    recognition.current?.abort();
    recognition.current = null;
    microphone.current?.cancel();
    setRecognizing(false);
    setModal("");
  }
  async function record() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error("Запись недоступна. Загрузите аудиофайл.");
      return;
    }
    setModal("import");
    microphone.current ??= new Microphone(
      {
        getUserMedia: () =>
          navigator.mediaDevices.getUserMedia({ audio: true }),
        recorder: (stream) => {
          const mime = ["audio/webm", "audio/mp4"].find((type) =>
            MediaRecorder.isTypeSupported(type),
          );
          return new MediaRecorder(
            stream,
            mime ? { mimeType: mime } : undefined,
          );
        },
        file: (chunks, mime) =>
          new File(chunks, `voice.${mime.includes("mp4") ? "m4a" : "webm"}`, {
            type: mime,
          }),
      },
      (state, seconds) => {
        setRecordingState(state);
        setSeconds(seconds);
      },
      chooseFile,
    );
    try {
      await microphone.current.toggle();
    } catch {
      toast.error(
        "Нет доступа к микрофону. Разрешите его в настройках браузера.",
      );
    }
  }
  async function saveTransaction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const t = {
      id: editing?.id || crypto.randomUUID(),
      name: String(f.get("name")),
      amount: Math.round(Number(f.get("amount")) * 100),
      type: f.get("type"),
      date: f.get("date"),
      category: f.get("category"),
      wallet: f.get("wallet"),
      source: editing?.source || "manual",
    };
    const valid = transactionSchema.safeParse(t);
    if (!valid.success) {
      toast.error("Проверьте сумму, дату и описание.");
      return;
    }
    const transactions = editing
      ? budget.transactions.map((x) => (x.id === editing.id ? valid.data : x))
      : [...budget.transactions, valid.data];
    if (await commit({ ...budget, transactions })) {
      setModal("");
      setMonth(valid.data.date.slice(0, 7));
    }
  }
  async function saveWallet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const w: Wallet = {
      id: editingWallet?.id || crypto.randomUUID(),
      name: String(f.get("name")).trim(),
      opening: Math.round(Number(f.get("opening")) * 100),
      color: (editingWallet?.color ||
        ["mint", "peach", "violet"][
          budget.wallets.length % 3
        ]) as Wallet["color"],
    };
    if (
      await commit({
        ...budget,
        wallets: editingWallet
          ? budget.wallets.map((x) => (x.id === w.id ? w : x))
          : [...budget.wallets, w],
      })
    )
      setModal("");
  }
  function transactionList(items: Transaction[]) {
    return items.length ? (
      <div>
        {items.map((t, i) => {
          const c = budget.categories.find((c) => c.id === t.category),
            Icon = icons[t.category] || Ellipsis;
          return (
            <div key={t.id}>
              {(i === 0 || items[i - 1].date !== t.date) && (
                <div className="day-label">
                  {t.date === today() ? "СЕГОДНЯ · " : ""}
                  {new Date(t.date + "T12:00:00").toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              )}
              <button
                className="transaction"
                onClick={() => {
                  setEditing(t);
                  setModal("transaction");
                }}
              >
                <span
                  className="transaction-icon"
                  style={{
                    background: (c?.color || "#ccc") + "25",
                    color: c?.color === "#283c30" ? "#667b50" : c?.color,
                  }}
                >
                  <Icon size={20} />
                </span>
                <div>
                  <strong>
                    {t.name}
                    {t.source === "ai" || t.source === "import" ? (
                      <Sparkles size={12} />
                    ) : null}
                  </strong>
                  <small>
                    {c?.name} ·{" "}
                    {budget.wallets.find((w) => w.id === t.wallet)?.name}
                  </small>
                </div>
                <b className={t.type === "income" ? "positive" : ""}>
                  {t.type === "income" ? "+" : "−"} {money(t.amount)}
                  <small> сом</small>
                </b>
              </button>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="empty-state">
        <ArrowLeftRight />
        <h3>
          {budget.transactions.length
            ? "Ничего не найдено по фильтрам"
            : "Здесь будут ваши операции"}
        </h3>
        <p>
          {budget.transactions.length
            ? "Измените месяц или сбросьте фильтры."
            : "Добавьте расход вручную или отправьте чек AI."}
        </p>
        <button className="text-button" onClick={newTransaction}>
          Добавить первую операцию
        </button>
      </div>
    );
  }
  function walletCards() {
    return (
      <div className="wallet-grid">
        {budget.wallets.map((w) => (
          <button
            className="wallet-card"
            key={w.id}
            onClick={() => {
              setEditingWallet(w);
              setModal("wallet");
            }}
          >
            <span className={"wallet-icon " + w.color}>
              <WalletIcon size={18} />
            </span>
            <span>{w.name}</span>
            <strong>
              {money(balance(budget, w.id))} <small>сом</small>
            </strong>
          </button>
        ))}
      </div>
    );
  }
  function categoryPanel() {
    return (
      <CategoryPanel
        {...{ categoryTotals, expense, gradient }}
        onCategory={(id) => {
          setCategoryFilter(id);
          setTypeFilter("expense");
          setWalletFilter("all");
          setSearch("");
          setView("Операции");
        }}
      />
    );
  }
  const recovery =
    !demo && (session.error || session.conflict) ? (
      <div className="notice recovery" role="alert">
        <p>{session.error || session.conflict?.message}</p>
        {session.conflict && (
          <>
            <p>
              {session.conflict.names.length
                ? `В другом окне изменены: ${session.conflict.names.join(", ")}. Повторная запись применит ваш черновик к этим данным.`
                : "Чужие изменения сохранены. Ваш черновик готов к повторной записи."}
            </p>
            <details>
              <summary>Сравнить версии</summary>
              {describeChanges(budget, session.conflict.proposed)
                .slice(0, 20)
                .map((change, index) => (
                  <div className="conflict-change" key={index}>
                    <strong>{change.name}</strong>
                    <p>Сервер: {change.server}</p>
                    <p>Черновик: {change.draft}</p>
                  </div>
                ))}
              <p className="muted">Показаны первые 20 изменённых записей.</p>
            </details>
            <button
              className="primary"
              disabled={saving}
              type="button"
              onClick={async () => {
                if (modal === "import") {
                  const checked = checkDuplicates(review, budget.transactions);
                  if (
                    checked.some(
                      (row, index) => review[index].selected && !row.selected,
                    )
                  ) {
                    setReview(checked);
                    session.sync.discardConflict();
                    toast.error(
                      "После обновления найдены новые дубли. Проверьте выделение.",
                    );
                    return;
                  }
                }
                if (await session.sync.retryConflict()) {
                  setModal("");
                  setReview([]);
                  setText("");
                  setFile(null);
                }
              }}
            >
              Подтвердить и сохранить черновик
            </button>
            <button
              className="text-button"
              disabled={saving}
              onClick={() => {
                session.sync.discardConflict();
                setModal("");
              }}
            >
              Оставить серверную версию
            </button>
          </>
        )}
      </div>
    ) : null;
  return (
    <SidebarProvider>
      <Toaster position="top-center" richColors />
      <Sidebar className="app-sidebar">
        <SidebarHeader>
          <button className="brand" onClick={() => setView("Обзор")}>
            <span className="brand-icon">b</span>bablo
            <span className="brand-dot">.</span>
          </button>
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-label">ЛИЧНЫЕ ФИНАНСЫ</p>
          <SidebarMenu>
            {nav.map((n) => (
              <SidebarMenuItem key={n.name}>
                <SidebarMenuButton
                  isActive={view === n.name}
                  onClick={() => setView(n.name)}
                >
                  <n.icon />
                  <span>{n.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="sidebar-note">
            <Sparkles />
            <strong>
              Меньше рутины.
              <br />
              Больше жизни.
            </strong>
            <p>
              Просто расскажите о расходе.
              <br />
              Остальное разберёт AI.
            </p>
            <button className="text-button" onClick={openAI}>
              Попробовать <ArrowUpRight size={14} />
            </button>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <button className="profile" onClick={() => setModal("settings")}>
            <span className="avatar">Я</span>
            <span>
              {demo ? "Демо" : "Мой бюджет"}
              <small>{account?.email || "Без сохранения"}</small>
            </span>
            <Settings size={18} />
          </button>
        </SidebarFooter>
      </Sidebar>
      <div className="app-main">
        <header className="topbar">
          <span className="desktop-crumb">
            Личное пространство <span className="slash">/</span> <b>{view}</b>
          </span>
          <button className="mobile-brand" onClick={() => setView("Обзор")}>
            bablo<span>.</span>
          </button>
          <span className="privacy">
            <ShieldCheck size={16} /> Только для вас
          </span>
          <button
            className="mobile-settings icon-button"
            aria-label="Настройки"
            onClick={() => setModal("settings")}
          >
            <Settings size={20} />
          </button>
        </header>
        <main className="workspace">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "Обзор"
                  ? "ЛИЧНЫЕ ФИНАНСЫ БЕЗ ЛИШНИХ УСИЛИЙ"
                  : "МОЙ БЮДЖЕТ"}
              </div>
              <h1>
                {view === "Обзор" ? "Деньги под контролем" : view}
                <span>.</span>
              </h1>
              <p>
                {view === "Обзор"
                  ? "Вся картина ваших финансов — в одном месте."
                  : view === "Кошельки"
                    ? "Ваши деньги. На карте, наличными и в накоплениях."
                    : view === "Аналитика"
                      ? "Понимайте свои привычки. Планируйте спокойно."
                      : "Каждый расход и доход на своём месте."}
              </p>
            </div>
            <button
              className="primary"
              aria-label={
                view === "Кошельки" ? "Добавить кошелёк" : "Добавить операцию"
              }
              onClick={
                view === "Кошельки"
                  ? () => {
                      setEditingWallet(null);
                      setModal("wallet");
                    }
                  : newTransaction
              }
            >
              <Plus size={19} />
              {view === "Кошельки" ? "Добавить кошелёк" : "Добавить операцию"}
            </button>
          </div>
          {!online && (
            <div className="notice">
              <WifiOff size={17} /> Нет сети. Для загрузки и сохранения нужно
              подключение.
            </div>
          )}
          {loadError && (
            <div className="notice">
              <span>{loadError}</span>
              {
                <button onClick={load}>
                  <RefreshCw size={16} />
                  Повторить
                </button>
              }
            </div>
          )}
          <div className="period-row">
            <div className="period">
              <button
                aria-label="Предыдущий месяц"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                {new Date(month + "-01T12:00:00")
                  .toLocaleDateString("ru-RU", {
                    month: "long",
                    year: "numeric",
                  })
                  .replace(" г.", "")}
              </span>
              <button
                aria-label="Следующий месяц"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            {demo ? (
              <div className="demo-controls">
                <span className="demo-badge">Демо · данные для примера</span>
                <button
                  className="text-button"
                  disabled={!ready}
                  onClick={start}
                >
                  Начать свой бюджет <ArrowUpRight size={14} />
                </button>
              </div>
            ) : (
              <span className="saved-state">
                {saving
                  ? "Сохраняем…"
                  : ready
                    ? "Личный бюджет"
                    : "Подключаемся…"}{" "}
                <ShieldCheck size={14} />
              </span>
            )}
          </div>
          {view === "Обзор" && (
            <div className="dashboard-grid">
              <section className="left-column">
                <div className="balance-card">
                  <div className="balance-top">
                    Общий баланс <WalletIcon size={19} />
                  </div>
                  <div className="balance-value">
                    {money(balance(budget))}
                    <span> сом</span>
                  </div>
                  <p>На всех ваших кошельках</p>
                  <div className="balance-stats">
                    <div>
                      <span>
                        <ArrowDownLeft />
                        Доходы за месяц
                      </span>
                      <strong>
                        + {money(income)} <small>сом</small>
                      </strong>
                    </div>
                    <div>
                      <span>
                        <ArrowUpRight />
                        Расходы за месяц
                      </span>
                      <strong>
                        − {money(expense)} <small>сом</small>
                      </strong>
                    </div>
                    <div
                      className="mini-chart"
                      title="Расходы по дням текущего месяца"
                    >
                      {Array.from({ length: 12 }, (_, i) => {
                        const v = monthly
                          .filter(
                            (t) =>
                              t.type === "expense" &&
                              Math.floor((Number(t.date.slice(-2)) - 1) / 3) ===
                                i,
                          )
                          .reduce((s, t) => s + t.amount, 0);
                        return (
                          <i
                            key={i}
                            style={{
                              height: `${expense ? Math.max(5, (v / expense) * 100) : 5}%`,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="section-heading">
                  <h2>
                    Мои кошельки <small>{budget.wallets.length}</small>
                  </h2>
                  <button onClick={() => setView("Кошельки")}>
                    Все кошельки <ArrowUpRight size={16} />
                  </button>
                </div>
                {budget.wallets.length ? (
                  walletCards()
                ) : (
                  <button
                    className="add-wallet-empty"
                    onClick={() => {
                      setEditingWallet(null);
                      setModal("wallet");
                    }}
                  >
                    <Plus />
                    Добавить первый кошелёк
                  </button>
                )}
                <div className="panel transactions">
                  <div className="section-heading">
                    <h2>Последние операции</h2>
                    <button
                      onClick={() => {
                        setView("Операции");
                        setCategoryFilter("all");
                      }}
                    >
                      Все операции <ArrowUpRight size={16} />
                    </button>
                  </div>
                  {transactionList(
                    [...monthly]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .slice(0, 5),
                  )}
                </div>
              </section>
              <aside className="right-column">
                <div className="ai-card">
                  <div className="ai-heading">
                    <span className="ai-icon">
                      <Sparkles size={22} />
                    </span>
                    <span>
                      <h2>Запишите за секунду</h2>
                      <small>Вы рассказываете — AI разбирается</small>
                    </span>
                    <span className="ai-badge">AI</span>
                  </div>
                  <div className="composer">
                    <textarea
                      aria-label="Описание расходов для AI"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      maxLength={MAX_AI_TEXT}
                      disabled={recognizing}
                      placeholder="Кофе 250 сом, продукты 1 800…"
                    />
                    <div>
                      <span>Или просто скажите голосом</span>
                      <button
                        className="send"
                        aria-label="Перейти к распознаванию"
                        onClick={openAI}
                      >
                        <ArrowUp size={20} />
                      </button>
                    </div>
                  </div>
                  <div className="input-methods">
                    <button onClick={() => photoInput.current?.click()}>
                      <Camera />
                      Фото чека
                    </button>
                    <button
                      className={recording ? "recording" : ""}
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
                    <button onClick={() => fileInput.current?.click()}>
                      <FileUp />
                      Выписка
                    </button>
                  </div>
                  <p className="ai-caption">
                    <ShieldCheck size={14} /> Перед сохранением всё можно
                    проверить
                  </p>
                </div>
                {categoryPanel()}
              </aside>
            </div>
          )}
          {view === "Операции" && (
            <div className="panel operations-panel">
              <div className="operation-toolbar">
                <Tabs value={typeFilter} onValueChange={setTypeFilter}>
                  <TabsList>
                    <TabsTrigger value="all">Все</TabsTrigger>
                    <TabsTrigger value="expense">Расходы</TabsTrigger>
                    <TabsTrigger value="income">Доходы</TabsTrigger>
                  </TabsList>
                </Tabs>
                <button className="secondary-button" onClick={openAI}>
                  <FileUp size={16} />
                  Импорт
                </button>
                <button
                  className="icon-button"
                  aria-label="Скачать CSV"
                  onClick={exportCSV}
                >
                  <Download size={18} />
                </button>
              </div>
              <div className="filters">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Поиск операций"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Найти операцию"
                  />
                </label>
                <Picker
                  value={walletFilter}
                  onChange={setWalletFilter}
                  label="Кошелёк"
                  items={[
                    { id: "all", name: "Все кошельки" },
                    ...budget.wallets,
                  ]}
                />
                <Picker
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  label="Категория"
                  items={[
                    { id: "all", name: "Все категории" },
                    ...budget.categories,
                  ]}
                />
              </div>
              <div className="list-meta">
                {filtered.length} операций{" "}
                <span>
                  Доходы{" "}
                  {money(
                    filtered
                      .filter((t) => t.type === "income")
                      .reduce((s, t) => s + t.amount, 0),
                  )}{" "}
                  · Расходы{" "}
                  {money(
                    filtered
                      .filter((t) => t.type === "expense")
                      .reduce((s, t) => s + t.amount, 0),
                  )}{" "}
                  сом
                </span>
              </div>
              {transactionList(filtered)}
            </div>
          )}
          {view === "Кошельки" && (
            <>
              <div className="wallet-total">
                <small>На всех кошельках</small>
                <strong>
                  {money(balance(budget))} <span>сом</span>
                </strong>
              </div>
              {walletCards()}
              <button
                className="add-wallet-empty"
                onClick={() => {
                  setEditingWallet(null);
                  setModal("wallet");
                }}
              >
                <Plus />
                Добавить кошелёк
              </button>
              <p className="muted">
                Все кошельки в кыргызских сомах (KGS). Нажмите на кошелёк, чтобы
                изменить название или начальный баланс.
              </p>
            </>
          )}
          {view === "Аналитика" && (
            <Analytics
              {...{ budget, categoryTotals, expense, income }}
              onSettings={() => setModal("categories")}
            >
              {categoryPanel()}
            </Analytics>
          )}
        </main>
        <nav className="mobile-nav" aria-label="Основная навигация">
          {nav.map((n) => (
            <button
              key={n.name}
              aria-current={view === n.name ? "page" : undefined}
              className={view === n.name ? "active" : ""}
              onClick={() => setView(n.name)}
            >
              <n.icon size={21} />
              <span>{n.name}</span>
            </button>
          ))}
        </nav>
      </div>
      <input
        className="sr-only"
        ref={fileInput}
        type="file"
        accept={FILE_ACCEPT}
        tabIndex={-1}
        aria-label="Файл для распознавания"
        onChange={(e) => {
          chooseFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        className="sr-only"
        ref={photoInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        capture="environment"
        tabIndex={-1}
        aria-label="Фото чека"
        onChange={(e) => {
          chooseFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <BudgetForms
        {...{
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
        }}
      />
      <ImportDialog
        {...{
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
        }}
      />
      <Dialog
        open={modal === "settings"}
        onOpenChange={(o) => {
          if (!o) setModal("");
        }}
      >
        <DialogContent className="app-dialog">
          {recovery}
          <DialogHeader>
            <DialogTitle>Ваше пространство</DialogTitle>
            <DialogDescription>
              Настройки приложения и данных.
            </DialogDescription>
          </DialogHeader>
          <div className="settings-row">
            <span>
              <strong>OpenAI</strong>
              <small>
                {aiReady
                  ? "Распознавание доступно"
                  : "Распознавание временно недоступно"}
              </small>
            </span>
            <span className={"status-badge " + (aiReady ? "connected" : "")}>
              {aiReady ? "Подключён" : "Не подключён"}
            </span>
          </div>
          <button
            className="settings-row"
            onClick={() => setModal("categories")}
          >
            <span>
              <strong>Категории и лимиты</strong>
              <small>Настройте бюджет под себя</small>
            </span>
            <ChevronRight size={18} />
          </button>
          <button
            className="settings-row"
            onClick={async () => {
              if (install) {
                await install.prompt();
                if ((await install.userChoice).outcome === "accepted")
                  setInstall(null);
              } else
                toast(
                  "На iPhone: Safari → Поделиться → На экран «Домой». На Android: меню браузера → Установить приложение.",
                );
            }}
          >
            <span>
              <strong>Установить на телефон</strong>
              <small>Открывайте bablo с домашнего экрана</small>
            </span>
            <Download size={18} />
          </button>
          <button className="settings-row" onClick={exportCSV}>
            <span>
              <strong>Скачать операции</strong>
              <small>CSV за выбранный месяц с текущими фильтрами</small>
            </span>
            <Download size={18} />
          </button>
          <button
            className="settings-row"
            disabled={saving || !!session.conflict}
            onClick={load}
          >
            <span>
              <strong>Обновить данные</strong>
              <small>Загрузить последнюю сохранённую версию</small>
            </span>
            <RefreshCw size={18} />
          </button>
          <button className="settings-row" disabled={saving} onClick={onExit}>
            <span>
              <strong>{demo ? "Закрыть демо" : "Выйти"}</strong>
              <small>{account?.email || "Данные демо не сохраняются"}</small>
            </span>
          </button>
          <p className="muted">
            Данные сохраняются в вашем личном пространстве. Для работы с
            бюджетом и AI нужен интернет. Валюта: кыргызский сом (KGS).
          </p>
          {demo && (
            <button className="primary full" disabled={!ready} onClick={start}>
              Начать свой бюджет
            </button>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
