import type { ThemePref } from '@/db/types';

export const THEME_OPTIONS: readonly { value: ThemePref }[] = [
  { value: 'light' },
  { value: 'dark' },
  { value: 'system' },
];
