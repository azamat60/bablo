import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { newMeta, touchMeta } from '@/db/meta';
import type { AiJob, AiJobKind } from '@/db/types';

export function useAiJobs(): AiJob[] {
  return (
    useLiveQuery(async () => {
      const jobs = await db.aiJobs.toArray();
      return jobs.filter((job) => !job.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
    }, []) ?? []
  );
}

export type NewAiJobInput = {
  kind: AiJobKind;
  inputText?: string;
  inputBlob?: Blob;
};

export async function enqueueAiJob(input: NewAiJobInput): Promise<string> {
  const job: AiJob = { ...newMeta(), status: 'queued', ...input };
  await db.aiJobs.add(job);
  return job.id;
}

export async function markJobRunning(id: string): Promise<void> {
  const job = await db.aiJobs.get(id);
  if (!job) return;
  await db.aiJobs.update(id, { status: 'running', ...touchMeta(job.rev) });
}

export async function markJobDone(id: string, resultDraft: unknown): Promise<void> {
  const job = await db.aiJobs.get(id);
  if (!job) return;
  await db.aiJobs.update(id, { status: 'done', resultDraft, ...touchMeta(job.rev) });
}

export async function markJobError(id: string, error: string): Promise<void> {
  const job = await db.aiJobs.get(id);
  if (!job) return;
  await db.aiJobs.update(id, { status: 'error', error, ...touchMeta(job.rev) });
}

export async function deleteAiJob(id: string): Promise<void> {
  await db.aiJobs.delete(id);
}
