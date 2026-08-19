import type OpenAI from 'openai';
import { buildSystemPrompt } from './prompt';
import { buildDraftSchema } from './schema';
import type { AiDraft, AiRequestContext } from './types';

type ParseInput = {
  client: OpenAI;
  model: string;
  context: AiRequestContext;
  text?: string;
  imageDataUrl?: string;
};

export async function parseToDraft({ client, model, context, text, imageDataUrl }: ParseInput): Promise<AiDraft> {
  const content: Array<
    { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'auto' }
  > = [];
  if (text) content.push({ type: 'input_text', text });
  if (imageDataUrl) content.push({ type: 'input_image', image_url: imageDataUrl, detail: 'auto' });
  if (content.length === 0) throw new Error('parseToDraft requires text and/or an image');

  const response = await client.responses.create({
    model,
    instructions: buildSystemPrompt(context),
    input: [{ role: 'user', content }],
    text: {
      format: {
        type: 'json_schema',
        name: 'expense_draft',
        schema: buildDraftSchema(context.categories),
        strict: true,
      },
    },
  });

  const raw = response.output_text;
  if (!raw) throw new Error('Model returned no output');
  return JSON.parse(raw) as AiDraft;
}
