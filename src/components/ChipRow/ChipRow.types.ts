import type { ReactNode } from 'react';

export type ChipItem = {
  id: string;
  /** Large mark on the first line — an initial, a day number, or an icon. */
  glyph: ReactNode;
  label: string;
};

export type ChipRowProps = {
  items: ChipItem[];
  activeId?: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
};
