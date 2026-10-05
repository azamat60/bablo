"use client";
import { useEffect, useState, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import BudgetApp from "./budget-app";
import { BUDGET_TIMEOUT, requestJSON } from "@/lib/request";

type Account = { id: string; email: string };
type AuthState = {
  config: { url: string; key: string } | null;
  user: Account | null;
};
export default function AccountApp() {
  const signedOut = useRef(false);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<Account | null>(null);
  const [demo, setDemo] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let subscription: { unsubscribe: () => void } | undefined;
    void requestJSON<AuthState>(
      "/api/auth",
      { signal: controller.signal },
      BUDGET_TIMEOUT,
    )
      .then((state) => {
        if (controller.signal.aborted) return;
        if (state.config) {
          const supabase = createBrowserClient(
            state.config.url,
            state.config.key,
            {
              global: {
                fetch: (input, init) =>
                  fetch(input, {
                    ...init,
                    signal: AbortSignal.any([
                      AbortSignal.timeout(BUDGET_TIMEOUT),
                      ...(init?.signal ? [init.signal] : []),
                    ]),
                  }),
              },
            },
          );
          setClient(supabase);
          setUser(state.user);
          subscription = supabase.auth.onAuthStateChange((_event, session) => {
            if (signedOut.current && session) return;
            setUser(
              session
                ? { id: session.user.id, email: session.user.email || "" }
                : null,
            );
            if (!session) setDemo(false);
          }).data.subscription;
        }
        if (new URLSearchParams(location.search).has("auth_error"))
          setError("Вход отменён или ссылка истекла. Попробуйте снова.");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Не удалось подключиться. Обновите страницу.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      subscription?.unsubscribe();
    };
  }, []);
  async function signIn() {
    if (!client || busy) return;
    signedOut.current = false;
    setBusy(true);
    setError("");
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/auth/callback`,
          scopes: "openid email profile",
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch {
      setError("Google-вход недоступен. Попробуйте позже.");
      setBusy(false);
    }
  }
  async function signOut() {
    signedOut.current = true;
    setUser(null);
    setDemo(false);
    setBusy(true);
    try {
      const result = await client?.auth.signOut({ scope: "local" });
      if (result?.error) throw result.error;
    } catch {
      setError("Выход не завершён. Повторите выход перед сменой аккаунта.");
    } finally {
      setBusy(false);
    }
  }
  if (demo || user)
    return (
      <BudgetApp
        key={`${user?.id || "guest"}:${demo}`}
        account={user}
        demoMode={demo}
        onExit={demo ? () => setDemo(false) : signOut}
        onStart={() => {
          if (user) setDemo(false);
          else {
            setDemo(false);
            void signIn();
          }
        }}
      />
    );
  return (
    <main className="login-screen">
      <div className="login-card">
        <span className="brand-icon">b</span>
        <h1>
          bablo<span>.</span>
        </h1>
        <p>Личный бюджет в сомах</p>
        <p className="muted">
          Войдите через Google. Первый вход создаст пустой бюджет. Ваши данные
          доступны только вам.
        </p>
        {error && (
          <p role="alert" className="review-warning">
            {error}
          </p>
        )}
        <button
          className="primary full"
          disabled={loading || busy || !client}
          onClick={signIn}
        >
          {loading
            ? "Подключаемся…"
            : busy
              ? "Открываем Google…"
              : "Войти через Google"}
        </button>
        {!loading && !client && (
          <p className="muted">
            Вход временно недоступен. Демо можно открыть сейчас.
          </p>
        )}
        <button
          className="text-button"
          disabled={busy}
          onClick={() => setDemo(true)}
        >
          Посмотреть демо
        </button>
        {error.includes("Выход") && (
          <button className="text-button" onClick={signOut}>
            Повторить выход
          </button>
        )}
      </div>
    </main>
  );
}
