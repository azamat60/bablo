import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { parseStatement } from '../statement.js';
import type { AiRequestContext } from '../types.js';

const context: AiRequestContext = {
  categories: [
    { id: 'food', name: 'Продукты', kind: 'expense', group: 'Еда' },
    { id: 'other', name: 'Без категории', kind: 'expense', group: 'Другое' },
    { id: 'salary', name: 'Зарплата', kind: 'income', group: 'Доходы' },
  ],
  payees: [],
  baseCurrency: 'KGS',
  timezone: 'Asia/Bishkek',
  today: '2026-10-07',
};
const transaction = {
  date: '2026-10-06',
  amountAsPrinted: '-100.00',
  amount: 100,
  kind: 'expense',
  payee: 'NARODNYI 42',
  memo: 'Оплата картой',
  category: 'Еда / Продукты',
  confidence: 0.65,
  categoryGuessed: true,
  categoryReason: 'Сокращённое название похоже на супермаркет',
};

async function parse(transactions: Record<string, unknown>[]) {
  const client = new OpenAI({ apiKey: 'test-key' });
  const create = vi.spyOn(client.responses, 'create').mockResolvedValue({
    output_text: JSON.stringify({
      accountName: 'Test bank',
      currency: 'KGS',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-07',
      transactions,
    }),
  } as OpenAI.Responses.Response);
  const statement = await parseStatement({ client, model: 'test-model', context, filename: 'test.pdf', pdfBase64: '' });
  return { statement, create };
}

describe('statement category guesses', () => {
  it('keeps inferred category, source memo, confidence and explanation without changing financial facts', async () => {
    const { statement, create } = await parse([transaction]);
    expect(statement.transactions[0]).toMatchObject({
      date: '2026-10-06',
      amount: 100,
      kind: 'expense',
      payee: 'NARODNYI 42',
      categoryId: 'food',
      confidence: 0.65,
    });
    expect(statement.transactions[0]?.memo).toContain('Оплата картой');
    expect(statement.transactions[0]?.memo).toContain('Confidence level: 65% (оценка AI)');
    expect(statement.transactions[0]?.memo).toContain(transaction.categoryReason);
    expect(create.mock.calls[0]?.[0]?.instructions).toContain('Do not invent purchases, merchants, dates or amounts');
    expect(create.mock.calls[0]?.[0]?.text?.format).toMatchObject({
      strict: true,
      schema: {
        properties: {
          transactions: {
            items: {
              properties: {
                categoryGuessed: { type: 'boolean' },
                categoryReason: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    });
  });

  it('caps guessed confidence but leaves a clear transaction memo unchanged', async () => {
    const { statement } = await parse([
      { ...transaction, confidence: 0.99 },
      { ...transaction, categoryGuessed: false, categoryReason: null, confidence: 0.95 },
    ]);
    expect(statement.transactions[0]?.confidence).toBe(0.79);
    expect(statement.transactions[0]?.memo).toContain('Confidence level: 79%');
    expect(statement.transactions[1]?.confidence).toBe(0.95);
    expect(statement.transactions[1]?.memo).toBe('Оплата картой');
  });

  it('uses a category of the printed direction and flags invalid category fallback', async () => {
    const { statement } = await parse([
      { ...transaction, amountAsPrinted: '+100.00', categoryGuessed: false },
      { ...transaction, category: 'Invented category', categoryGuessed: false },
    ]);
    expect(statement.transactions[0]).toMatchObject({ kind: 'income', categoryId: 'salary', confidence: 0.3 });
    expect(statement.transactions[1]).toMatchObject({ kind: 'expense', categoryId: 'other', confidence: 0.3 });
    expect(statement.transactions.every((row) => row.memo?.includes('категория предположена'))).toBe(true);
  });
});
