const GUESS_PREFIX = '[AI: категория предположена.';
const GUESS_SUFFIX = /(?:\n\n)?\[AI: категория предположена\.[^\[\]]*\]$/u;
const singleLine = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/[\[\]]/g, '')
    .trim();

export function stripCategoryGuess(memo: string): string {
  return memo.replace(GUESS_SUFFIX, '');
}

export function appendCategoryGuess(
  memo: string | null,
  category: string,
  confidence: number,
  reason: string | null,
): string {
  const original = stripCategoryGuess(memo ?? '').trim();
  const explanation = reason ? ` Основание: ${singleLine(reason).slice(0, 300)}.` : '';
  const note = `${GUESS_PREFIX} Категория: ${singleLine(category)}. Confidence level: ${Math.round(confidence * 100)}% (оценка AI).${explanation}]`;
  return original ? `${original}\n\n${note}` : note;
}
