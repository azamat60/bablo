import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type PrivacyState = {
  hideAmounts: boolean;
  toggleHideAmounts: () => void;
};

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set) => ({
      hideAmounts: false,
      toggleHideAmounts: () => set((state) => ({ hideAmounts: !state.hideAmounts })),
    }),
    { name: 'bablo-privacy' },
  ),
);
