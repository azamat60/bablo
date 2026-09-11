import { useCallback, useEffect, useRef } from 'react';
import { parseText, type AiContextOptions } from '@/lib/aiClient';
import { useT } from '@/i18n';
import { useAiParse, type AiParseState } from './useAiParse';

export type TextAi = AiParseState & {
  submitText: (text: string) => Promise<void>;
};

export function useTextAi(options?: AiContextOptions): TextAi {
  const t = useT();
  const parse = useAiParse('text', t.capture.failedText);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const submitText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await parse.submit(async () => ({ draft: await parseText(trimmed, optionsRef.current) }), {
        inputText: trimmed,
      });
    },
    [parse],
  );

  return { ...parse, submitText };
}
