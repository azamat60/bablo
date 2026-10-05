import type { CategoryLabels } from './categories.js';

export function buildDraftSchema(labels: CategoryLabels) {
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
            memo: { type: ['string', 'null'] },
            category: {
              type: 'string',
              enum: labels.labels,
              description: 'One label from the category list, copied exactly',
            },
            confidence: { type: 'number', description: '0 to 1' },
          },
          required: ['amount', 'direction', 'memo', 'category', 'confidence'],
        },
      },
    },
    required: ['merchant', 'date', 'currency', 'transactions'],
  } as const;
}
