import type { HTMLAttributes, ReactNode } from 'react';

export type CardVariant = 'plain' | 'raised' | 'gradient' | 'sunken';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  children: ReactNode;
};
