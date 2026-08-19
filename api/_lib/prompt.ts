import type { AiRequestContext } from './types';

export function buildSystemPrompt(context: AiRequestContext): string {
  const categoryList = context.categories.map((c) => `- ${c.id}: ${c.name} (${c.kind})`).join('\n');
  const payeeList = context.payees.length > 0 ? context.payees.join(', ') : 'none known yet';

  return [
    'You are an expense/income parser for a personal finance app.',
    `Today's date is ${context.today} in timezone ${context.timezone}.`,
    `The user's base currency is ${context.baseCurrency}. If no currency is stated in the input, assume ${context.baseCurrency}.`,
    'Extract one transaction per distinct purchase or payment mentioned. A single receipt or sentence can produce multiple transactions if it clearly describes multiple unrelated purchases.',
    'For each transaction, choose the single best-matching categoryId from this exact list — never invent an id that is not listed:',
    categoryList,
    `Known payee names, for spelling consistency when you recognize one: ${payeeList}`,
    'If a transaction is genuinely ambiguous, pick the closest "Uncategorized" category from the list and set a low confidence.',
    'Amounts must be positive numbers. Dates must be ISO yyyy-MM-dd, defaulting to today if not stated.',
  ].join('\n');
}
