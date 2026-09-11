import type { AccountType } from '@/db/types';

export const ACCOUNT_TYPE_OPTIONS: readonly { type: AccountType; icon: string }[] = [
  { type: 'cash', icon: 'banknote' },
  { type: 'debit_card', icon: 'credit-card' },
  { type: 'credit_card', icon: 'wallet-cards' },
  { type: 'savings', icon: 'piggy-bank' },
  { type: 'ewallet', icon: 'smartphone' },
  { type: 'investment', icon: 'trending-up' },
  { type: 'loan', icon: 'landmark' },
];

export const ACCOUNT_COLORS: readonly string[] = ['#3d8bfd', '#2fc48d', '#f5a83a', '#a06cf0', '#2bb8c4', '#f2545f'];
