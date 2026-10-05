import { defineConfig } from 'vite';
import { cp, mkdir, writeFile } from 'node:fs/promises';

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: 'api/worker.ts',
    outDir: 'dist/server',
    emptyOutDir: true,
    target: 'es2023',
    rolldownOptions: { output: { entryFileNames: 'index.js' } },
  },
  plugins: [
    {
      name: 'sites-artifact',
      async closeBundle() {
        await mkdir('dist/.openai', { recursive: true });
        await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
        await writeFile(
          'dist/server/wrangler.json',
          JSON.stringify(
            {
              name: 'bablo',
              main: 'index.js',
              compatibility_date: '2026-10-05',
              compatibility_flags: ['nodejs_compat'],
              assets: { directory: '../client', binding: 'ASSETS', run_worker_first: true },
            },
            null,
            2,
          ),
        );
      },
    },
  ],
});
