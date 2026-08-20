import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { useT } from '@/i18n';
import { FAB_ACTIONS } from './Fab.constants';
import styles from './Fab.module.css';

export function Fab() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      {open && (
        <>
          <button type="button" className={styles.scrim} aria-label={t.fab.closeAria} onClick={() => setOpen(false)} />
          <ul className={styles.menu}>
            {FAB_ACTIONS.map((action) => (
              <li key={action.to}>
                <button type="button" className={styles.action} onClick={() => void navigate(action.to)}>
                  <action.icon className={styles.actionIcon} size={20} aria-hidden="true" />
                  <span>{t.fab[action.labelKey]}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-label={open ? t.fab.closeAria : t.fab.openAria}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Plus size={28} aria-hidden="true" />
      </button>
    </div>
  );
}
