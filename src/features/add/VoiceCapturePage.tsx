import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Mic, Square } from 'lucide-react';
import { parseVoice } from '@/lib/aiClient';
import { enqueueAiJob } from '@/db/queries/aiJobs';
import { useT } from '@/i18n';
import styles from './CapturePage.module.css';

type Status = 'idle' | 'recording' | 'analyzing' | 'error';

export function VoiceCapturePage() {
  const navigate = useNavigate();
  const t = useT();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void handleRecordingComplete(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setStatus('recording');
      setSeconds(0);
      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        if (elapsed >= 60) stopRecording();
      }, 1000);
    } catch {
      setError(t.capture.micDenied);
      setStatus('error');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  };

  const handleRecordingComplete = async (blob: Blob) => {
    setStatus('analyzing');
    try {
      const { draft, transcript } = await parseVoice(blob);
      void navigate('/add/review', { state: { draft, transcript } });
    } catch (err) {
      if (!navigator.onLine) {
        await enqueueAiJob({ kind: 'voice', inputBlob: blob });
        setStatus('error');
        setError(t.capture.offlineNotice);
        return;
      }
      setStatus('error');
      setError(err instanceof Error ? err.message : t.capture.failedVoice);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={() => void navigate(-1)}>
          <ArrowLeft size={18} aria-hidden="true" />
          {t.capture.back}
        </button>
        <span className={styles.title}>{t.capture.voiceEntry}</span>
      </div>
      <div className={styles.body}>
        {status === 'analyzing' && (
          <>
            <div className={styles.spinner} />
            <span className={styles.status}>{t.capture.transcribing}</span>
          </>
        )}
        {status === 'error' && error && <div className={styles.errorBox}>{error}</div>}
        {(status === 'idle' || status === 'recording' || status === 'error') && (
          <>
            <button
              type="button"
              className={`${styles.recordButton} ${status === 'recording' ? styles.recordButtonActive : ''}`}
              onClick={() => (status === 'recording' ? stopRecording() : void startRecording())}
            >
              {status === 'recording' ? <Square size={28} aria-hidden="true" /> : <Mic size={28} aria-hidden="true" />}
            </button>
            <span className={styles.status}>
              {status === 'recording' ? t.capture.recording(seconds) : t.capture.tapToRecord}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
