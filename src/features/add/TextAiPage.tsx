import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { parseText } from '@/lib/aiClient';
import { enqueueAiJob } from '@/db/queries/aiJobs';
import { useT } from '@/i18n';
import styles from './CapturePage.module.css';

export function TextAiPage() {
  const navigate = useNavigate();
  const t = useT();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!text.trim()) return;
    setStatus('analyzing');
    setError(null);
    try {
      const draft = await parseText(text.trim());
      void navigate('/add/review', { state: { draft } });
    } catch (err) {
      if (!navigator.onLine) {
        await enqueueAiJob({ kind: 'text', inputText: text.trim() });
        setStatus('error');
        setError(t.capture.offlineNotice);
        return;
      }
      setStatus('error');
      setError(err instanceof Error ? err.message : t.capture.failedText);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={() => void navigate(-1)}>
          <ArrowLeft size={18} aria-hidden="true" />
          {t.capture.back}
        </button>
        <span className={styles.title}>{t.capture.quickAdd}</span>
      </div>
      <div className={styles.body}>
        <textarea
          className={styles.textInput}
          placeholder={t.capture.textPlaceholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={status === 'analyzing'}
        />
        {status === 'analyzing' && (
          <>
            <div className={styles.spinner} />
            <span className={styles.status}>{t.capture.thinking}</span>
          </>
        )}
        {status === 'error' && error && <div className={styles.errorBox}>{error}</div>}
        <button
          type="button"
          className={styles.primaryButton}
          style={{ maxWidth: 320, width: '100%', flex: 'none' }}
          disabled={!text.trim() || status === 'analyzing'}
          onClick={() => void handleParse()}
        >
          {t.capture.parseWithAi}
        </button>
      </div>
    </div>
  );
}
