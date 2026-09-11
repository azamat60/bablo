import type { ReactNode } from 'react';

export type SectionHeaderProps = {
  title: string;
  /** Period total, already formatted. */
  total?: string;
  /** Smaller figure under the total — the assigned budget on the expense section. */
  secondaryTotal?: string;
  open?: boolean;
  onToggle?: () => void;
  /** Optional trailing control, e.g. a filter button. */
  action?: ReactNode;
  /** id of the region this header controls, for aria-controls. */
  controls?: string;
};
