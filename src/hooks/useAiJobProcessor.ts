import { useEffect } from 'react';
import { db } from '@/db/db';
import { markJobDone, markJobError, markJobRunning } from '@/db/queries/aiJobs';
import { parseReceipt, parseText, parseVoice } from '@/lib/aiClient';
import { getDict } from '@/i18n';

async function processJob(job: { id: string; kind: string; inputText?: string; inputBlob?: Blob }): Promise<void> {
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
    } else {
      await markJobError(job.id, getDict().aiJobs.malformedJob);
    }
  } catch (err) {
    await markJobError(job.id, err instanceof Error ? err.message : getDict().aiJobs.failedToProcess);
  }
}

async function processQueuedJobs(): Promise<void> {
  if (!navigator.onLine) return;
  const queued = await db.aiJobs.where('status').equals('queued').toArray();
  for (const job of queued) {
    await processJob(job);
  }
}

export function useAiJobProcessor(): void {
  useEffect(() => {
    void processQueuedJobs();
    const handleOnline = () => void processQueuedJobs();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);
}
