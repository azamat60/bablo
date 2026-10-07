import { createContext, useContext } from 'react';

type DeletionActions = {
  requestAccountDeletion: (id: string, onDeleted?: () => void) => void;
  requestTransactionDeletion: (id: string, onDeleted?: () => void) => void;
  requestCategoryDeletion: (id: string, onDeleted?: () => void) => void;
  requestCategoryGroupDeletion: (id: string, onDeleted?: () => void) => void;
};

export const DeletionContext = createContext<DeletionActions | null>(null);

export function useDeletion() {
  const actions = useContext(DeletionContext);
  if (!actions) throw new Error('DeletionProvider is missing.');
  return actions;
}
