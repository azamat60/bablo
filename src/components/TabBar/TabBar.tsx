import { NavLink } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { useT } from '@/i18n';
import { TABS } from './TabBar.constants';
import styles from './TabBar.module.css';

export function TabBar() {
  const t = useT();

  return (
    <nav className={styles.bar}>
      {TABS.map((tab) => (
        <TabLink key={tab.to} to={tab.to} label={t.tabs[tab.labelKey]} icon={tab.icon} />
      ))}
    </nav>
  );
}

function TabLink({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}>
      <Icon className={styles.icon} size={20} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </NavLink>
  );
}
