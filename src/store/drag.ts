import { create } from 'zustand';
import type { DragItem } from '@/domain/dragRules';

export type DragPhase = 'idle' | 'pending' | 'dragging';

type DragState = {
  phase: DragPhase;
  source: DragItem | null;
  hoverTargetId: string | null;
  validTargetIds: ReadonlySet<string>;
  begin: (source: DragItem, validIds: Set<string>) => void;
  setHover: (id: string | null) => void;
  end: () => void;
};

const NO_TARGETS: ReadonlySet<string> = new Set();

/**
 * The low-frequency half of drag state: it changes about four times per
 * gesture (lift, a few hover transitions, drop), so tiles can subscribe with
 * narrow selectors and a hover change re-renders exactly two of them.
 *
 * Pointer coordinates deliberately live outside this store — see lib/dragPointer.
 */
export const useDragStore = create<DragState>((set) => ({
  phase: 'idle',
  source: null,
  hoverTargetId: null,
  validTargetIds: NO_TARGETS,
  begin: (source, validIds) => set({ phase: 'dragging', source, validTargetIds: validIds, hoverTargetId: null }),
  setHover: (id) => set((state) => (state.hoverTargetId === id ? state : { hoverTargetId: id })),
  end: () => set({ phase: 'idle', source: null, hoverTargetId: null, validTargetIds: NO_TARGETS }),
}));
