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

export const ACCOUNT_COLORS: readonly string[] = ['#4f8dfd', '#2fbf71', '#f5a623', '#d88fd8', '#5aa9e6', '#ef5f6d'];
