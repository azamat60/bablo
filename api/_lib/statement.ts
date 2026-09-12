import type OpenAI from 'openai';
import type { AiCategoryContext, AiRequestContext, AiStatement } from './types.js';

export const STATEMENT_MAX_BYTES = 4 * 1024 * 1024;

export function buildStatementPrompt(context: AiRequestContext): string {
  const categoryList = context.categories.map((c) => `- ${c.id}: ${c.name} (${c.kind})`).join('\n');
  const payeeList = context.payees.length > 0 ? context.payees.join(', ') : 'none known yet';

  return [
    'You are a bank statement parser for a personal finance app.',
    `Today's date is ${context.today} in timezone ${context.timezone}.`,
    `The user's base currency is ${context.baseCurrency}. Report the statement currency as an ISO 4217 code when it is stated; otherwise use ${context.baseCurrency}.`,
    'The input is a bank or card statement (PDF). Extract every posted transaction line as one item, in the order it appears. Skip running balance lines, page headers, totals, fee-free summary rows and anything that is not a money movement.',
    'kind: "expense" for money leaving the account, "income" for money arriving, "transfer" for movements between the user\'s own accounts, card top-ups from own accounts, cash withdrawals at an ATM, or repayments of the user\'s own credit card.',
    'amount is always the positive magnitude in major units. Dates are ISO yyyy-MM-dd; if a line shows only day and month, infer the year from the statement period.',
    'payee is the cleaned merchant or counterparty name without terminal ids, city codes, card masks or dates. memo holds any other useful detail from the line, or null.',
    'For each item choose the single best-matching categoryId from this exact list — never invent an id that is not listed:',
    categoryList,
    `Known payee names, for spelling consistency when you recognize one: ${payeeList}`,
    'For transfers pick any listed category of the matching direction and set a low confidence. If a line is genuinely ambiguous, pick the closest "Uncategorized" category and set a low confidence.',
  ].join('\n');
}

export function buildStatementSchema(categories: AiCategoryContext[]) {
  const categoryIds = categories.map((c) => c.id);
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      accountName: {
        type: ['string', 'null'],
        description: 'Bank, product or masked account name shown on the statement',
      },
      currency: { type: ['string', 'null'], description: 'ISO 4217 currency code' },
      periodStart: { type: ['string', 'null'], description: 'ISO date yyyy-MM-dd' },
      periodEnd: { type: ['string', 'null'], description: 'ISO date yyyy-MM-dd' },
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            date: { type: 'string', description: 'ISO date yyyy-MM-dd' },
            amount: { type: 'number', description: 'Positive magnitude in the major currency unit' },
            kind: { type: 'string', enum: ['expense', 'income', 'transfer'] },
            payee: { type: ['string', 'null'] },
            categoryId: { type: 'string', enum: categoryIds },
            memo: { type: ['string', 'null'] },
            confidence: { type: 'number', description: '0 to 1' },
          },
          required: ['date', 'amount', 'kind', 'payee', 'categoryId', 'memo', 'confidence'],
        },
      },
    },
    required: ['accountName', 'currency', 'periodStart', 'periodEnd', 'transactions'],
  } as const;
}

type ParseStatementInput = {
  client: OpenAI;
  model: string;
  context: AiRequestContext;
  filename: string;
  pdfBase64: string;
};

export async function parseStatement({
  client,
  model,
  context,
  filename,
  pdfBase64,
}: ParseStatementInput): Promise<AiStatement> {
  const response = await client.responses.create({
    model,
    instructions: buildStatementPrompt(context),
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_file', filename, file_data: `data:application/pdf;base64,${pdfBase64}` },
          { type: 'input_text', text: 'Extract all transactions from this statement.' },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'bank_statement',
        schema: buildStatementSchema(context.categories),
        strict: true,
      },
    },
  });

  const raw = response.output_text;
  if (!raw) throw new Error('Model returned no output');
  return JSON.parse(raw) as AiStatement;
}
