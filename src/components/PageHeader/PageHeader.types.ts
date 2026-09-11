import type { ReactNode } from 'react';

export type PageHeaderProps = {
  className?: string;
  title: string;
  onBack?: () => void;
  action?: ReactNode;
};
