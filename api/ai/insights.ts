import { getOpenAIClient, jsonError, MissingApiKeyError } from '../_lib/openai';
import { AI_MODELS } from '../_lib/models';

type InsightsRequestBody = {
  month: string;
  baseCurrency: string;
  totalIncome: number;
  totalExpense: number;
  byCategory: { name: string; amount: number }[];
};

export async function POST(request: Request): Promise<Response> {
  let body: InsightsRequestBody;
  try {
    body = (await request.json()) as InsightsRequestBody;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  try {
    const client = getOpenAIClient();
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
    console.error('[ai/insights]', err);
    return jsonError('Failed to generate insights', 500);
  }
}
