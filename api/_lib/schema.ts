import type { AiCategoryContext } from './types';

export function buildDraftSchema(categories: AiCategoryContext[]) {
  const categoryIds = categories.map((c) => c.id);
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      merchant: { type: ['string', 'null'] },
      date: { type: ['string', 'null'], description: 'ISO date yyyy-MM-dd, or null if unknown' },
      currency: { type: ['string', 'null'], description: 'ISO 4217 currency code detected in the input, or null' },
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            amount: { type: 'number', description: 'Positive magnitude in the major currency unit' },
            direction: { type: 'string', enum: ['expense', 'income'] },
            categoryId: { type: 'string', enum: categoryIds },
            memo: { type: ['string', 'null'] },
            confidence: { type: 'number', description: '0 to 1' },
          },
          required: ['amount', 'direction', 'categoryId', 'memo', 'confidence'],
        },
      },
    },
    required: ['merchant', 'date', 'currency', 'transactions'],
  } as const;
}
