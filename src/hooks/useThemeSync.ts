import { useEffect } from 'react';
import type { ThemePref } from '@/db/types';

const THEME_COLOR = { light: '#fdf6e9', dark: '#0b0f14' } as const;

export function useThemeSync(theme: ThemePref | undefined): void {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') {
      root.dataset.theme = theme;
      return;
    }
    delete root.dataset.theme;
  }, [theme]);

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;

    if (theme === 'light' || theme === 'dark') {
      meta.setAttribute('content', THEME_COLOR[theme]);
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => meta.setAttribute('content', media.matches ? THEME_COLOR.dark : THEME_COLOR.light);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
