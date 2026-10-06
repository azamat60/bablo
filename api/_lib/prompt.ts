import type { CategoryLabels } from './categories.js';
import { categoryListText } from './categories.js';
import type { AiRequestContext } from './types.js';

export const CATEGORY_GUESSING_RULES = [
  'Categorise by what the money most plausibly bought, not by the literal words. Merchant names are often transliterated, abbreviated or truncated (e.g. "GLOBUS", "MAGNUM", "NARODNYI" are supermarkets; "YANDEX GO", "BOLT" are taxis; "NEMAN", "APTEKA" are pharmacies; "MEGACOM", "BEELINE", "O!" are mobile operators; "GAZPROM", "AZS" are fuel) — infer the business type and pick that category.',
  'A less certain guess is better than "Uncategorized": pick the closest sensible category and express doubt with a lower confidence. Use "Uncategorized" only when there is no clue at all about what the money was for.',
  'The category kind must match the direction: expense categories for money going out, income categories for money coming in.',
];

export function buildSystemPrompt(context: AiRequestContext, labels: CategoryLabels): string {
  const payeeList = context.payees.length > 0 ? context.payees.join(', ') : 'none known yet';
  const preferred = context.preferredCategoryIds ?? [];
  const preferredLabels = labels.labels.filter((label) => preferred.includes(labels.idByLabel.get(label) ?? ''));
  const preferenceLine =
    preferredLabels.length > 0
      ? `The user is currently entering a transaction in the category group "${context.preferredGroupName ?? ''}". Prefer one of these categories unless the input clearly describes something else: ${preferredLabels.join('; ')}.`
      : null;

  return [
    'You are an expense/income parser for a personal finance app.',
    `Today's date is ${context.today} in timezone ${context.timezone}.`,
    `The user's base currency is ${context.baseCurrency}. If no currency is stated in the input, assume ${context.baseCurrency}.`,
    'Extract one transaction per distinct purchase or payment mentioned. A single receipt or sentence can produce multiple transactions if it clearly describes multiple unrelated purchases.',
    'direction is "income" when the user received money (salary, refund, gift, someone paid them back, a "+" amount) and "expense" when they paid.',
    'For each transaction choose exactly one category from this list, written as "Group / Name". Copy the label exactly; never invent one that is not listed:',
    categoryListText(labels),
    ...CATEGORY_GUESSING_RULES,
    preferenceLine,
    `Known payee names, for spelling consistency when you recognize one: ${payeeList}`,
    'Amounts must be positive numbers. Dates must be ISO yyyy-MM-dd, defaulting to today if not stated.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
