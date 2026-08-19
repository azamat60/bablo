import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useT } from '@/i18n';
import styles from './PlaceholderPage.module.css';

type PlaceholderPageProps = {
  title: string;
  note: string;
  showBack?: boolean;
};

export function PlaceholderPage({ title, note, showBack }: PlaceholderPageProps) {
  const navigate = useNavigate();
  const t = useT();

  return (
    <div className={styles.root}>
      {showBack && (
        <button type="button" className={styles.back} onClick={() => void navigate(-1)}>
          <ArrowLeft size={18} aria-hidden="true" />
          {t.common.back}
        </button>
      )}
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.note}>{note}</p>
    </div>
  );
}
