/**
 * The 60fps half of drag state.
 *
 * Written on every pointermove and read by DragLayer's rAF loop. It is a plain
 * mutable object on purpose: routing finger coordinates through React state
 * makes the ghost lag noticeably on mid-range hardware.
 */
export const dragPointer = {
  x: 0,
  y: 0,
  /** Offset from the pointer to the lifted tile's centre, so it does not jump. */
  offsetX: 0,
  offsetY: 0,
};

export function setDragPointer(x: number, y: number): void {
  dragPointer.x = x;
  dragPointer.y = y;
}
