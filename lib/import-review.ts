import { duplicateKey, type Transaction } from "./budget.ts";

export type Review = Transaction & {
  selected: boolean;
  confidence: string;
  note: string;
  currency: string;
  duplicate: boolean;
  confirmedKey?: string;
};

export function checkDuplicates(rows: Review[], existing: Transaction[]) {
  const known = new Set(existing.map(duplicateKey));
  return rows.map((row) => {
    const key = duplicateKey(row);
    const duplicate = row.currency === "KGS" && known.has(key);
    if (row.currency === "KGS") known.add(key);
    const confirmedKey =
      duplicate && row.confirmedKey === key ? key : undefined;
    return {
      ...row,
      duplicate,
      confirmedKey,
      selected:
        row.currency === "KGS" &&
        row.selected &&
        (!duplicate || !!confirmedKey),
    };
  });
}

export function editReview(
  rows: Review[],
  id: string,
  patch: Partial<Review>,
  existing: Transaction[],
) {
  const changed = rows.map((row) => {
    if (row.id !== id) return row;
    const next = { ...row, ...patch };
    if (patch.selected === true && row.duplicate)
      next.confirmedKey = duplicateKey(next);
    return next;
  });
  return checkDuplicates(changed, existing);
}
