import { resolveCategoryId, type CategoryLabels } from './categories.js';

export type RawReceiptItem = {
  name: string;
  amount: number;
  category: string;
  confidence: number;
};

export type ReceiptCategoryGroup = {
  categoryId: string;
  amount: number;
  memo: string;
  confidence: number;
};

type GroupAccumulator = {
  categoryId: string;
  cents: number;
  names: string[];
  confidence: number;
};

const MEMO_MAX_LENGTH = 200;
const INVALID_CATEGORY_CONFIDENCE = 0.3;

export const RECEIPT_ITEM_RULES = [
  "An itemised shop receipt must never be booked to a single category. List every purchased line in receiptItems and choose each item's category independently by what that item is: food and drinks → groceries; cigarettes, vapes, pods, IQOS / heets sticks, snus, nasvay → tobacco / nicotine; detergent, soap, shampoo, toothpaste, toilet paper, sponges → household chemicals or hygiene; medicine → pharmacy; alcohol, pet food, baby goods, stationery, clothing and so on → their closest listed category. Fall back to the store's main category only for an item whose type is truly unclear.",
  'receiptItems[].name is the item name as printed, cleaned of article numbers and codes. receiptItems[].amount is the final line sum charged for that item (quantity × price minus any line discount), positive, in major units.',
  'Do not put subtotals, ИТОГ / TOTAL, tax (НДС) breakdowns, payment method, change, cashback or bonus lines into receiptItems.',
  'receiptTotal is the final amount paid for the whole receipt after all discounts (ИТОГ / К ОПЛАТЕ / TOTAL), or null when it is not printed.',
];

export function buildReceiptItemsSchema(labels: CategoryLabels) {
  return {
    type: 'array',
    description: 'Every purchased line of an itemised shop receipt; empty for any other input',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        amount: { type: 'number', description: 'Final line sum, positive, in the major currency unit' },
        category: {
          type: 'string',
          enum: labels.labels,
          description: 'One expense label from the category list for this item, copied exactly',
        },
        confidence: { type: 'number', description: '0 to 1' },
      },
      required: ['name', 'amount', 'category', 'confidence'],
    },
  } as const;
}

export const RECEIPT_TOTAL_SCHEMA = {
  type: ['number', 'null'],
  description: 'Final amount paid for an itemised receipt, or null',
} as const;

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function memoFromNames(names: string[]): string {
  const memo = names.join(', ');

  if (memo.length <= MEMO_MAX_LENGTH) return memo;

  return `${memo.slice(0, MEMO_MAX_LENGTH - 1).trimEnd()}…`;
}

function accumulate(items: RawReceiptItem[], labels: CategoryLabels): GroupAccumulator[] {
  const groups = new Map<string, GroupAccumulator>();

  for (const item of items) {
    const cents = Number.isFinite(item.amount) ? toCents(item.amount) : 0;
    const validCategory = labels.kindByLabel.get(item.category) === 'expense';
    const categoryId = resolveCategoryId(validCategory ? item.category : '', labels, 'expense');

    if (cents <= 0 || !categoryId) continue;

    const confidence = validCategory ? item.confidence : Math.min(item.confidence, INVALID_CATEGORY_CONFIDENCE);
    const group = groups.get(categoryId) ?? { categoryId, cents: 0, names: [], confidence: 1 };
    group.cents += cents;
    group.names.push(item.name.trim());
    group.confidence = Math.min(group.confidence, confidence);
    groups.set(categoryId, group);
  }

  return [...groups.values()];
}

/**
 * Receipt-level discounts and rounding make line sums drift from what was
 * actually paid. The printed total is what leaves the account, so the
 * difference is spread across categories by largest remainder.
 */
function reconcileToTotal(groups: GroupAccumulator[], totalCents: number): number[] {
  const sum = groups.reduce((acc, group) => acc + group.cents, 0);

  if (totalCents <= 0 || sum === totalCents) return groups.map((group) => group.cents);

  const exact = groups.map((group) => (group.cents * totalCents) / sum);
  const floored = exact.map(Math.floor);
  let remainder = totalCents - floored.reduce((acc, cents) => acc + cents, 0);
  const byFraction = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }));
  byFraction.sort((a, b) => b.fraction - a.fraction);

  for (const { index } of byFraction) {
    if (remainder <= 0) break;

    floored[index] += 1;
    remainder -= 1;
  }

  return floored;
}

export function groupReceiptItems(
  items: RawReceiptItem[],
  total: number | null,
  labels: CategoryLabels,
): ReceiptCategoryGroup[] {
  const groups = accumulate(items, labels);
  const totalCents = total !== null && Number.isFinite(total) ? toCents(total) : 0;
  const amounts = reconcileToTotal(groups, totalCents);

  return groups
    .map((group, index) => ({
      categoryId: group.categoryId,
      amount: (amounts[index] ?? group.cents) / 100,
      memo: memoFromNames(group.names),
      confidence: group.confidence,
    }))
    .filter((group) => group.amount > 0);
}
