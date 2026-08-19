import { House, Landmark, List, Wallet, PieChart } from 'lucide-react';
import type { TabDefinition } from './TabBar.types';

export const TABS: readonly TabDefinition[] = [
  { to: '/', labelKey: 'home', icon: House },
  { to: '/accounts', labelKey: 'accounts', icon: Landmark },
  { to: '/transactions', labelKey: 'transactions', icon: List },
  { to: '/budget', labelKey: 'budget', icon: Wallet },
  { to: '/reports', labelKey: 'reports', icon: PieChart },
];
