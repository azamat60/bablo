import type { LucideIcon } from 'lucide-react';
import type { Dictionary } from '@/i18n';

export type TabDefinition = {
  to: string;
  labelKey: keyof Dictionary['tabs'];
  icon: LucideIcon;
};
