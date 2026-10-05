import { useEffect, useRef } from 'react';
import { useDragStore } from '@/store/drag';
import { setDragPointer, dragPointer } from '@/lib/dragPointer';
import { allTargetMeta, hitTest, snapshotTargets, type TargetSnapshot } from '@/lib/dropRegistry';
import { resolveDrop, validTargetIds, type DragItem, type DropOutcome } from '@/domain/dragRules';

/** A press held this long arms the drag: scrolling is off and the next movement lifts the tile. */
const ARM_MS = 80;
/** Movement past this before arming means the user is scrolling. */
const CANCEL_SLOP_PX = 10;
/** Movement past this once armed lifts the tile. Above finger jitter, so a tap does not flash the drag UI. */
const LIFT_MOVE_PX = 6;
/** A still press this long after arming lifts anyway, so holding a tile shows it can be dragged. */
const HOLD_LIFT_MS = 200;

export type DragGestureOptions = {
  /** Resolves a tile element's id into the item being dragged. */
  resolveItem: (tileId: string) => DragItem | null;
  onDrop: (outcome: DropOutcome) => void;
  /**
   * A press that arms the drag but never moves. The native click is swallowed
   * then — pointer capture retargets it to the container — so taps are
   * delivered here instead.
   */
  onTap: (tileId: string) => void;
  /** The scroller to auto-scroll and to lock during a drag. */
  scrollRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
};

type Pending = {
  phase: 'pressed' | 'armed';
  pointerId: number;
  startX: number;
  startY: number;
  tileId: string;
  timer: number;
};

/**
 * Press-to-arm, move-to-lift drag, attached to a container by delegation.
 *
 * Delegation matters: tiles re-render whenever a Dexie live query invalidates,
 * and pointer capture is silently lost if the captured element unmounts. The
 * container is stable, so the capture survives.
 */
export function useDragGesture({ resolveItem, onDrop, onTap, scrollRef, enabled = true }: DragGestureOptions) {
  const containerRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const snapshotsRef = useRef<TargetSnapshot[]>([]);
  const draggingRef = useRef<DragItem | null>(null);
  const scrollAtLiftRef = useRef(0);

  // Read through refs so the effect below never needs to re-subscribe when a
  // callback identity changes mid-gesture.
  const resolveItemRef = useRef(resolveItem);
  const onDropRef = useRef(onDrop);
  const onTapRef = useRef(onTap);
  useEffect(() => {
    resolveItemRef.current = resolveItem;
    onDropRef.current = onDrop;
    onTapRef.current = onTap;
  }, [resolveItem, onDrop, onTap]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const store = useDragStore.getState();
    let swallowClick = false;

    const preventTouchScroll = (event: TouchEvent) => event.preventDefault();

    const unlockScroll = () => {
      scrollRef.current?.classList.remove('dragging');
      document.removeEventListener('touchmove', preventTouchScroll);
    };

    const clearPending = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      window.clearTimeout(pending.timer);
      pendingRef.current = null;
      if (pending.phase === 'armed') unlockScroll();
    };

    const finish = () => {
      clearPending();
      draggingRef.current = null;
      snapshotsRef.current = [];
      unlockScroll();
      useDragStore.getState().end();
    };

    const lift = (tileId: string, x: number, y: number) => {
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
      navigator.vibrate?.(10);

      useDragStore.getState().begin(item, validTargetIds(item, allTargetMeta(container)));
    };

    const liftPending = (x: number, y: number) => {
      const pending = pendingRef.current;
      if (!pending) return;
      window.clearTimeout(pending.timer);
      pendingRef.current = null;
      lift(pending.tileId, x, y);
    };

    // Arming happens before any movement: the scroll lock must be in place by
    // the time the first touchmove arrives, or the browser starts a native
    // scroll that no later preventDefault can stop.
    const arm = (pending: Pending) => {
      pending.phase = 'armed';
      try {
        container.setPointerCapture(pending.pointerId);
      } catch {
        // Capture is a nicety; the gesture still works through window events.
      }
      scrollRef.current?.classList.add('dragging');
      document.addEventListener('touchmove', preventTouchScroll, { passive: false });
      pending.timer = window.setTimeout(() => liftPending(pending.startX, pending.startY), HOLD_LIFT_MS);
    };

    const handlePointerDown = (event: PointerEvent) => {
      swallowClick = false;
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      const tile = (event.target as Element | null)?.closest?.<HTMLElement>('[data-tile-id]');
      const tileId = tile?.dataset.tileId;
      if (!tileId || tile?.dataset.tileKind === 'add') return;

      clearPending();
      const pending: Pending = {
        phase: 'pressed',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        tileId,
        timer: 0,
      };
      pending.timer = window.setTimeout(() => arm(pending), ARM_MS);
      pendingRef.current = pending;
      // Deliberately no preventDefault: the browser must stay free to start a
      // native scroll if this turns out to be a swipe.
    };

    const trackDrag = (event: PointerEvent) => {
      setDragPointer(event.clientX, event.clientY);
      const scrollDelta = (scrollRef.current?.scrollTop ?? 0) - scrollAtLiftRef.current;
      const hit = hitTest(snapshotsRef.current, event.clientX, event.clientY, scrollDelta);
      const source = draggingRef.current!;
      const valid = hit && resolveDrop(source, hit) !== null ? hit.id : null;
      useDragStore.getState().setHover(valid);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (pending) {
        const moved = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
        if (pending.phase === 'pressed') {
          if (moved > CANCEL_SLOP_PX) clearPending();
          return;
        }
        if (moved <= LIFT_MOVE_PX) return;
        liftPending(event.clientX, event.clientY);
      }
      if (draggingRef.current) trackDrag(event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const pending = pendingRef.current;
      const source = draggingRef.current;
      if (pending?.phase === 'armed') {
        clearPending();
        swallowClick = true;
        onTapRef.current(pending.tileId);
        return;
      }
      if (!source) {
        clearPending();
        return;
      }
      const scrollDelta = (scrollRef.current?.scrollTop ?? 0) - scrollAtLiftRef.current;
      const hit = hitTest(snapshotsRef.current, event.clientX, event.clientY, scrollDelta);
      const outcome = hit ? resolveDrop(source, hit) : null;
      finish();
      swallowClick = true;
      if (outcome) onDropRef.current(outcome);
    };

    // iOS fires pointercancel when Safari takes the gesture over for scrolling.
    const handlePointerCancel = () => {
      if (draggingRef.current) finish();
      else clearPending();
    };

    // Capture phase, so React's delegated onClick on the tile never runs for a
    // press this hook already handled as a tap or a drop.
    const handleClick = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopPropagation();
      event.preventDefault();
    };

    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerCancel);
    container.addEventListener('click', handleClick, true);
    window.addEventListener('blur', handlePointerCancel);

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerCancel);
      container.removeEventListener('click', handleClick, true);
      window.removeEventListener('blur', handlePointerCancel);
      document.removeEventListener('touchmove', preventTouchScroll);
      clearPending();
      if (store.phase !== 'idle') useDragStore.getState().end();
    };
  }, [enabled, scrollRef]);

  return containerRef;
}
