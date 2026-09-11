import { ChevronsLeft, ChevronsRight, Plus } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import type { ReactNode } from 'react';
import styles from './Composer.module.css';

export type EndpointView = {
  label: string;
  name: string;
  color?: string;
  icon?: string;
  /** Balance line under an account circle. */
  sub?: string;
  onClick: () => void;
};

function Endpoint({ view }: { view: EndpointView }) {
  return (
    <button type="button" className={styles.endpoint} onClick={view.onClick}>
      <span className={styles.endpointLabel}>{view.label}</span>
      <span className={styles.endpointName}>{view.name}</span>
      <span
        className={`${styles.endpointCircle} ${view.color ? '' : styles.endpointEmpty}`}
        style={view.color ? { background: view.color } : undefined}
      >
        {view.color ? <AppIcon name={view.icon} size={20} /> : <Plus size={18} aria-hidden="true" />}
      </span>
      {view.sub && <span className={styles.endpointSub}>{view.sub}</span>}
    </button>
  );
}

export type ComposerEndpointsProps = {
  left: EndpointView;
  right: EndpointView;
  /**
   * Which way value flows. 'right' means money leaves the left endpoint, which
   * is what an expense and a transfer look like.
   */
  direction: 'left' | 'right';
};

export function ComposerEndpoints({ left, right, direction }: ComposerEndpointsProps) {
  const arrow: ReactNode =
    direction === 'right' ? (
      <ChevronsRight size={22} aria-hidden="true" />
    ) : (
      <ChevronsLeft size={22} aria-hidden="true" />
    );

  return (
    <div className={styles.endpoints}>
      <Endpoint view={left} />
      <span className={styles.arrow}>{arrow}</span>
      <Endpoint view={right} />
    </div>
  );
}
