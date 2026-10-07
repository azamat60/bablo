import { configureProfile } from '@/lib/profile';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { initializeAuth } from '@/lib/auth';
import { installPortraitLock } from '@/lib/orientation';
import '@/styles/tokens.css';

registerSW({ immediate: true });
installPortraitLock();

let user: Awaited<ReturnType<typeof initializeAuth>> = null;
let error = '';
try {
  user = await initializeAuth();
} catch (problem) {
  error = problem instanceof Error ? problem.message : 'Вход не удался.';
}
const local = sessionStorage.getItem('bablo.local') === 'true' && !user;
configureProfile(user?.id);
if (location.pathname === '/auth/callback') {
  if (!user && !error) error = 'Вход отменён или ссылка истекла. Попробуйте снова.';
  history.replaceState(null, '', '/');
}
const { ensureSeeded } = await import('@/db/seed');
const { router } = await import('@/router');
const { AccountAccess } = await import('@/components/AccountAccess/AccountAccess');
await ensureSeeded();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccountAccess user={user} local={local} error={error}>
      <RouterProvider router={router} />
    </AccountAccess>
  </StrictMode>,
);
