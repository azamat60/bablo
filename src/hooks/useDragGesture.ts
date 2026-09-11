import { useEffect, useRef } from 'react';
import { useDragStore } from '@/store/drag';
import { setDragPointer, dragPointer } from '@/lib/dragPointer';
import { allTargetMeta, hitTest, snapshotTargets, type TargetSnapshot } from '@/lib/dropRegistry';
import { resolveDrop, validTargetIds, type DragItem, type DropOutcome } from '@/domain/dragRules';

/** How long a press must be held before the tile lifts. */
const LONG_PRESS_MS = 320;
/** Movement past this before the timer fires means the user is scrolling. */
const CANCEL_SLOP_PX = 10;

export type DragGestureOptions = {
  /** Resolves a tile element's id into the item being dragged. */
  resolveItem: (tileId: string) => DragItem | null;
  onDrop: (outcome: DropOutcome) => void;
  /** The scroller to auto-scroll and to lock during a drag. */
  scrollRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
};

type Pending = {
  pointerId: number;
  startX: number;
  startY: number;
  tileId: string;
  timer: number;
};

/**
 * Long-press-to-lift drag, attached to a container by delegation.
 *
 * Delegation matters: tiles re-render whenever a Dexie live query invalidates,
 * and pointer capture is silently lost if the captured element unmounts. The
 * container is stable, so the capture survives.
 */
export function useDragGesture({ resolveItem, onDrop, scrollRef, enabled = true }: DragGestureOptions) {
  const containerRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const snapshotsRef = useRef<TargetSnapshot[]>([]);
  const draggingRef = useRef<DragItem | null>(null);
  const scrollAtLiftRef = useRef(0);

  // Read through refs so the effect below never needs to re-subscribe when a
  // callback identity changes mid-gesture.
  const resolveItemRef = useRef(resolveItem);
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    resolveItemRef.current = resolveItem;
    onDropRef.current = onDrop;
  }, [resolveItem, onDrop]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const store = useDragStore.getState();

    const clearPending = () => {
      if (pendingRef.current) {
        window.clearTimeout(pendingRef.current.timer);
        pendingRef.current = null;
      }
    };

    const preventTouchScroll = (event: TouchEvent) => event.preventDefault();

    const finish = () => {
      clearPending();
      draggingRef.current = null;
      snapshotsRef.current = [];
      scrollRef.current?.classList.remove('dragging');
      document.removeEventListener('touchmove', preventTouchScroll);
      useDragStore.getState().end();
    };

    const lift = (tileId: string, x: number, y: number, pointerId: number) => {
      const item = resolveItemRef.current(tileId);
      if (!item) return;

      draggingRef.current = item;
      snapshotsRef.current = snapshotTargets(container);
      scrollAtLiftRef.current = scrollRef.current?.scrollTop ?? 0;

      const tile = container.querySelector<HTMLElement>(`[data-tile-id="${CSS.escape(tileId)}"]`);
      if (tile) {
        const rect = tile.getBoundingClientRect();
        dragPointer.offsetX = rect.left + rect.width / 2 - x;
        dragPointer.offsetY = rect.top + rect.height / 2 - y;
      } else {
        dragPointer.offsetX = 0;
        dragPointer.offsetY = 0;
      }
      setDragPointer(x, y);

      try {
        container.setPointerCapture(pointerId);
      } catch {
        // Capture is a nicety; the gesture still works through window events.
      }
      // Both the class and the non-passive preventDefault below: the class
      // cannot stop a scroll that already started, and the slop check above
      // guarantees none has.
      scrollRef.current?.classList.add('dragging');
      document.addEventListener('touchmove', preventTouchScroll, { passive: false });
      navigator.vibrate?.(10);

      useDragStore.getState().begin(item, validTargetIds(item, allTargetMeta(container)));
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      const tile = (event.target as Element | null)?.closest?.<HTMLElement>('[data-tile-id]');
      const tileId = tile?.dataset.tileId;
      if (!tileId || tile?.dataset.tileKind === 'add') return;

      clearPending();
      const { clientX, clientY, pointerId } = event;
      pendingRef.current = {
        pointerId,
        startX: clientX,
        startY: clientY,
        tileId,
        timer: window.setTimeout(() => {
          pendingRef.current = null;
          lift(tileId, clientX, clientY, pointerId);
        }, LONG_PRESS_MS),
      };
      // Deliberately no preventDefault: the browser must stay free to start a
      // native scroll if this turns out to be a swipe.
    };

    const handlePointerMove = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (pending) {
        const moved = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
        if (moved > CANCEL_SLOP_PX) clearPending();
        return;
      }
      if (!draggingRef.current) return;

      setDragPointer(event.clientX, event.clientY);
      const scrollDelta = (scrollRef.current?.scrollTop ?? 0) - scrollAtLiftRef.current;
      const hit = hitTest(snapshotsRef.current, event.clientX, event.clientY, scrollDelta);
      const source = draggingRef.current;
      const valid = hit && resolveDrop(source, hit) !== null ? hit.id : null;
      useDragStore.getState().setHover(valid);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const source = draggingRef.current;
      if (!source) {
        clearPending();
        return;
      }
      const scrollDelta = (scrollRef.current?.scrollTop ?? 0) - scrollAtLiftRef.current;
      const hit = hitTest(snapshotsRef.current, event.clientX, event.clientY, scrollDelta);
      const outcome = hit ? resolveDrop(source, hit) : null;
      finish();
      if (outcome) onDropRef.current(outcome);
    };

    // iOS fires pointercancel when Safari takes the gesture over for scrolling.
    const handlePointerCancel = () => {
      if (draggingRef.current) finish();
      else clearPending();
    };

    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('blur', handlePointerCancel);

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('blur', handlePointerCancel);
      document.removeEventListener('touchmove', preventTouchScroll);
      clearPending();
      if (store.phase !== 'idle') useDragStore.getState().end();
    };
  }, [enabled, scrollRef]);

  return containerRef;
}
