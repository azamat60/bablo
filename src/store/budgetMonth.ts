import { create } from 'zustand';
import { monthKey } from '@/domain/budget';

type BudgetMonthState = {
  month: string;
  setMonth: (month: string) => void;
};

export const useBudgetMonthStore = create<BudgetMonthState>((set) => ({
  month: monthKey(),
  setMonth: (month) => set({ month }),
}));
