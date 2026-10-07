// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installPortraitLock } from '../orientation';

let dispose = () => {};
const lock = vi.fn<() => Promise<void>>();
beforeEach(() => {
  lock.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('screen', { orientation: { lock } });
  vi.stubGlobal('navigator', { maxTouchPoints: 1 });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('portrait orientation', () => {
  it('locks upright portrait and retries when app returns or enters fullscreen', () => {
    dispose = installPortraitLock();
    expect(lock).toHaveBeenCalledWith('portrait-primary');
    for (const event of ['visibilitychange', 'fullscreenchange']) document.dispatchEvent(new Event(event));
    window.dispatchEvent(new Event('pageshow'));
    expect(lock).toHaveBeenCalledTimes(4);
    dispose();
    window.dispatchEvent(new Event('pageshow'));
    expect(lock).toHaveBeenCalledTimes(4);
  });

  it('handles missing API and desktop without trying a lock', () => {
    vi.stubGlobal('screen', {});
    expect(() => installPortraitLock()).not.toThrow();
    vi.stubGlobal('screen', { orientation: { lock } });
    vi.stubGlobal('navigator', { maxTouchPoints: 0 });
    dispose = installPortraitLock();
    expect(lock).not.toHaveBeenCalled();
  });

  it('ignores unsupported lock rejections and waits while document is hidden', async () => {
    lock.mockRejectedValue(new DOMException('Unsupported', 'NotSupportedError'));
    dispose = installPortraitLock();
    await Promise.resolve();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(lock).toHaveBeenCalledTimes(1);
  });
});
