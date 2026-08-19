import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { apiDevPlugin } from './plugins/apiDev.ts';

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    plugins: [
      react(),
      apiDevPlugin(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectRegister: false,
        manifest: {
          name: 'Bablo — Wallet & Budget',
          short_name: 'Bablo',
          description: 'Track cash and cards, budget with envelopes, capture expenses with AI.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#fdf6e9',
          theme_color: '#fdf6e9',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'Add expense', url: '/add/expense', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Scan receipt', url: '/add/photo', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Voice entry', url: '/add/voice', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          ],
          share_target: {
            action: '/share-target',
            method: 'POST',
            enctype: 'multipart/form-data',
            params: {
              title: 'title',
              text: 'text',
              files: [{ name: 'photo', accept: ['image/*'] }],
            },
          },
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  };
});
