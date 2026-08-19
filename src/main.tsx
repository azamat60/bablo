import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { ensureSeeded } from '@/db/seed';
import { router } from '@/router';
import '@/styles/tokens.css';

registerSW({ immediate: true });

await ensureSeeded();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
