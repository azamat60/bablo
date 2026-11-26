import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { labelCategories } from '../categories.js';
import { parseToDraft } from '../parse.js';
import { groupReceiptItems } from '../receipt.js';
import { parseStatement } from '../statement.js';
import type { AiRequestContext } from '../types.js';

const context: AiRequestContext = {
  categories: [
    { id: 'food', name: 'Продукты', kind: 'expense', group: 'Еда' },
    { id: 'nicotine', name: 'Никотин', kind: 'expense', group: 'Привычки' },
    { id: 'household', name: 'Мыломойка', kind: 'expense', group: 'Дом' },
    { id: 'other', name: 'Без категории', kind: 'expense', group: 'Другое' },
    { id: 'salary', name: 'Зарплата', kind: 'income', group: 'Доходы' },
  ],
  payees: [],
  baseCurrency: 'KGS',
  timezone: 'Asia/Bishkek',
  today: '2026-11-26',
};
const labels = labelCategories(context.categories);

const items = [
  { name: 'Молоко 1л', amount: 95, category: 'Еда / Продукты', confidence: 0.95 },
  { name: 'Хлеб', amount: 40, category: 'Еда / Продукты', confidence: 0.9 },
  { name: 'Сигареты Winston', amount: 250, category: 'Привычки / Никотин', confidence: 0.97 },
  { name: 'Fairy 450мл', amount: 180, category: 'Дом / Мыломойка', confidence: 0.85 },
  { name: 'Мыло детское', amount: 35, category: 'Дом / Мыломойка', confidence: 0.9 },
];

function mockClient(output: Record<string, unknown>) {
  const client = new OpenAI({ apiKey: 'test-key' });
  vi.spyOn(client.responses, 'create').mockResolvedValue({
    output_text: JSON.stringify(output),
  } as OpenAI.Responses.Response);

  return client;
}

describe('groupReceiptItems', () => {
  it('splits a receipt into one row per category with item names as memo', () => {
    const groups = groupReceiptItems(items, 600, labels);

    expect(groups).toEqual([
      { categoryId: 'food', amount: 135, memo: 'Молоко 1л, Хлеб', confidence: 0.9 },
      { categoryId: 'nicotine', amount: 250, memo: 'Сигареты Winston', confidence: 0.97 },
      { categoryId: 'household', amount: 215, memo: 'Fairy 450мл, Мыло детское', confidence: 0.85 },
    ]);
  });

  it('spreads a receipt-level discount so rows add up to the paid total exactly', () => {
    const groups = groupReceiptItems(items, 570.01, labels);
    const sum = groups.reduce((acc, group) => acc + Math.round(group.amount * 100), 0);

    expect(sum).toBe(57001);
    expect(groups.map((group) => group.categoryId)).toEqual(['food', 'nicotine', 'household']);
  });

  it('sends unknown labels to the uncategorized fallback with low confidence and skips empty lines', () => {
    const groups = groupReceiptItems(
      [
        { name: 'Пакет', amount: 5, category: 'Invented', confidence: 0.9 },
        { name: 'Скидка', amount: 0, category: 'Еда / Продукты', confidence: 1 },
      ],
      null,
      labels,
    );

    expect(groups).toEqual([{ categoryId: 'other', amount: 5, memo: 'Пакет', confidence: 0.3 }]);
  });
});

describe('receipt parsing', () => {
  it('turns a PDF receipt into per-category expense rows', async () => {
    const client = mockClient({
      documentType: 'receipt',
      accountName: null,
      currency: 'KGS',
      periodStart: null,
      periodEnd: null,
      transactions: [],
      receiptMerchant: 'Globus',
      receiptDate: '2026-11-25',
      receiptTotal: 600,
      receiptItems: items,
    });
    const statement = await parseStatement({ client, model: 'm', context, filename: 'check.pdf', pdfBase64: '' });

    expect(statement.periodStart).toBe('2026-11-25');
    expect(statement.transactions).toHaveLength(3);
    expect(statement.transactions[1]).toMatchObject({
      date: '2026-11-25',
      amount: 250,
      kind: 'expense',
      payee: 'Globus',
      categoryId: 'nicotine',
    });
  });

  it('groups items from a photo receipt draft instead of one total transaction', async () => {
    const client = mockClient({
      merchant: 'Globus',
      date: '2026-11-25',
      currency: 'KGS',
      transactions: [],
      receiptItems: items,
      receiptTotal: 600,
    });
    const draft = await parseToDraft({ client, model: 'm', context, imageDataUrl: 'data:image/png;base64,AA==' });

    expect(draft.transactions.map((tx) => [tx.categoryId, tx.amount])).toEqual([
      ['food', 135],
      ['nicotine', 250],
      ['household', 215],
    ]);
    expect(draft).not.toHaveProperty('receiptItems');
  });
});
