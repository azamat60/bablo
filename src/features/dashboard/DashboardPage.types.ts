import type { TileKind } from '@/components/Tile';

export type DashboardTile = {
  id: string;
  kind: TileKind;
  color: string;
  icon: string;
  label: string;
  /** Signed minor units: period activity for groups, current balance for accounts. */
  amount: number;
  currency: string;
  /** Assigned budget for the month, expense groups only. */
  assigned?: number;
};

export type DashboardSection = {
  id: 'income' | 'accounts' | 'expenses';
  title: string;
  tiles: DashboardTile[];
  /** Section total in minor units, or undefined when it cannot be stated honestly. */
  total?: number;
  /** True when some accounts were excluded for want of an exchange rate. */
  incomplete?: boolean;
  assignedTotal?: number;
  currency: string;
};
