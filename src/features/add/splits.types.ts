/** A split row while it is being edited: amount is free text, category optional. */
export type SplitRow = {
  localId: string;
  categoryId?: string;
  amountText: string;
};
