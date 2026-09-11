import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useT } from '@/i18n';
import { useTextAi } from './ai/useTextAi';
import styles from './CapturePage.module.css';

/** Standalone free-text entry: parses a sentence, then hands the draft to the review page. */
export function TextAiPage() {
  const navigate = useNavigate();
  const t = useT();
  const [text, setText] = useState('');
  const ai = useTextAi();

  useEffect(() => {
    if (ai.status === 'done' && ai.result) {
      void navigate('/add/review', { state: { draft: ai.result.draft } });
    }
  }, [ai.status, ai.result, navigate]);

  const analyzing = ai.status === 'analyzing';
  const notice = ai.status === 'queued' ? t.capture.offlineNotice : ai.error;

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
          disabled={analyzing}
        />
        {analyzing && (
          <>
            <div className={styles.spinner} />
            <span className={styles.status}>{t.capture.thinking}</span>
          </>
        )}
        {notice && <div className={styles.errorBox}>{notice}</div>}
        <button
          type="button"
          className={styles.primaryButton}
          style={{ maxWidth: 320, width: '100%', flex: 'none' }}
          disabled={!text.trim() || analyzing}
          onClick={() => void ai.submitText(text)}
        >
          {t.capture.parseWithAi}
        </button>
      </div>
    </div>
  );
}
