import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Mic, Square } from 'lucide-react';
import { useT } from '@/i18n';
import { useVoiceCapture } from './ai/useVoiceCapture';
import styles from './CapturePage.module.css';

/** Standalone voice entry: records, then hands the draft to the review page. */
export function VoiceCapturePage() {
  const navigate = useNavigate();
  const t = useT();
  const voice = useVoiceCapture();

  useEffect(() => {
    if (voice.status === 'done' && voice.result) {
      void navigate('/add/review', { state: { draft: voice.result.draft, transcript: voice.result.transcript } });
    }
  }, [voice.status, voice.result, navigate]);

  const recording = voice.status === 'recording';
  const notice = voice.status === 'queued' ? t.capture.offlineNotice : voice.error;

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
        {voice.status === 'analyzing' && (
          <>
            <div className={styles.spinner} />
            <span className={styles.status}>{t.capture.transcribing}</span>
          </>
        )}
        {notice && <div className={styles.errorBox}>{notice}</div>}
        {voice.status !== 'analyzing' && (
          <>
            <button
              type="button"
              className={`${styles.recordButton} ${recording ? styles.recordButtonActive : ''}`}
              onClick={() => (recording ? voice.stop() : void voice.start())}
            >
              {recording ? <Square size={28} aria-hidden="true" /> : <Mic size={28} aria-hidden="true" />}
            </button>
            <span className={styles.status}>
              {recording ? t.capture.recording(voice.seconds) : t.capture.tapToRecord}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
