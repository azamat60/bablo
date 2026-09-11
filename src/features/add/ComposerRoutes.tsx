import { useParams } from 'react-router';
import { ComposerPage } from './Composer';
import type { TxDraftKind } from '@/store/txDraft';

/**
 * `/add/tx` is canonical, but `/add/expense`, `/add/income` and
 * `/add/transfer` must keep resolving: they are declared as PWA manifest
 * shortcuts, and an installed app caches that manifest.
 */
export function SeededComposerRoute({ kind }: { kind: TxDraftKind }) {
  return <ComposerPage seedKind={kind} />;
}

export function EditTransactionRoute() {
  const { id } = useParams();
  if (!id) return null;
  return <ComposerPage editingId={id} />;
}
