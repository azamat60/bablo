import type { ReactNode } from 'react';

export type PageHeaderProps = {
  title: string;
  onBack?: () => void;
  action?: ReactNode;
};
