export type TileKind = 'incomeGroup' | 'account' | 'expenseGroup' | 'add';

/**
 * Drag-related appearance. Kept as one enum rather than a set of booleans so a
 * tile can never render two conflicting states at once.
 */
export type TileState = 'idle' | 'lifted' | 'valid' | 'invalid' | 'hover';

export type TileProps = {
  id: string;
  kind: TileKind;
  /** Circle fill. Ignored by the `add` kind, which is always neutral. */
  color?: string;
  icon?: string;
  label: string;
  /** Primary figure under the circle, already formatted. */
  amountText?: string;
  /** Second, smaller line — the assigned budget on expense tiles. */
  secondaryText?: string;
  locked?: boolean;
  state?: TileState;
  onClick?: (id: string) => void;
};
