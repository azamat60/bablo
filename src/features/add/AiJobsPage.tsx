import { useNavigate } from 'react-router';
import { ArrowLeft, Camera, Mic, Keyboard, type LucideIcon } from 'lucide-react';
import { useAiJobs, deleteAiJob, markJobRunning, markJobError, markJobDone } from '@/db/queries/aiJobs';
import { parseReceipt, parseText, parseVoice } from '@/lib/aiClient';
import { useT } from '@/i18n';
import type { AiJob } from '@/db/types';
import type { AiDraft } from '@/lib/aiTypes';
import styles from './AiJobsPage.module.css';

const KIND_ICON: Record<AiJob['kind'], LucideIcon> = { receipt: Camera, voice: Mic, text: Keyboard };

export function AiJobsPage() {
  const jobs = useAiJobs();
  const navigate = useNavigate();
  const t = useT();
  const STATUS_LABEL: Record<AiJob['status'], string> = {
    queued: t.aiJobs.statusQueued,
    running: t.aiJobs.statusRunning,
    done: t.aiJobs.statusDone,
    error: t.aiJobs.statusError,
  };

  const retry = async (job: AiJob) => {
    await markJobRunning(job.id);
    try {
      if (job.kind === 'receipt' && job.inputText) {
        const draft = await parseReceipt(job.inputText);
        await markJobDone(job.id, draft);
      } else if (job.kind === 'voice' && job.inputBlob) {
        const { draft } = await parseVoice(job.inputBlob);
        await markJobDone(job.id, draft);
      } else if (job.kind === 'text' && job.inputText) {
        const draft = await parseText(job.inputText);
        await markJobDone(job.id, draft);
      }
    } catch (err) {
      await markJobError(job.id, err instanceof Error ? err.message : t.aiJobs.failedToProcess);
    }
  };

  const review = (job: AiJob) => {
    void navigate('/add/review', { state: { draft: job.resultDraft as AiDraft, source: job.kind, jobId: job.id } });
  };

  return (
    <div className={styles.root}>
      <button type="button" className={styles.back} onClick={() => void navigate(-1)}>
        <ArrowLeft size={18} aria-hidden="true" />
        {t.aiJobs.back}
      </button>
      <h1 className={styles.title}>{t.aiJobs.title}</h1>
      {jobs.length === 0 ? (
        <div className={styles.emptyState}>{t.aiJobs.empty}</div>
      ) : (
        <div className={styles.list}>
          {jobs.map((job) => {
            const KindIcon = KIND_ICON[job.kind];
            return (
              <div className={styles.card} key={job.id}>
                <div className={styles.cardTop}>
                  <KindIcon className={styles.kindIcon} size={18} aria-hidden="true" />
                  <span className={styles.kindLabel}>{job.kind}</span>
                  <span className={`${styles.statusBadge} ${job.status === 'error' ? styles.statusError : ''}`}>
                    {STATUS_LABEL[job.status]}
                  </span>
                </div>
                {job.status === 'error' && job.error && <div className={styles.errorText}>{job.error}</div>}
                <div className={styles.actions}>
                  {job.status === 'done' && (
                    <button type="button" className={styles.actionButton} onClick={() => review(job)}>
                      {t.aiJobs.review}
                    </button>
                  )}
                  {(job.status === 'error' || job.status === 'queued') && (
                    <button type="button" className={styles.actionButton} onClick={() => void retry(job)}>
                      {t.aiJobs.retryNow}
                    </button>
                  )}
                  <button type="button" className={styles.actionButton} onClick={() => void deleteAiJob(job.id)}>
                    {t.aiJobs.discard}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
