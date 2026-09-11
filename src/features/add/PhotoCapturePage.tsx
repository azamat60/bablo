import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Camera, Image } from 'lucide-react';
import { useT } from '@/i18n';
import { usePhotoCapture } from './ai/usePhotoCapture';
import styles from './CapturePage.module.css';

/** Standalone receipt scan: picks an image, then hands the draft to the review page. */
export function PhotoCapturePage() {
  const navigate = useNavigate();
  const t = useT();
  const photo = usePhotoCapture();

  useEffect(() => {
    if (photo.status === 'done' && photo.result) {
      void navigate('/add/review', { state: { draft: photo.result.draft } });
    }
  }, [photo.status, photo.result, navigate]);

  const notice = photo.status === 'queued' ? t.capture.offlineNotice : photo.error;

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
        {photo.preview && <img className={styles.preview} src={photo.preview} alt={t.capture.receiptAlt} />}
        {photo.status === 'analyzing' && (
          <>
            <div className={styles.spinner} />
            <span className={styles.status}>{t.capture.readingReceipt}</span>
          </>
        )}
        {notice && <div className={styles.errorBox}>{notice}</div>}
        {photo.status !== 'analyzing' && (
          <>
            <button type="button" className={styles.actionButton} onClick={photo.openCamera}>
              <Camera className={styles.actionIcon} size={20} aria-hidden="true" />
              <span className={styles.actionLabel}>{t.capture.takePhoto}</span>
            </button>
            <button type="button" className={styles.actionButton} onClick={photo.openGallery}>
              <Image className={styles.actionIcon} size={20} aria-hidden="true" />
              <span className={styles.actionLabel}>{t.capture.chooseFromGallery}</span>
            </button>
          </>
        )}
      </div>
      <input className={styles.hiddenInput} type="file" accept="image/*" capture="environment" {...photo.cameraInput} />
      <input className={styles.hiddenInput} type="file" accept="image/*" {...photo.galleryInput} />
    </div>
  );
}
