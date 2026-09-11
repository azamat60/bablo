/**
 * Which tile can be dropped on which, and what transaction that produces.
 *
 * Pure and dependency-free so both the highlight pass and the drop handler can
 * share it. They must: if the two ever disagree, a tile lights up as a valid
 * target and then rejects the drop.
 */

export type DragKind = 'incomeGroup' | 'account' | 'expenseGroup';

export type DragItem = {
  id: string;
  kind: DragKind;
  /** Presentation only — carried so the ghost can render without a lookup. */
  color?: string;
  icon?: string;
  label?: string;
};

export type DropTargetMeta = {
  id: string;
  kind: DragKind;
};

export type DropOutcome =
  | { kind: 'income'; accountId: string; groupId: string }
  | { kind: 'expense'; accountId: string; groupId: string }
  | { kind: 'transfer'; fromAccountId: string; toAccountId: string };

/**
 * Returns the transaction a drop would create, or null if the pairing is
 * meaningless (income group onto an expense group, a tile onto itself, ...).
 */
export function resolveDrop(source: DragItem, target: DropTargetMeta): DropOutcome | null {
  if (source.id === target.id) return null;

  // Income flows from a category into an account.
  if (source.kind === 'incomeGroup' && target.kind === 'account') {
    return { kind: 'income', accountId: target.id, groupId: source.id };
  }
  // ...and the same pairing grabbed the other way round means the same thing.
  if (source.kind === 'account' && target.kind === 'incomeGroup') {
    return { kind: 'income', accountId: source.id, groupId: target.id };
  }

  // Money leaves an account for an expense category.
  if (source.kind === 'account' && target.kind === 'expenseGroup') {
    return { kind: 'expense', accountId: source.id, groupId: target.id };
  }
  if (source.kind === 'expenseGroup' && target.kind === 'account') {
    return { kind: 'expense', accountId: target.id, groupId: source.id };
  }

  // Account to account is a transfer, in the direction it was dragged.
  if (source.kind === 'account' && target.kind === 'account') {
    return { kind: 'transfer', fromAccountId: source.id, toAccountId: target.id };
  }

  return null;
}

/**
 * The set of targets to highlight while `source` is in the air.
 *
 * Derived from resolveDrop rather than reimplementing the table, so highlight
 * and accept can never drift apart.
 */
export function validTargetIds(source: DragItem, targets: readonly DropTargetMeta[]): Set<string> {
  return new Set(targets.filter((target) => resolveDrop(source, target) !== null).map((target) => target.id));
}

/** The route a resolved drop opens, with the composer pre-seeded. */
export function dropToDraft(outcome: DropOutcome) {
  switch (outcome.kind) {
    case 'income':
      return { kind: 'income' as const, accountId: outcome.accountId, groupId: outcome.groupId };
    case 'expense':
      return { kind: 'expense' as const, accountId: outcome.accountId, groupId: outcome.groupId };
    case 'transfer':
      return { kind: 'transfer' as const, accountId: outcome.fromAccountId, toAccountId: outcome.toAccountId };
  }
}
