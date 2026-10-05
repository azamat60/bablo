import { useCallback, useEffect, useRef, useState } from 'react';
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
  submit: (
    run: (signal: AbortSignal) => Promise<AiParseResult>,
    offlineInput: Omit<NewAiJobInput, 'kind'>,
  ) => Promise<void>;
  cancel: () => void;
  reset: () => void;
};

type ActiveParse = { controller: AbortController; generation: number };

export function useAiParse(kind: AiJobKind, fallbackError: string): AiParseState {
  const [local, setLocal] = useState<{ status: AiParseStatus; error: string | null; result: AiParseResult | null }>({
    status: 'idle',
    error: null,
    result: null,
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const activeRef = useRef<ActiveParse | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      activeRef.current?.controller.abort();
      activeRef.current = null;
    };
  }, []);

  const job = useLiveQuery(() => (jobId ? db.aiJobs.get(jobId) : undefined), [jobId]);
  const fromJob: Partial<typeof local> =
    local.status === 'queued' && job?.status === 'done' && job.resultDraft
      ? { status: 'done', result: { draft: job.resultDraft as AiDraft } }
      : local.status === 'queued' && job?.status === 'error'
        ? { status: 'error', error: job.error ?? fallbackError }
        : {};

  const submit = useCallback<AiParseState['submit']>(
    async (run, offlineInput) => {
      if (activeRef.current || !mountedRef.current) return;
      const active = { controller: new AbortController(), generation: ++generationRef.current };
      activeRef.current = active;
      const isCurrent = () =>
        mountedRef.current &&
        activeRef.current === active &&
        generationRef.current === active.generation &&
        !active.controller.signal.aborted;
      setJobId(null);
      setLocal({ status: 'analyzing', error: null, result: null });
      try {
        const next = await run(active.controller.signal);
        if (isCurrent()) setLocal({ status: 'done', error: null, result: next });
      } catch (err) {
        if (!isCurrent()) return;
        if (err instanceof Error && err.name === 'AbortError') {
          setLocal({ status: 'idle', error: null, result: null });
          return;
        }
        const networkFailure = err instanceof TypeError || (err instanceof Error && err.name === 'NetworkError');
        if (networkFailure && typeof navigator !== 'undefined' && !navigator.onLine) {
          try {
            const id = await enqueueAiJob({ kind, ...offlineInput });
            if (!isCurrent()) {
              await db.aiJobs.delete(id);
              return;
            }
            setJobId(id);
            setLocal({ status: 'queued', error: null, result: null });
            return;
          } catch (queueError) {
            if (isCurrent()) {
              setLocal({
                status: 'error',
                error: queueError instanceof Error && queueError.message ? queueError.message : fallbackError,
                result: null,
              });
            }
            return;
          }
        }
        setLocal({
          status: 'error',
          error: err instanceof Error && err.message ? err.message : fallbackError,
          result: null,
        });
      } finally {
        if (activeRef.current === active) activeRef.current = null;
      }
    },
    [kind, fallbackError],
  );

  const cancel = useCallback(() => {
    generationRef.current += 1;
    activeRef.current?.controller.abort();
    activeRef.current = null;
    if (mountedRef.current) {
      setLocal({ status: 'idle', error: null, result: null });
      setJobId(null);
    }
  }, []);

  return { ...local, ...fromJob, jobId, submit, cancel, reset: cancel };
}
