type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'portrait-primary') => Promise<void>;
};

export function installPortraitLock(): () => void {
  const orientation = screen.orientation as LockableOrientation | undefined;
  if (!orientation?.lock || !navigator.maxTouchPoints) return () => {};
  const lock = async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      await orientation.lock?.('portrait-primary');
    } catch {
      // Some browsers require fullscreen or do not support orientation locking.
    }
  };
  const retry = () => void lock();
  retry();
  window.addEventListener('pageshow', retry);
  document.addEventListener('visibilitychange', retry);
  document.addEventListener('fullscreenchange', retry);
  return () => {
    window.removeEventListener('pageshow', retry);
    document.removeEventListener('visibilitychange', retry);
    document.removeEventListener('fullscreenchange', retry);
  };
}
