import { ArrowLeftRight, Camera, FileText, Keyboard, Mic } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type CaptureEntry = {
  to: string;
  labelKey: 'scanReceipt' | 'voice' | 'quickAddAi' | 'statement' | 'transfer';
  icon: LucideIcon;
  /** AI-backed entries are grouped first and given the accent treatment. */
  ai: boolean;
};

export const CAPTURE_ENTRIES: readonly CaptureEntry[] = [
  { to: '/add/photo', labelKey: 'scanReceipt', icon: Camera, ai: true },
  { to: '/add/voice', labelKey: 'voice', icon: Mic, ai: true },
  { to: '/add/text-ai', labelKey: 'quickAddAi', icon: Keyboard, ai: true },
  { to: '/add/statement', labelKey: 'statement', icon: FileText, ai: true },
  { to: '/add/transfer', labelKey: 'transfer', icon: ArrowLeftRight, ai: false },
];
