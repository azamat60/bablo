import { createBrowserRouter } from 'react-router';
import { App } from '@/App';
import { DashboardPage } from '@/features/dashboard';
import { BudgetPage } from '@/features/budget';
import { AccountsPage, AccountLedgerPage } from '@/features/accounts';
import { TransactionsPage } from '@/features/transactions';
import { ReportsPage } from '@/features/reports';
import { SettingsPage } from '@/features/settings';
import { CategoriesPage } from '@/features/settings/categories';
import { RecurringPage } from '@/features/settings/recurring';
import { ImportExportPage } from '@/features/settings/importExport';
import { RatesPage } from '@/features/settings/rates';
import {
  ComposerPage,
  SeededComposerRoute,
  EditTransactionRoute,
  PhotoCapturePage,
  VoiceCapturePage,
  TextAiPage,
  ReviewDraftPage,
  AiJobsPage,
} from '@/features/add';
import { OnboardingPage } from '@/features/onboarding';
import { SavingsPage } from '@/features/savings';
import { GroupDetailPage } from '@/features/groups';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'budget', element: <BudgetPage /> },
      { path: 'accounts', element: <AccountsPage /> },
      { path: 'accounts/:id', element: <AccountLedgerPage /> },
      { path: 'groups/:id', element: <GroupDetailPage /> },
      { path: 'transactions', element: <TransactionsPage /> },
      { path: 'transactions/:id', element: <EditTransactionRoute /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/categories', element: <CategoriesPage /> },
      { path: 'settings/recurring', element: <RecurringPage /> },
      { path: 'settings/rates', element: <RatesPage /> },
      { path: 'settings/import-export', element: <ImportExportPage /> },
      { path: 'onboarding', element: <OnboardingPage /> },
      { path: 'add/tx', element: <ComposerPage /> },
      { path: 'add/expense', element: <SeededComposerRoute kind="expense" /> },
      { path: 'add/income', element: <SeededComposerRoute kind="income" /> },
      { path: 'add/transfer', element: <SeededComposerRoute kind="transfer" /> },
      { path: 'add/photo', element: <PhotoCapturePage /> },
      { path: 'add/voice', element: <VoiceCapturePage /> },
      { path: 'add/text-ai', element: <TextAiPage /> },
      { path: 'add/review', element: <ReviewDraftPage /> },
      { path: 'ai-jobs', element: <AiJobsPage /> },
      { path: 'savings', element: <SavingsPage /> },
    ],
  },
]);
