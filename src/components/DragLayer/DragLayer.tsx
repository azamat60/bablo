import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AppIcon } from '@/components/AppIcon';
import { useDragStore } from '@/store/drag';
import { dragPointer } from '@/lib/dragPointer';
import { useScrollContainer } from '@/components/ScrollContainer';
import styles from './DragLayer.module.css';

/** Distance from an edge at which auto-scroll kicks in. */
const EDGE_PX = 76;
const MAX_SCROLL_STEP = 14;

/**
 * Renders the tile that follows the finger, and drives auto-scroll.
 *
 * Portalled to document.body rather than into the app content, which is
 * `overflow: auto` (it would clip the ghost) and scrolls (it would drag the
 * ghost along).
 */
export function DragLayer() {
  const source = useDragStore((s) => s.source);
  const dragging = useDragStore((s) => s.phase === 'dragging');
  const ghostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useScrollContainer();

  useEffect(() => {
    if (!dragging) return;
    let frame = 0;

    const tick = () => {
      const ghost = ghostRef.current;
      if (ghost) {
        const x = dragPointer.x + dragPointer.offsetX;
        const y = dragPointer.y + dragPointer.offsetY;
        ghost.style.transform = `translate3d(${x}px, ${y}px, 0) scale(var(--tile-lift-scale))`;
      }

      const scroller = scrollRef.current;
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        // The tab bar is fixed and overlays the scroller, so the visually
        // reachable bottom is higher than the element's own bottom edge.
        const styles = getComputedStyle(document.documentElement);
        const tabBar = Number.parseFloat(styles.getPropertyValue('--tab-bar-height')) || 0;
        const top = rect.top;
        const bottom = rect.bottom - tabBar;

        const fromTop = dragPointer.y - top;
        const fromBottom = bottom - dragPointer.y;
        if (fromTop < EDGE_PX) {
          scroller.scrollTop -= MAX_SCROLL_STEP * (1 - Math.max(fromTop, 0) / EDGE_PX);
        } else if (fromBottom < EDGE_PX) {
          scroller.scrollTop += MAX_SCROLL_STEP * (1 - Math.max(fromBottom, 0) / EDGE_PX);
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging, scrollRef]);

  if (!dragging || !source) return null;

  return createPortal(
    <div ref={ghostRef} className={styles.ghost} style={{ background: source.color }} aria-hidden="true">
      <AppIcon name={source.icon} size={22} />
    </div>,
    document.body,
  );
}
