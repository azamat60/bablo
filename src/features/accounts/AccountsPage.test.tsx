// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import type { Account } from '@/db/types';
import { formatMoney } from '@/domain/money';
import { usePrivacyStore } from '@/store/privacy';
import { DeletionProvider } from '@/components/DeletionProvider';
import { AccountsPage } from './AccountsPage';
import styles from './AccountsPage.module.css';

let root: Root;
let container: HTMLDivElement;

function account(id: string, openingBalance: number, type: Account['type'] = 'cash'): Account {
  return {
    id,
    openingBalance,
    type,
    currency: 'KGS',
    name: id,
    color: '#fff',
    icon: 'wallet',
    order: 0,
    archived: false,
    deleted: false,
    rev: 1,
    updatedAt: 1,
  };
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await db.delete();
  await db.open();
  await db.settings.add({
    id: 'singleton',
    baseCurrency: 'KGS',
    locale: 'ru',
    theme: 'dark',
    aiModel: 'test',
    onboardingComplete: true,
    flags: {},
    firstDayOfMonth: 1,
  });
  await db.accounts.bulkAdd([account('cash', 100000), account('card', 200000, 'debit_card')]);
  usePrivacyStore.setState({ hideAmounts: false });
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(async () => {
  act(() => root.unmount());
  await db.delete();
  vi.unstubAllGlobals();
});

async function renderPage(debt: number) {
  await db.accounts.add(account('friend', debt, 'debt'));
  act(() =>
    root.render(
      <MemoryRouter>
        <DeletionProvider>
          <AccountsPage />
        </DeletionProvider>
      </MemoryRouter>,
    ),
  );
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('a[href="/debts"]')?.textContent).toContain(formatMoney(debt, 'KGS'));
  });
}

describe('Accounts page balance card', () => {
  it.each([-450000, 450000])('excludes personal debt %i and keeps its separate row', async (debt) => {
    await renderPage(debt);
    expect(container.querySelector(`.${styles.heroLabel}`)?.textContent).toBe('Всего на счетах');
    expect(container.querySelector(`.${styles.heroValue}`)?.textContent).toBe(formatMoney(300000, 'KGS'));
    expect(container.querySelector(`.${styles.splitValue}`)?.textContent).toBe(formatMoney(300000, 'KGS'));
  });

  it('continues counting negative wallet balances', async () => {
    await db.accounts.add(account('credit', -20000, 'credit_card'));
    await renderPage(-450000);
    expect(container.querySelector(`.${styles.heroValue}`)?.textContent).toBe(formatMoney(280000, 'KGS'));
    expect(
      Array.from(container.querySelectorAll(`.${styles.splitValue}`)).map((element) => element.textContent),
    ).toEqual([formatMoney(300000, 'KGS'), formatMoney(20000, 'KGS')]);
  });
});
