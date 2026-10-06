import type OpenAI from 'openai';
import { labelCategories, resolveCategoryId } from './categories.js';
import { buildSystemPrompt } from './prompt.js';
import { buildDraftSchema } from './schema.js';
import type { AiDraft, AiDraftTransaction, AiRequestContext } from './types.js';

type ParseInput = {
  client: OpenAI;
  model: string;
  context: AiRequestContext;
  text?: string;
  imageDataUrl?: string;
};

type RawDraftTransaction = Omit<AiDraftTransaction, 'categoryId'> & { category: string };
type RawDraft = Omit<AiDraft, 'transactions'> & { transactions: RawDraftTransaction[] };

export async function parseToDraft({ client, model, context, text, imageDataUrl }: ParseInput): Promise<AiDraft> {
  const content: Array<
    { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'auto' }
  > = [];
  if (text) content.push({ type: 'input_text', text });
  if (imageDataUrl) content.push({ type: 'input_image', image_url: imageDataUrl, detail: 'auto' });
  if (content.length === 0) throw new Error('parseToDraft requires text and/or an image');

  const labels = labelCategories(context.categories);
  const response = await client.responses.create({
    model,
    instructions: buildSystemPrompt(context, labels),
    input: [{ role: 'user', content }],
    text: {
      format: {
        type: 'json_schema',
        name: 'expense_draft',
        schema: buildDraftSchema(labels),
        strict: true,
      },
    },
  });

  const raw = response.output_text;
  if (!raw) throw new Error('Model returned no output');
  const draft = JSON.parse(raw) as RawDraft;
  return {
    ...draft,
    transactions: draft.transactions.flatMap(({ category, ...tx }) => {
      const categoryId = resolveCategoryId(category, labels, tx.direction);
      return categoryId ? [{ ...tx, categoryId }] : [];
    }),
  };
}
