import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { Bot } from 'lucide-react';
import { TabBar } from '@/components/TabBar';
import { useSettings } from '@/db/queries/settings';
import { useAiJobs } from '@/db/queries/aiJobs';
import { useAiJobProcessor } from '@/hooks/useAiJobProcessor';
import { useRecurringProcessor } from '@/hooks/useRecurringProcessor';
import { useThemeSync } from '@/hooks/useThemeSync';
import { useLocaleSync } from '@/hooks/useLocaleSync';
import { useT } from '@/i18n';
import styles from './App.module.css';

const CHROMELESS_PREFIXES = ['/settings/', '/add', '/onboarding', '/accounts/', '/transactions/', '/ai-jobs'];
const NO_FAB_PREFIXES = ['/settings', '/savings'];

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const settings = useSettings();
  const aiJobs = useAiJobs();
  const t = useT();
  useAiJobProcessor();
  useRecurringProcessor();
  useThemeSync(settings?.theme);
  useLocaleSync(settings?.locale);

  useEffect(() => {
    if (!settings) return;
    const onOnboarding = location.pathname === '/onboarding';
    if (!settings.onboardingComplete && !onOnboarding) {
      void navigate('/onboarding', { replace: true });
    } else if (settings.onboardingComplete && onOnboarding) {
      void navigate('/', { replace: true });
    }
  }, [settings, location.pathname, navigate]);

  if (!settings) return null;

  const showChrome = !CHROMELESS_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
  const showFab = showChrome && !NO_FAB_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
  const pendingJobs = aiJobs.length;

  return (
    <div className={styles.shell}>
      {showChrome && pendingJobs > 0 && (
        <Link to="/ai-jobs" className={styles.aiJobsButton} aria-label={t.app.aiCaptureQueue}>
          <Bot size={18} aria-hidden="true" />
          <span className={styles.aiJobsBadge}>{pendingJobs}</span>
        </Link>
      )}
      <div className={styles.content}>
        <Outlet />
      </div>
      {showChrome && <TabBar showFab={showFab} />}
    </div>
  );
}
