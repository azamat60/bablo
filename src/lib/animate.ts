export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animates an element from wherever it currently is back to an origin point.
 * Resolves once finished (immediately when motion is reduced) so the caller
 * can unmount the ghost.
 */
export function snapBack(el: HTMLElement, toX: number, toY: number, scale: number): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();

  const from = getComputedStyle(el).transform;
  const animation = el.animate(
    [{ transform: from }, { transform: `translate3d(${toX}px, ${toY}px, 0) scale(${scale})`, opacity: 0.4 }],
    { duration: 220, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' },
  );
  return animation.finished.then(
    () => undefined,
    () => undefined,
  );
}
