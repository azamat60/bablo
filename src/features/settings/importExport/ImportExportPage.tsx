import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { ArrowLeft } from 'lucide-react';
import { useAccounts } from '@/db/queries/accounts';
import {
  exportBackupJson,
  importBackupJson,
  importCsvTransactions,
  restorePreviousBackup,
  MAX_BACKUP_BYTES,
} from '@/db/queries/backup';
import { parseCsvTransactions } from '@/domain/csv';
import { AccountPickerSheet } from '@/components/AccountPickerSheet';
import { useT } from '@/i18n';
import { getActiveLocale } from '@/i18n/state';
import styles from './ImportExportPage.module.css';

const COPY = {
  ru: {
    note: 'Полная копия сохраняет бюджет и вложения. Восстановление заменяет данные; предыдущая копия остаётся доступной для отмены. Максимум файла — 50 МБ.',
    confirm: 'Заменить бюджет выбранной копией?',
    replace: 'Да, заменить бюджет',
    undo: 'Вернуть предыдущий бюджет',
    restoredPrevious: 'Предыдущий бюджет восстановлен.',
    busy: 'Обработка…',
    fileTooLarge: 'Размер файла не должен превышать 50 МБ.',
    csvLimit: 'Максимум — 50 МБ и 10 000 операций. Неверные строки исключаются; проверьте результат импорта.',
  },
  en: {
    note: 'A full backup includes your budget and attachments. Restore replaces current data and keeps a copy for undo. Maximum file size: 50 MB.',
    confirm: 'Replace your budget with the selected backup?',
    replace: 'Yes, replace budget',
    undo: 'Restore previous budget',
    restoredPrevious: 'Previous budget restored.',
    busy: 'Processing…',
    fileTooLarge: 'File size must not exceed 50 MB.',
    csvLimit: 'Maximum: 50 MB and 10,000 transactions. Invalid rows are excluded; review the imported transactions.',
  },
} as const;

export function ImportExportPage() {
  const navigate = useNavigate();
  const t = useT();
  const copy = COPY[getActiveLocale()];
  const accounts = useAccounts();
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvAccountId, setCsvAccountId] = useState<string | undefined>();
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [pendingCsvFile, setPendingCsvFile] = useState<File | null>(null);
  const [pendingJsonFile, setPendingJsonFile] = useState<File | null>(null);
  const canUndoRestore =
    useLiveQuery(async () => {
      const previous: unknown = await db.table('cloudMeta').get('restoreBackup');
      return !!previous;
    }, []) ?? false;

  const account = accounts.find((a) => a.id === csvAccountId) ?? accounts[0];

  const runOperation = async (operation: () => Promise<void>, fallback: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await operation();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleExportJson = () =>
    runOperation(async () => {
      const json = await exportBackupJson();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `bablo-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(t.importExport.backupDownloaded);
    }, t.importExport.failedRestore);

  const handleImportJson = () => {
    if (!pendingJsonFile) return;
    return runOperation(async () => {
      const text = await pendingJsonFile.text();
      await importBackupJson(text);
      setPendingJsonFile(null);
      setStatus(t.importExport.backupRestored);
    }, t.importExport.failedRestore);
  };

  const handleUndoRestore = () =>
    runOperation(async () => {
      await restorePreviousBackup();
      setStatus(copy.restoredPrevious);
    }, t.importExport.failedRestore);

  const chooseFile = (file: File, kind: 'json' | 'csv') => {
    if (busyRef.current) return;
    setStatus(null);
    if (file.size > MAX_BACKUP_BYTES) {
      setError(copy.fileTooLarge);
      return;
    }
    setError(null);
    if (kind === 'json') setPendingJsonFile(file);
    else {
      setPendingCsvFile(file);
      if (!csvAccountId && accounts[0]) setCsvAccountId(accounts[0].id);
    }
  };

  const runCsvImport = () => {
    if (!pendingCsvFile || !account) return;
    return runOperation(async () => {
      const rows = parseCsvTransactions(await pendingCsvFile.text());
      if (rows.length === 0) throw new Error(t.importExport.noValidRows);
      const result = await importCsvTransactions(account.id, account.currency, rows);
      setStatus(t.importExport.importedSummary(result.imported, result.skipped));
      setPendingCsvFile(null);
    }, t.importExport.failedImportCsv);
  };

  return (
    <div className={styles.root} aria-busy={busy}>
      <button type="button" className={styles.back} disabled={busy} onClick={() => void navigate(-1)}>
        <ArrowLeft size={18} aria-hidden="true" />
        {t.importExport.back}
      </button>
      <h1 className={styles.title}>{t.importExport.title}</h1>

      <div className={styles.card}>
        <div className={styles.cardTitle}>{t.importExport.fullBackup}</div>
        <div className={styles.cardNote}>{copy.note}</div>
        <button type="button" className={styles.button} disabled={busy} onClick={() => void handleExportJson()}>
          {t.importExport.exportBackup}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={busy}
          onClick={() => jsonInputRef.current?.click()}
        >
          {t.importExport.restoreBackup}
        </button>
        {pendingJsonFile && (
          <div role="group" aria-label={copy.confirm}>
            <p className={styles.cardNote}>
              {copy.confirm} {pendingJsonFile.name}
            </p>
            <button type="button" className={styles.button} disabled={busy} onClick={() => void handleImportJson()}>
              {copy.replace}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={busy}
              onClick={() => setPendingJsonFile(null)}
            >
              {t.common.cancel}
            </button>
          </div>
        )}
        {canUndoRestore && (
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy}
            onClick={() => void handleUndoRestore()}
          >
            {copy.undo}
          </button>
        )}
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          disabled={busy}
          className={styles.hiddenInput}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) chooseFile(file, 'json');
            event.target.value = '';
          }}
        />
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>{t.importExport.importCsv}</div>
        <div className={styles.cardNote}>
          {t.importExport.importCsvNote} {copy.csvLimit}
        </div>
        <button type="button" className={styles.fieldRow} disabled={busy} onClick={() => setAccountPickerOpen(true)}>
          <span className={styles.fieldLabel}>{t.importExport.importInto}</span>
          <span className={styles.fieldValue}>{account?.name ?? t.importExport.chooseAccount}</span>
        </button>
        <button type="button" className={styles.button} disabled={busy} onClick={() => csvInputRef.current?.click()}>
          {t.importExport.chooseCsvFile}
        </button>
        {pendingCsvFile && (
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy || !account}
            onClick={() => void runCsvImport()}
          >
            {t.importExport.importFile(pendingCsvFile.name)}
          </button>
        )}
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          className={styles.hiddenInput}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) chooseFile(file, 'csv');
            event.target.value = '';
          }}
        />
      </div>

      {busy && (
        <div className={styles.statusText} role="status">
          {copy.busy}
        </div>
      )}
      {status && (
        <div className={styles.statusText} role="status">
          {status}
        </div>
      )}
      {error && (
        <div className={styles.errorText} role="alert">
          {error}
        </div>
      )}

      <AccountPickerSheet
        open={accountPickerOpen}
        onClose={() => setAccountPickerOpen(false)}
        onSelect={(id) => {
          if (busyRef.current) return;
          setCsvAccountId(id);
          setAccountPickerOpen(false);
        }}
      />
    </div>
  );
}
