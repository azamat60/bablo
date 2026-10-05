// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useVoiceCapture, type VoiceCapture } from '../useVoiceCapture';
const mocks = vi.hoisted(() => ({ submit: vi.fn(), cancel: vi.fn(), reset: vi.fn() }));
vi.mock('../useAiParse', () => ({ useAiParse: () => ({ status: 'idle', error: null, result: null, ...mocks }) }));
vi.mock('@/lib/aiClient', () => ({ parseVoice: vi.fn() }));
let capture: VoiceCapture;
let root: Root;
let intervalSpy: MockInstance<typeof window.setInterval>;
let clearIntervalSpy: MockInstance<typeof window.clearInterval>;
let releasePermission: (stream: MediaStream) => void;
let denyPermission: (reason: Error) => void;
let permission: Promise<MediaStream>;
let stream: MediaStream;
const stopTrack = vi.fn();
const getUserMedia = vi.fn();
class Recorder {
  static instances: Recorder[] = [];
  static isTypeSupported() {
    return true;
  }
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    Recorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio']) });
    this.onstop?.();
  }
}
function Harness() {
  const current = useVoiceCapture();
  useEffect(() => {
    capture = current;
  });
  return <span>{current.status}</span>;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  Recorder.instances = [];
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('MediaRecorder', Recorder);
  permission = new Promise((resolve, reject) => {
    releasePermission = resolve;
    denyPermission = reject;
  });
  stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  getUserMedia.mockReturnValue(permission);
  vi.stubGlobal('navigator', { language: 'ru', mediaDevices: { getUserMedia } });
  root = createRoot(document.createElement('div'));
  act(() => {
    root.render(<Harness />);
  });
  intervalSpy = vi.spyOn(window, 'setInterval');
  clearIntervalSpy = vi.spyOn(window, 'clearInterval');
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('microphone lifetime', () => {
  it('double start before permission creates one recorder', async () => {
    let first: Promise<void>;
    let second: Promise<void>;
    act(() => {
      first = capture.start();
      second = capture.start();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    await act(async () => {
      releasePermission(stream);
      await first!;
      await second!;
    });
    expect(Recorder.instances).toHaveLength(1);
    expect(capture.status).toBe('recording');
    act(() => capture.cancel());
    expect(stopTrack).toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('cancel stops stream that arrives after modal closes', async () => {
    let pending: Promise<void>;
    act(() => {
      pending = capture.start();
      capture.cancel();
    });
    await act(async () => {
      releasePermission(stream);
      await pending!;
    });
    expect(stopTrack).toHaveBeenCalled();
    expect(Recorder.instances).toHaveLength(0);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('unmount stops recording tracks and timers', async () => {
    await act(async () => {
      const pending = capture.start();
      releasePermission(stream);
      await pending;
    });
    act(() => root.unmount());
    expect(stopTrack).toHaveBeenCalled();
    expect(Recorder.instances[0]?.state).toBe('inactive');
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalSpy.mock.results[0]?.value);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('permission refusal resets capture', async () => {
    let pending: Promise<void>;
    await act(async () => {
      pending = capture.start();
      denyPermission(new DOMException('Denied', 'NotAllowedError'));
      await pending;
    });
    expect(capture.status).toBe('error');
    expect(Recorder.instances).toHaveLength(0);
    expect(intervalSpy).not.toHaveBeenCalled();
  });
  it('60 seconds stops recorder and all tracks', async () => {
    await act(async () => {
      const pending = capture.start();
      releasePermission(stream);
      await pending;
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(Recorder.instances[0]?.state).toBe('inactive');
    expect(stopTrack).toHaveBeenCalled();
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
