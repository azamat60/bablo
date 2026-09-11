import { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { enqueueAiJob, type NewAiJobInput } from '@/db/queries/aiJobs';
import type { AiDraft } from '@/lib/aiTypes';
import type { AiJobKind } from '@/db/types';

export type AiParseStatus = 'idle' | 'analyzing' | 'queued' | 'done' | 'error';

export type AiParseResult = {
  draft: AiDraft;
  transcript?: string;
};

export type AiParseState = {
  status: AiParseStatus;
  error: string | null;
  result: AiParseResult | null;
  jobId: string | null;
  /**
   * Runs `run`; when it fails offline, queues `offlineInput` instead and
   * resolves the result later, once the background processor finishes it.
   */
  submit: (run: () => Promise<AiParseResult>, offlineInput: Omit<NewAiJobInput, 'kind'>) => Promise<void>;
  reset: () => void;
};

/**
 * The status machine every AI capture shares. The three capture pages used to
 * carry identical copies of it; the composer needs it too, so it lives here.
 */
export function useAiParse(kind: AiJobKind, fallbackError: string): AiParseState {
  const [local, setLocal] = useState<{ status: AiParseStatus; error: string | null; result: AiParseResult | null }>({
    status: 'idle',
    error: null,
    result: null,
  });
  const [jobId, setJobId] = useState<string | null>(null);

  // Follow a queued job so an offline capture completes in place when the
  // connection returns, instead of only surfacing on the /ai-jobs page. The
  // outcome is derived from the live row rather than copied into state.
  const job = useLiveQuery(() => (jobId ? db.aiJobs.get(jobId) : undefined), [jobId]);
  const fromJob: Partial<typeof local> =
    local.status === 'queued' && job?.status === 'done' && job.resultDraft
      ? { status: 'done', result: { draft: job.resultDraft as AiDraft } }
      : local.status === 'queued' && job?.status === 'error'
        ? { status: 'error', error: job.error ?? fallbackError }
        : {};

  const submit = useCallback<AiParseState['submit']>(
    async (run, offlineInput) => {
      setLocal({ status: 'analyzing', error: null, result: null });
      try {
        const next = await run();
        setLocal({ status: 'done', error: null, result: next });
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const id = await enqueueAiJob({ kind, ...offlineInput });
          setJobId(id);
          setLocal({ status: 'queued', error: null, result: null });
          return;
        }
        setLocal({
          status: 'error',
          error: err instanceof Error && err.message ? err.message : fallbackError,
          result: null,
        });
      }
    },
    [kind, fallbackError],
  );

  const reset = useCallback(() => {
    setLocal({ status: 'idle', error: null, result: null });
    setJobId(null);
  }, []);

  return { ...local, ...fromJob, jobId, submit, reset };
}
