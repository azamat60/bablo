import { Minus, Plus, ArrowLeftRight, Camera, Mic, Keyboard } from 'lucide-react';
import type { FabAction } from './Fab.types';

export const FAB_ACTIONS: readonly FabAction[] = [
  { to: '/add/expense', labelKey: 'expense', icon: Minus },
  { to: '/add/income', labelKey: 'income', icon: Plus },
  { to: '/add/transfer', labelKey: 'transfer', icon: ArrowLeftRight },
  { to: '/add/photo', labelKey: 'scanReceipt', icon: Camera },
  { to: '/add/voice', labelKey: 'voice', icon: Mic },
  { to: '/add/text-ai', labelKey: 'quickAddAi', icon: Keyboard },
];
