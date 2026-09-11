import { createContext, useContext } from 'react';
import type { RefObject } from 'react';

/**
 * The app has exactly one scroll container (`.content` in App.tsx), because
 * the shell is `position: fixed` and the document cannot scroll. Drag
 * auto-scroll needs a handle on it.
 */
export const ScrollContainerContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function useScrollContainer(): RefObject<HTMLDivElement | null> {
  const ref = useContext(ScrollContainerContext);
  if (!ref) throw new Error('useScrollContainer must be used inside ScrollContainerContext');
  return ref;
}
