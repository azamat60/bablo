import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { downscaleImageToDataUrl } from '@/domain/image';
import { parseReceipt, type AiContextOptions } from '@/lib/aiClient';
import { useT } from '@/i18n';
import { useAiParse, type AiParseState } from './useAiParse';

export type PhotoCaptureOptions = AiContextOptions & {
  /** Free-text hint sent alongside the image, e.g. the memo typed so far. */
  caption?: string;
};

export type PhotoCapture = AiParseState & {
  /** Downscaled data URL of the last picked image, for a thumbnail. */
  preview: string | null;
  openCamera: () => void;
  openGallery: () => void;
  /** Spread onto the two hidden file inputs the host renders. */
  cameraInput: { ref: RefObject<HTMLInputElement | null>; onChange: (e: ChangeEvent<HTMLInputElement>) => void };
  galleryInput: { ref: RefObject<HTMLInputElement | null>; onChange: (e: ChangeEvent<HTMLInputElement>) => void };
  clearPreview: () => void;
};

/**
 * The file inputs must live in the host's DOM (refs and click()), so the hook
 * hands back props for them instead of rendering anything itself.
 */
export function usePhotoCapture(options: PhotoCaptureOptions = {}): PhotoCapture {
  const t = useT();
  const parse = useAiParse('receipt', t.capture.failedReceipt);
  const [preview, setPreview] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const handleFile = useCallback(
    async (file: File) => {
      const dataUrl = await downscaleImageToDataUrl(file);
      setPreview(dataUrl);
      const { caption, ...context } = optionsRef.current;
      await parse.submit(async () => ({ draft: await parseReceipt(dataUrl, caption, context) }), {
        inputText: dataUrl,
      });
    },
    [parse],
  );

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset so picking the same file again still fires change.
      event.target.value = '';
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  return {
    ...parse,
    preview,
    openCamera: () => cameraRef.current?.click(),
    openGallery: () => galleryRef.current?.click(),
    cameraInput: { ref: cameraRef, onChange },
    galleryInput: { ref: galleryRef, onChange },
    clearPreview: () => setPreview(null),
    reset: () => {
      setPreview(null);
      parse.reset();
    },
  };
}
