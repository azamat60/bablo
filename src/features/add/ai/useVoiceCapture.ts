import { useCallback, useEffect, useRef, useState } from 'react';
import { parseVoice, type AiContextOptions } from '@/lib/aiClient';
import { useT } from '@/i18n';
import { useAiParse, type AiParseState } from './useAiParse';

const MAX_SECONDS = 60;
const PERMISSION_TIMEOUT_MS = 8000;
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];

type CapturePhase = 'idle' | 'requesting' | 'recording' | 'stopping';
type CaptureSession = {
  phase: CapturePhase;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  timer: number | null;
  permissionTimer: number | null;
  rejectPermission: ((error: DOMException) => void) | null;
  discard: boolean;
};

function pickMimeType(): string | undefined {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function clearTimers(session: CaptureSession) {
  if (session.timer !== null) window.clearInterval(session.timer);
  if (session.permissionTimer !== null) window.clearTimeout(session.permissionTimer);
  session.timer = null;
  session.permissionTimer = null;
}

function releaseSession(session: CaptureSession) {
  session.rejectPermission?.(new DOMException('Capture cancelled', 'AbortError'));
  session.rejectPermission = null;
  clearTimers(session);
  const recorder = session.recorder;
  if (recorder) {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        session.discard = true;
      }
    }
  }
  stopTracks(session.stream);
  session.phase = 'idle';
}

export type VoiceStatus = 'idle' | 'requesting' | 'recording' | 'stopping' | 'analyzing' | 'queued' | 'done' | 'error';

export type VoiceCapture = Omit<AiParseState, 'status'> & {
  status: VoiceStatus;
  seconds: number;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
};

export function useVoiceCapture(options?: AiContextOptions): VoiceCapture {
  const t = useT();
  const parse = useAiParse('voice', t.capture.failedVoice);
  const cancelParse = parse.cancel;
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const sessionRef = useRef<CaptureSession | null>(null);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (session) {
        session.discard = true;
        releaseSession(session);
        sessionRef.current = null;
      }
    },
    [],
  );

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.phase === 'stopping') return;
    clearTimers(session);
    if (!session.recorder) {
      session.discard = true;
      releaseSession(session);
      sessionRef.current = null;
      setPhase('idle');
      return;
    }
    session.phase = 'stopping';
    setPhase('stopping');
    if (session.recorder.state !== 'inactive') {
      try {
        session.recorder.stop();
      } catch {
        session.discard = true;
        releaseSession(session);
        sessionRef.current = null;
        setPhase('idle');
      }
    }
    stopTracks(session.stream);
  }, []);

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    if (session) {
      session.discard = true;
      releaseSession(session);
      sessionRef.current = null;
    }
    setPhase('idle');
    cancelParse();
  }, [cancelParse]);

  const start = useCallback(async () => {
    if (sessionRef.current || parse.status === 'analyzing' || parse.status === 'queued') return;
    setMicError(null);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicError(t.capture.micDenied);
      return;
    }
    const session: CaptureSession = {
      phase: 'requesting',
      stream: null,
      recorder: null,
      chunks: [],
      timer: null,
      permissionTimer: null,
      rejectPermission: null,
      discard: false,
    };
    sessionRef.current = session;
    setPhase('requesting');
    parse.reset();
    try {
      const permission = navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        if (sessionRef.current !== session || session.phase !== 'requesting') {
          stopTracks(stream);
          throw new DOMException('Capture cancelled', 'AbortError');
        }
        session.stream = stream;
        return stream;
      });
      const stream = await Promise.race([
        permission,
        new Promise<never>((_, reject) => {
          session.rejectPermission = reject;
          session.permissionTimer = window.setTimeout(
            () => reject(new DOMException('Microphone permission timed out', 'NotAllowedError')),
            PERMISSION_TIMEOUT_MS,
          );
        }),
      ]);
      session.rejectPermission = null;
      clearTimers(session);
      if (sessionRef.current !== session) {
        stopTracks(stream);
        return;
      }
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      session.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (sessionRef.current === session && !session.discard && event.data.size > 0) {
          session.chunks.push(event.data);
        }
      };
      recorder.onstop = () => {
        if (sessionRef.current !== session) {
          releaseSession(session);
          return;
        }
        const blob = new Blob(session.chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        const discard = session.discard;
        releaseSession(session);
        sessionRef.current = null;
        setPhase('idle');
        if (!discard && blob.size > 0) {
          void parse.submit((signal) => parseVoice(blob, { ...optionsRef.current, signal }), { inputBlob: blob });
        }
      };
      recorder.onerror = () => {
        if (sessionRef.current !== session) return;
        session.discard = true;
        releaseSession(session);
        sessionRef.current = null;
        setPhase('idle');
        setMicError(t.capture.failedVoice);
      };
      recorder.start();
      session.phase = 'recording';
      setPhase('recording');
      setSeconds(0);
      let elapsed = 0;
      session.timer = window.setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) stop();
      }, 1000);
    } catch (error) {
      const current = sessionRef.current === session;
      releaseSession(session);
      if (current) {
        sessionRef.current = null;
        setPhase('idle');
        if (!(error instanceof Error && error.name === 'AbortError')) setMicError(t.capture.micDenied);
      }
    }
  }, [parse, stop, t]);

  const status: VoiceStatus = phase !== 'idle' ? phase : micError ? 'error' : parse.status;

  return {
    ...parse,
    status,
    error: micError ?? parse.error,
    seconds,
    start,
    stop,
    cancel,
    reset: () => {
      cancel();
      setMicError(null);
      setSeconds(0);
    },
  };
}
