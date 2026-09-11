import type { DragKind, DropTargetMeta } from '@/domain/dragRules';

const TILE_SELECTOR = '[data-tile-id][data-tile-kind]';

function readMeta(el: HTMLElement): DropTargetMeta | null {
  const id = el.dataset.tileId;
  const kind = el.dataset.tileKind;
  if (!id || !kind || kind === 'add') return null;
  return { id, kind: kind as DragKind };
}

/**
 * Drop targets are discovered from the DOM rather than kept in a registry.
 *
 * Tiles re-render on every Dexie live-query invalidation, so a registry would
 * need careful add/remove bookkeeping to avoid stale entries. Reading the DOM
 * at lift time is always in sync, and it happens once per gesture.
 */
export function allTargetMeta(container: HTMLElement): DropTargetMeta[] {
  return [...container.querySelectorAll<HTMLElement>(TILE_SELECTOR)]
    .map(readMeta)
    .filter((meta): meta is DropTargetMeta => meta !== null);
}

export type TargetSnapshot = DropTargetMeta & {
  /** Viewport coordinates at lift time. */
  cx: number;
  cy: number;
  radius: number;
};

/**
 * Measures every target once, when the drag starts.
 *
 * Re-measuring per pointermove would force layout every frame, and
 * elementFromPoint is unreliable here because the ghost sits under the finger.
 */
export function snapshotTargets(container: HTMLElement): TargetSnapshot[] {
  const snapshots: TargetSnapshot[] = [];
  for (const el of container.querySelectorAll<HTMLElement>(TILE_SELECTOR)) {
    const meta = readMeta(el);
    if (!meta) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    snapshots.push({
      ...meta,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      // The whole cell is a target, not just the circle.
      radius: Math.max(rect.width, rect.height) / 2 + 6,
    });
  }
  return snapshots;
}

/**
 * Nearest target containing the point, or null. `scrollDelta` accounts for
 * auto-scroll since the snapshot, which is cheaper than re-measuring.
 */
export function hitTest(
  snapshots: readonly TargetSnapshot[],
  x: number,
  y: number,
  scrollDelta = 0,
): TargetSnapshot | null {
  let best: TargetSnapshot | null = null;
  let bestDistance = Infinity;
  for (const target of snapshots) {
    const dx = x - target.cx;
    const dy = y - (target.cy - scrollDelta);
    const distance = Math.hypot(dx, dy);
    if (distance <= target.radius && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}
