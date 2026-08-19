import { createElement } from 'react';
import { resolveIcon } from '@/lib/icons';
import type { AppIconProps } from './AppIcon.types';

export function AppIcon({ name, size = 18, className }: AppIconProps) {
  return createElement(resolveIcon(name), { size, className, 'aria-hidden': 'true' });
}
