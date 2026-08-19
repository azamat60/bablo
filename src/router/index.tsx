import { createBrowserRouter } from 'react-router';
import { App } from '@/App';
import { HomePage } from '@/features/home';
import { BudgetPage } from '@/features/budget';
import { AccountsPage, AccountLedgerPage } from '@/features/accounts';
import { TransactionsPage, EditTransactionRoute } from '@/features/transactions';
import { ReportsPage } from '@/features/reports';
import { SettingsPage } from '@/features/settings';
import { CategoriesPage } from '@/features/settings/categories';
import { RecurringPage } from '@/features/settings/recurring';
import { ImportExportPage } from '@/features/settings/importExport';
import {
  TransactionForm,
  TransferForm,
  PhotoCapturePage,
  VoiceCapturePage,
  TextAiPage,
  ReviewDraftPage,
  AiJobsPage,
} from '@/features/add';
import { OnboardingPage } from '@/features/onboarding';
import { SavingsPage } from '@/features/savings';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'budget', element: <BudgetPage /> },
      { path: 'accounts', element: <AccountsPage /> },
      { path: 'accounts/:id', element: <AccountLedgerPage /> },
      { path: 'transactions', element: <TransactionsPage /> },
      { path: 'transactions/:id', element: <EditTransactionRoute /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/categories', element: <CategoriesPage /> },
      { path: 'settings/recurring', element: <RecurringPage /> },
      { path: 'settings/import-export', element: <ImportExportPage /> },
      { path: 'onboarding', element: <OnboardingPage /> },
      { path: 'add/expense', element: <TransactionForm direction="expense" /> },
      { path: 'add/income', element: <TransactionForm direction="income" /> },
      { path: 'add/transfer', element: <TransferForm /> },
      { path: 'add/photo', element: <PhotoCapturePage /> },
      { path: 'add/voice', element: <VoiceCapturePage /> },
      { path: 'add/text-ai', element: <TextAiPage /> },
      { path: 'add/review', element: <ReviewDraftPage /> },
      { path: 'ai-jobs', element: <AiJobsPage /> },
      { path: 'savings', element: <SavingsPage /> },
    ],
  },
]);
