import { useNavigate } from 'react-router';
import { Sheet } from '@/components/Sheet';
import { useT } from '@/i18n';
import { CAPTURE_ENTRIES } from './AiCaptureSheet.constants';
import styles from './AiCaptureSheet.module.css';

export type AiCaptureSheetProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * The entry point to receipt / voice / free-text capture.
 *
 * These used to be buried in the FAB's radial menu, which drag-to-create
 * replaced; AI capture is a headline feature and now gets its own affordance.
 */
export function AiCaptureSheet({ open, onClose }: AiCaptureSheetProps) {
  const t = useT();
  const navigate = useNavigate();

  return (
    <Sheet open={open} onClose={onClose} title={t.app.aiCaptureQueue}>
      <div className={styles.list}>
        {CAPTURE_ENTRIES.map(({ to, labelKey, icon: Icon, ai }) => (
          <button
            key={to}
            type="button"
            className={styles.row}
            onClick={() => {
              onClose();
              void navigate(to);
            }}
          >
            <span className={`${styles.icon} ${ai ? styles.iconAi : ''}`}>
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className={styles.label}>{t.fab[labelKey]}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
