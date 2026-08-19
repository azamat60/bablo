import { create } from 'zustand';
import { todayPeriod, type Period, type PeriodKind } from '@/domain/period';

type PeriodState = {
  period: Period;
  setPeriod: (period: Period) => void;
  setKind: (kind: PeriodKind) => void;
};

export const usePeriodStore = create<PeriodState>((set, get) => ({
  period: todayPeriod('month'),
  setPeriod: (period) => set({ period }),
  setKind: (kind) => set({ period: { kind, anchor: get().period.anchor } }),
}));
