import { useCallback, useEffect, useRef, useState } from 'react';
import { parseVoice, type AiContextOptions } from '@/lib/aiClient';
import { useT } from '@/i18n';
import { useAiParse, type AiParseState } from './useAiParse';

const MAX_SECONDS = 60;
/** Some embedded webviews never settle the permission prompt; do not hang the UI on them. */
const PERMISSION_TIMEOUT_MS = 8000;

/**
 * In preference order. iOS Safari only supports mp4; Chrome and Firefox prefer
 * webm/opus. Recording without checking used to label every blob audio/webm,
 * which broke transcription of iOS recordings.
 */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

export type VoiceStatus = 'idle' | 'recording' | 'analyzing' | 'queued' | 'done' | 'error';

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
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const discardRef = useRef(false);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stop = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    discardRef.current = true;
    stop();
    setRecording(false);
  }, [stop]);

  // Leaving the screen mid-recording must release the microphone.
  useEffect(() => () => cancel(), [cancel]);

  const start = useCallback(async () => {
    setMicError(null);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicError(t.capture.micDenied);
      return;
    }
    try {
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true }),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new DOMException('timeout', 'NotAllowedError')), PERMISSION_TIMEOUT_MS),
        ),
      ]);
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      discardRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        if (discardRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        void parse.submit(() => parseVoice(blob, optionsRef.current), { inputBlob: blob });
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      let elapsed = 0;
      timerRef.current = window.setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) stop();
      }, 1000);
    } catch {
      setMicError(t.capture.micDenied);
    }
  }, [parse, stop, t]);

  const status: VoiceStatus = recording ? 'recording' : micError ? 'error' : parse.status;

  return {
    ...parse,
    status,
    error: micError ?? parse.error,
    seconds,
    start,
    stop,
    cancel,
    reset: () => {
      setMicError(null);
      parse.reset();
    },
  };
}
