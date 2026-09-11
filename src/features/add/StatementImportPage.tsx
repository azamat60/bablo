import { useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, FileText } from 'lucide-react';
import { parseStatement } from '@/lib/aiClient';
import { useT } from '@/i18n';
import type { StatementReviewLocationState } from './StatementReviewPage.types';
import styles from './CapturePage.module.css';

const PDF_TYPE = 'application/pdf';
const MAX_BYTES = 4 * 1024 * 1024;

type Status = 'idle' | 'analyzing';

/** Picks a PDF statement, sends it for parsing and hands the result to the review page. */
export function StatementImportPage() {
  const navigate = useNavigate();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const validate = (file: File): string | null => {
    const isPdf = file.type === PDF_TYPE || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) return t.capture.statementNotPdf;
    if (file.size > MAX_BYTES) return t.capture.statementTooLarge;
    if (!navigator.onLine) return t.capture.statementOffline;
    return null;
  };

  const handleFile = async (file: File) => {
    const problem = validate(file);
    setFileName(file.name);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStatus('analyzing');
    try {
      const statement = await parseStatement(file);
      const state: StatementReviewLocationState = { statement, fileName: file.name };
      void navigate('/add/statement/review', { state, replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.capture.failedStatement);
      setStatus('idle');
    }
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void handleFile(file);
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={() => void navigate(-1)}>
          <ArrowLeft size={18} aria-hidden="true" />
          {t.capture.back}
        </button>
        <span className={styles.title}>{t.capture.statementTitle}</span>
      </div>
      <div className={styles.body}>
        {status === 'analyzing' ? (
          <>
            <div className={styles.spinner} />
            <span className={styles.status}>{t.capture.readingStatement}</span>
            {fileName && <span className={styles.status}>{fileName}</span>}
          </>
        ) : (
          <>
            <span className={styles.status}>{t.capture.statementHint}</span>
            {error && <div className={styles.errorBox}>{error}</div>}
            <button type="button" className={styles.actionButton} onClick={() => inputRef.current?.click()}>
              <FileText className={styles.actionIcon} size={20} aria-hidden="true" />
              <span className={styles.actionLabel}>{t.capture.choosePdf}</span>
            </button>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="file"
        accept="application/pdf,.pdf"
        onChange={onChange}
      />
    </div>
  );
}
