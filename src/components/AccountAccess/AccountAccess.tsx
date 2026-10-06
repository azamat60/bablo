import { useEffect, useState, type ReactNode } from 'react';
import { liveQuery } from 'dexie';
import { currentIdentity, profileLifetime, signIn, signOut, supabase, type Identity } from '@/lib/auth';
import { CloudSync, type CloudView } from '@/lib/cloudSync';
import { cloudAdapter } from '@/db/cloud';
import type { LedgerRow } from '../../../shared/ledger';
import styles from './AccountAccess.module.css';
export function AccountAccess({
  user,
  local,
  error,
  children,
}: {
  user: Identity | null;
  local: boolean;
  error: string;
  children: ReactNode;
}) {
  const [problem, setProblem] = useState(error),
    [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if ((session?.user.id ?? null) !== (user?.id ?? null)) {
        profileLifetime.abort();
        setChanging(true);
        sessionStorage.removeItem('bablo.local');
        location.replace('/');
      }
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, [user?.id]);
  const login = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signIn();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Вход не удался.');
      setBusy(false);
    }
  };
  if (changing) return <main className={styles.login}>Смена аккаунта…</main>;
  if (user) return <CloudAccess>{children}</CloudAccess>;
  if (local) return children;
  return (
    <main className={styles.login}>
      <h1>bablo</h1>
      <p>Личный бюджет под контролем</p>
      <button type="button" disabled={busy || !supabase} onClick={() => void login()}>
        Войти через Google
      </button>
      <p>Первый вход создаёт собственный пустой бюджет.</p>
      {problem && <p role="alert">{problem}</p>}
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem('bablo.local', 'true');
          location.replace('/');
        }}
      >
        Открыть локальный бюджет
      </button>
      <p>Локальные данные остаются на этом устройстве.</p>
      <a href="/privacy.html">Конфиденциальность</a>
    </main>
  );
}
function description(row?: LedgerRow) {
  if (!row) return 'Удалено';
  return (
    [
      row.name,
      row.memo,
      row.date,
      typeof row.amount === 'number'
        ? `${row.amount / 100} ${typeof row.currency === 'string' ? row.currency : ''}`
        : undefined,
      typeof row.openingBalance === 'number' ? `Баланс: ${row.openingBalance / 100}` : undefined,
    ]
      .filter(Boolean)
      .join(' · ') || 'Изменённая запись'
  );
}
function CloudAccess({ children }: { children: ReactNode }) {
  const [view, setView] = useState<CloudView>({ ready: false, status: 'loading', error: '', conflicts: [] });
  const [sync, setSync] = useState<CloudSync | null>(null);
  useEffect(() => {
    const controller = new CloudSync(cloudAdapter, setView);
    const query = liveQuery(cloudAdapter.read).subscribe(() => controller.changed());
    queueMicrotask(() => setSync(controller));
    void controller.start();
    return () => {
      query.unsubscribe();
      controller.dispose();
    };
  }, []);
  if (!view.ready)
    return (
      <main className={styles.login}>
        <p>{view.error || 'Загружаем бюджет…'}</p>
        {view.status === 'error' && (
          <button type="button" onClick={() => void sync?.retry()}>
            Повторить загрузку
          </button>
        )}
        <button type="button" onClick={() => void signOut()}>
          Выйти
        </button>
      </main>
    );
  return (
    <>
      {children}
      {view.status !== 'saved' && (
        <section className={styles.notice} aria-live="polite">
          <span>
            {view.status === 'saving'
              ? 'Сохраняем…'
              : view.status === 'conflict'
                ? 'Одна запись изменена в двух окнах. Сравните изменения.'
                : view.error}
          </span>
          {view.status === 'error' && (
            <>
              <p>Черновик сохранён на устройстве.</p>
              <button type="button" onClick={() => void sync?.retry()}>
                Повторить
              </button>
            </>
          )}
          {view.status === 'conflict' && (
            <>
              {view.error && <p role="alert">{view.error}</p>}
              {view.conflicts.slice(0, 20).map((row) => (
                <div key={`${row.table}:${row.id}`}>
                  <p>На устройстве: {description(row.local)}</p>
                  <p>В облаке: {description(row.remote)}</p>
                </div>
              ))}
              <button type="button" onClick={() => void sync?.resolve(true)}>
                Сохранить мои изменения
              </button>
              <button type="button" onClick={() => void sync?.resolve(false)}>
                Принять облачную версию
              </button>
            </>
          )}
        </section>
      )}
    </>
  );
}
export function AccountControls() {
  const user = currentIdentity();
  return (
    <section className={styles.account}>
      <p>{user?.email || 'Локальный бюджет'}</p>
      {user ? (
        <button type="button" onClick={() => void signOut()}>
          Выйти
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            profileLifetime.abort();
            sessionStorage.removeItem('bablo.local');
            location.replace('/');
          }}
        >
          Войти через Google
        </button>
      )}
    </section>
  );
}
