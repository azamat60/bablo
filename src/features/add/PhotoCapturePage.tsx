import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Camera, Image } from 'lucide-react';
import { downscaleImageToDataUrl } from '@/domain/image';
import { parseReceipt } from '@/lib/aiClient';
import { enqueueAiJob } from '@/db/queries/aiJobs';
import { useT } from '@/i18n';
import styles from './CapturePage.module.css';

type Status = 'idle' | 'analyzing' | 'error';

export function PhotoCapturePage() {
  const navigate = useNavigate();
  const t = useT();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setStatus('analyzing');
    setError(null);
    const imageDataUrl = await downscaleImageToDataUrl(file);
    setPreview(imageDataUrl);
    try {
      const draft = await parseReceipt(imageDataUrl);
      void navigate('/add/review', { state: { draft } });
    } catch (err) {
      if (!navigator.onLine) {
        await enqueueAiJob({ kind: 'receipt', inputText: imageDataUrl });
        setStatus('error');
        setError(t.capture.offlineNotice);
        return;
      }
      setStatus('error');
      setError(err instanceof Error ? err.message : t.capture.failedReceipt);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={() => void navigate(-1)}>
          <ArrowLeft size={18} aria-hidden="true" />
          {t.capture.back}
        </button>
        <span className={styles.title}>{t.capture.scanReceipt}</span>
      </div>
      <div className={styles.body}>
        {preview && <img className={styles.preview} src={preview} alt={t.capture.receiptAlt} />}
        {status === 'analyzing' && (
          <>
            <div className={styles.spinner} />
            <span className={styles.status}>{t.capture.readingReceipt}</span>
          </>
        )}
        {status === 'error' && error && <div className={styles.errorBox}>{error}</div>}
        {status !== 'analyzing' && (
          <>
            <button type="button" className={styles.actionButton} onClick={() => cameraInputRef.current?.click()}>
              <Camera className={styles.actionIcon} size={20} aria-hidden="true" />
              <span className={styles.actionLabel}>{t.capture.takePhoto}</span>
            </button>
            <button type="button" className={styles.actionButton} onClick={() => galleryInputRef.current?.click()}>
              <Image className={styles.actionIcon} size={20} aria-hidden="true" />
              <span className={styles.actionLabel}>{t.capture.chooseFromGallery}</span>
            </button>
          </>
        )}
      </div>
      <input
        ref={cameraInputRef}
        className={styles.hiddenInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <input
        ref={galleryInputRef}
        className={styles.hiddenInput}
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
