import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Camera, Image as ImageIcon, Mic, PenLine, Square } from 'lucide-react';
import { useT } from '@/i18n';
import type { AiParseResult } from '../ai/useAiParse';
import { useVoiceCapture } from '../ai/useVoiceCapture';
import { usePhotoCapture } from '../ai/usePhotoCapture';
import { useTextAi } from '../ai/useTextAi';
import type { TransactionSource } from '@/db/types';
import styles from './ComposerAiBar.module.css';

export type ComposerAiBarProps = {
  /** The group the composer is already in; sent to the model as a preference. */
  groupId?: string;
  /** Memo typed so far, forwarded as a caption for receipts. */
  memo: string;
  disabled?: boolean;
  onResult: (result: AiParseResult, source: TransactionSource) => void;
};

type Mode = 'idle' | 'text' | 'photoMenu';

/**
 * Voice · Receipt · Text, inline under the amount. Each finishes by handing an
 * AiDraft back to the composer, which patches the open draft instead of
 * navigating to the review page the standalone capture routes use.
 */
export function ComposerAiBar({ groupId, memo, disabled, onResult }: ComposerAiBarProps) {
  const t = useT();
  const context = { preferredGroupId: groupId };
  const voice = useVoiceCapture(context);
  const photo = usePhotoCapture({ ...context, caption: memo || undefined });
  const text = useTextAi(context);
  const [mode, setMode] = useState<Mode>('idle');
  const [draftText, setDraftText] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Hand each finished result up exactly once. A result can also arrive from
  // the offline queue long after the tap, so this is driven by status rather
  // than by the submit call. The hooks' reset() clears their own state; this
  // component's own state is cleared where the capture starts.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (voice.status === 'done' && voice.result) {
      onResultRef.current(voice.result, 'voice');
      voice.reset();
    }
  }, [voice.status, voice.result, voice.reset, voice]);
  useEffect(() => {
    if (photo.status === 'done' && photo.result) {
      onResultRef.current(photo.result, 'photo');
      photo.reset();
    }
  }, [photo.status, photo.result, photo.reset, photo]);
  useEffect(() => {
    if (text.status === 'done' && text.result) {
      onResultRef.current(text.result, 'text');
      text.reset();
    }
  }, [text.status, text.result, text.reset, text]);

  useEffect(() => {
    if (mode === 'text') textRef.current?.focus();
  }, [mode]);

  const analyzing = voice.status === 'analyzing' || photo.status === 'analyzing' || text.status === 'analyzing';
  const queued = voice.status === 'queued' || photo.status === 'queued' || text.status === 'queued';
  const busy = analyzing || queued;
  const recording = voice.status === 'recording';
  const error = voice.error ?? photo.error ?? text.error;
  const statusText =
    voice.status === 'analyzing'
      ? t.capture.transcribing
      : photo.status === 'analyzing'
        ? t.capture.readingReceipt
        : text.status === 'analyzing'
          ? t.capture.thinking
          : queued
            ? t.capture.offlineNotice
            : null;

  const retry = () => {
    voice.reset();
    photo.reset();
    text.reset();
  };

  const submitText = () => {
    const value = draftText;
    setDraftText('');
    setMode('idle');
    void text.submitText(value);
  };
  const onTextKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitText();
    }
  };

  return (
    <div className={styles.root}>
      <input type="file" accept="image/*" capture="environment" className={styles.hidden} {...photo.cameraInput} />
      <input type="file" accept="image/*" className={styles.hidden} {...photo.galleryInput} />

      {recording ? (
        <div className={styles.row}>
          <button type="button" className={`${styles.pill} ${styles.recordPill}`} onClick={voice.stop}>
            <Square size={14} aria-hidden="true" />
            {t.composerAi.stop}
            <span className={styles.timer}>{voice.seconds}s</span>
          </button>
        </div>
      ) : mode === 'photoMenu' ? (
        <div className={styles.row}>
          <button
            type="button"
            className={`${styles.pill} ${styles.pillAccent}`}
            onClick={() => {
              setMode('idle');
              photo.openCamera();
            }}
          >
            <Camera size={16} aria-hidden="true" />
            {t.composerAi.takePhoto}
          </button>
          <button
            type="button"
            className={`${styles.pill} ${styles.pillAccent}`}
            onClick={() => {
              setMode('idle');
              photo.openGallery();
            }}
          >
            <ImageIcon size={16} aria-hidden="true" />
            {t.composerAi.fromGallery}
          </button>
          <button type="button" className={styles.linkButton} onClick={() => setMode('idle')}>
            {t.common.cancel}
          </button>
        </div>
      ) : (
        <div className={styles.row}>
          <button type="button" className={styles.pill} disabled={disabled || busy} onClick={() => void voice.start()}>
            <Mic size={16} aria-hidden="true" />
            {t.composerAi.voice}
          </button>
          <button
            type="button"
            className={styles.pill}
            disabled={disabled || busy}
            onClick={() => setMode('photoMenu')}
          >
            <Camera size={16} aria-hidden="true" />
            {t.composerAi.receipt}
          </button>
          <button
            type="button"
            className={`${styles.pill} ${mode === 'text' ? styles.pillAccent : ''}`}
            disabled={disabled || busy}
            aria-pressed={mode === 'text'}
            onClick={() => setMode((m) => (m === 'text' ? 'idle' : 'text'))}
          >
            <PenLine size={16} aria-hidden="true" />
            {t.composerAi.text}
          </button>
        </div>
      )}

      {mode === 'text' && !busy && (
        <>
          <textarea
            ref={textRef}
            className={styles.textArea}
            placeholder={t.capture.textPlaceholder}
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            onKeyDown={onTextKey}
            rows={2}
          />
          <div className={styles.row}>
            <button
              type="button"
              className={`${styles.pill} ${styles.pillAccent}`}
              disabled={!draftText.trim()}
              onClick={submitText}
            >
              {t.composerAi.parse}
            </button>
          </div>
        </>
      )}

      {photo.preview && (
        <div className={styles.preview}>
          <img src={photo.preview} alt={t.capture.receiptAlt} className={styles.previewImg} />
          {!busy && (
            <button type="button" className={styles.linkButton} onClick={photo.clearPreview}>
              {t.composerAi.remove}
            </button>
          )}
        </div>
      )}

      {statusText && (
        <div className={styles.status}>
          {analyzing && <span className={styles.spinner} />}
          {statusText}
        </div>
      )}

      {error && !busy && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button type="button" className={styles.linkButton} onClick={retry}>
            {t.composerAi.retry}
          </button>
        </div>
      )}
    </div>
  );
}
