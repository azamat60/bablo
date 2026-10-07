import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Trash2, X } from 'lucide-react';
import { useT } from '@/i18n';
import styles from './ConfirmDialog.module.css';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  error?: string;
  children?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  error,
  children,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div className={styles.content}>
        <button type="button" className={styles.close} aria-label={t.common.close} disabled={pending} onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
        <span className={styles.icon}>
          <Trash2 size={24} aria-hidden="true" />
        </span>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
        {children}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button ref={cancelRef} type="button" className={styles.cancel} disabled={pending} onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="button" className={styles.confirm} disabled={pending} onClick={onConfirm}>
            {pending ? t.deletion.deleting : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
