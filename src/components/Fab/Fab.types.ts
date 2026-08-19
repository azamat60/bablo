import type { LucideIcon } from 'lucide-react';
import type { Dictionary } from '@/i18n';

export type FabAction = {
  to: string;
  labelKey: Exclude<keyof Dictionary['fab'], 'openAria' | 'closeAria'>;
  icon: LucideIcon;
};
