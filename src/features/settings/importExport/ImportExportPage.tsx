import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useAccounts } from '@/db/queries/accounts';
import { exportBackupJson, importBackupJson, importCsvTransactions } from '@/db/queries/backup';
import { parseCsvTransactions } from '@/domain/csv';
import { AccountPickerSheet } from '@/components/AccountPickerSheet';
import { useT } from '@/i18n';
import styles from './ImportExportPage.module.css';

export function ImportExportPage() {
  const navigate = useNavigate();
  const t = useT();
  const accounts = useAccounts();
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvAccountId, setCsvAccountId] = useState<string | undefined>();
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [pendingCsvFile, setPendingCsvFile] = useState<File | null>(null);

  const account = accounts.find((a) => a.id === csvAccountId) ?? accounts[0];

  const handleExportJson = async () => {
    const json = await exportBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bablo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(t.importExport.backupDownloaded);
    setError(null);
  };

  const handleImportJson = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      await importBackupJson(text);
      setStatus(t.importExport.backupRestored);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.importExport.failedRestore);
    }
  };

  const handleCsvFile = (file: File) => {
    setPendingCsvFile(file);
    if (!csvAccountId && accounts[0]) setCsvAccountId(accounts[0].id);
  };

  const runCsvImport = async () => {
    if (!pendingCsvFile || !account) return;
    setError(null);
    try {
      const text = await pendingCsvFile.text();
      const rows = parseCsvTransactions(text);
      if (rows.length === 0) {
        setError(t.importExport.noValidRows);
        return;
      }
      const result = await importCsvTransactions(account.id, account.currency, rows);
      setStatus(t.importExport.importedSummary(result.imported, result.skipped));
      setPendingCsvFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.importExport.failedImportCsv);
    }
  };

  return (
    <div className={styles.root}>
      <button type="button" className={styles.back} onClick={() => void navigate(-1)}>
        <ArrowLeft size={18} aria-hidden="true" />
        {t.importExport.back}
      </button>
      <h1 className={styles.title}>{t.importExport.title}</h1>

      <div className={styles.card}>
        <div className={styles.cardTitle}>{t.importExport.fullBackup}</div>
        <div className={styles.cardNote}>{t.importExport.fullBackupNote}</div>
        <button type="button" className={styles.button} onClick={() => void handleExportJson()}>
          {t.importExport.exportBackup}
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => jsonInputRef.current?.click()}>
          {t.importExport.restoreBackup}
        </button>
        <input
          ref={jsonInputRef}
          type="file"
          accept="application/json"
          className={styles.hiddenInput}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImportJson(file);
          }}
        />
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>{t.importExport.importCsv}</div>
        <div className={styles.cardNote}>{t.importExport.importCsvNote}</div>
        <button type="button" className={styles.fieldRow} onClick={() => setAccountPickerOpen(true)}>
          <span className={styles.fieldLabel}>{t.importExport.importInto}</span>
          <span className={styles.fieldValue}>{account?.name ?? t.importExport.chooseAccount}</span>
        </button>
        <button type="button" className={styles.button} onClick={() => csvInputRef.current?.click()}>
          {t.importExport.chooseCsvFile}
        </button>
        {pendingCsvFile && (
          <button type="button" className={styles.secondaryButton} onClick={() => void runCsvImport()}>
            {t.importExport.importFile(pendingCsvFile.name)}
          </button>
        )}
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className={styles.hiddenInput}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleCsvFile(file);
          }}
        />
      </div>

      {status && <div className={styles.statusText}>{status}</div>}
      {error && <div className={styles.errorText}>{error}</div>}

      <AccountPickerSheet
        open={accountPickerOpen}
        onClose={() => setAccountPickerOpen(false)}
        onSelect={(id) => {
          setCsvAccountId(id);
          setAccountPickerOpen(false);
        }}
      />
    </div>
  );
}
