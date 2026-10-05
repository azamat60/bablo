import { ApiError, readJson, withAiAttempt } from '../_lib/security.js';
import { getOpenAIClient, jsonError, MissingApiKeyError } from '../_lib/openai.js';
import { AI_MODELS } from '../_lib/models.js';

type InsightsRequestBody = {
  month: string;
  baseCurrency: string;
  totalIncome: number;
  totalExpense: number;
  byCategory: { name: string; amount: number }[];
};

async function handlePost(request: Request): Promise<Response> {
  let body: InsightsRequestBody;
  try {
    body = (await readJson(request, 512 * 1024)) as InsightsRequestBody;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return jsonError('Invalid JSON body', 400);
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month) ||
    !/^[A-Z]{3}$/.test(body.baseCurrency) ||
    !Number.isSafeInteger(body.totalIncome) ||
    !Number.isSafeInteger(body.totalExpense) ||
    !Array.isArray(body.byCategory) ||
    body.byCategory.length > 2000 ||
    body.byCategory.some(
      (c) => !c || typeof c.name !== 'string' || c.name.length > 200 || !Number.isSafeInteger(c.amount),
    )
  )
    return jsonError('Неверные данные аналитики.', 400);

  try {
    const client = getOpenAIClient(request.signal);
    const topCategories = body.byCategory
      .slice()
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((c) => `${c.name}: ${(c.amount / 100).toFixed(2)} ${body.baseCurrency}`)
      .join(', ');

    const response = await client.responses.create({
      model: AI_MODELS.parse,
      instructions:
        'You are a friendly personal finance coach. Write a concise 2-3 sentence summary of the month, ' +
        'highlighting one useful observation or tip. Plain text, no markdown, no headers.',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Month: ${body.month}. Income: ${(body.totalIncome / 100).toFixed(2)} ${body.baseCurrency}. Expenses: ${(
                body.totalExpense / 100
              ).toFixed(2)} ${body.baseCurrency}. Top categories: ${topCategories || 'none'}.`,
            },
          ],
        },
      ],
    });

    return Response.json({ summary: response.output_text ?? '' });
  } catch (err) {
    if (err instanceof MissingApiKeyError) return jsonError(err.message, 503);
    return jsonError('Failed to generate insights', 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  return withAiAttempt(request, (signal) => handlePost(new Request(request, { signal })));
}
