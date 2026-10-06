import { createClient } from '@supabase/supabase-js';
export type Identity = { id: string; email: string };
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: { flowType: 'pkce', storageKey: 'bablo.auth', detectSessionInUrl: true },
        global: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(init?.signal ? [init.signal] : [])]),
            }),
        },
      })
    : null;
export const profileLifetime = new AbortController();
let identity: Identity | null = null;
export const currentIdentity = () => identity;
export async function initializeAuth() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) return null;
  const verified = await supabase.auth.getClaims();
  if (verified.error || !verified.data?.claims.sub) throw new Error('Сессия истекла. Войдите снова.');
  identity = { id: verified.data.claims.sub, email: String(verified.data.claims.email ?? '') };
  return identity;
}
export async function signIn() {
  if (!supabase) throw new Error('Google-вход пока не настроен.');
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${location.origin}/auth/callback`,
      skipBrowserRedirect: true,
      scopes: 'openid email profile',
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Не удалось начать Google-вход. Повторите попытку.');
  if (installed && window.open(data.url, '_self')) return;
  location.assign(data.url);
}
export async function signOut() {
  profileLifetime.abort();
  sessionStorage.removeItem('bablo.local');
  sessionStorage.removeItem('bablo.profile');
  try {
    await supabase?.auth.signOut({ scope: 'local' });
  } finally {
    localStorage.removeItem('bablo.auth');
    location.replace('/');
  }
}
export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}, timeout = 15_000) {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (session?.data.session?.user.id !== identity?.id) {
    profileLifetime.abort();
    throw new Error('Аккаунт изменён. Войдите снова.');
  }
  if (!token) throw new Error('Для облачного бюджета и AI войдите через Google.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(input, {
    ...init,
    headers,
    cache: 'no-store',
    signal: AbortSignal.any([
      profileLifetime.signal,
      AbortSignal.timeout(timeout),
      ...(init.signal ? [init.signal] : []),
    ]),
  });
  if (response.status === 401) {
    profileLifetime.abort();
    void signOut();
  }
  return response;
}
