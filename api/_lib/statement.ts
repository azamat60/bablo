import type OpenAI from 'openai';
import { categoryListText, labelCategories, resolveCategoryId, type CategoryLabels } from './categories.js';
import { CATEGORY_GUESSING_RULES } from './prompt.js';
import type { AiRequestContext, AiStatement, AiStatementTransaction } from './types.js';

export const STATEMENT_MAX_BYTES = 4 * 1024 * 1024;

export function buildStatementPrompt(context: AiRequestContext, labels: CategoryLabels): string {
  const payeeList = context.payees.length > 0 ? context.payees.join(', ') : 'none known yet';

  return [
    'You are a bank statement parser for a personal finance app.',
    `Today's date is ${context.today} in timezone ${context.timezone}.`,
    `The user's base currency is ${context.baseCurrency}. Report the statement currency as an ISO 4217 code when it is stated; otherwise use ${context.baseCurrency}.`,
    'The input is a bank or card statement (PDF). Extract every posted transaction line as one item, in the order it appears. Skip running balance lines, page headers, totals, fee-free summary rows and anything that is not a money movement.',
    'Direction is decided from how the amount is printed, never from the merchant alone:',
    '- First copy the amount exactly as printed, including its sign, into amountAsPrinted. Only then decide kind.',
    '- A leading "+" means money arrived: kind "income". A leading "-" or "−" means money left: kind "expense".',
    '- When there is no sign, use the column: an amount in a credit / приход / зачисление / поступление / пополнение column is "income"; one in a debit / расход / списание / оплата column is "expense". Two-column statements keep the same column order on every page — track it carefully row by row.',
    '- When there is neither sign nor column, use the wording: зачисление, пополнение, поступление, возврат, refund, зарплата, salary, deposit, cashback, "перевод от" → income; оплата, покупка, списание, снятие, комиссия, purchase, payment, withdrawal, "перевод на" → expense.',
    '- kind "transfer" is only for movements between the user\'s own accounts: card top-ups from own accounts, transfers to own cards or deposits, ATM cash withdrawals, repayments of the user\'s own credit card.',
    'amount is always the positive magnitude in major units. Dates are ISO yyyy-MM-dd; if a line shows only day and month, infer the year from the statement period.',
    'payee is the cleaned merchant or counterparty name without terminal ids, city codes, card masks or dates. memo holds any other useful detail from the line, or null.',
    'For each item choose exactly one category from this list, written as "Group / Name". Copy the label exactly; never invent one that is not listed:',
    categoryListText(labels),
    ...CATEGORY_GUESSING_RULES,
    'For transfers pick any listed category of the matching direction and set a low confidence.',
    `Known payee names, for spelling consistency when you recognize one: ${payeeList}`,
  ].join('\n');
}

export function buildStatementSchema(labels: CategoryLabels) {
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
            amountAsPrinted: {
              type: 'string',
              description: 'The amount exactly as printed on the line, including any leading + or - sign',
            },
            amount: { type: 'number', description: 'Positive magnitude in the major currency unit' },
            kind: { type: 'string', enum: ['expense', 'income', 'transfer'] },
            payee: { type: ['string', 'null'] },
            memo: { type: ['string', 'null'] },
            category: {
              type: 'string',
              enum: labels.labels,
              description: 'One label from the category list, copied exactly',
            },
            confidence: { type: 'number', description: '0 to 1' },
          },
          required: ['date', 'amountAsPrinted', 'amount', 'kind', 'payee', 'memo', 'category', 'confidence'],
        },
      },
    },
    required: ['accountName', 'currency', 'periodStart', 'periodEnd', 'transactions'],
  } as const;
}

type RawStatementTransaction = Omit<AiStatementTransaction, 'categoryId'> & {
  amountAsPrinted: string;
  category: string;
};
type RawStatement = Omit<AiStatement, 'transactions'> & { transactions: RawStatementTransaction[] };

const PRINTED_SIGN = /^\s*([+\-−–])/;

/** The sign the model copied from the page is more reliable than the kind it reasoned its way to. */
export function kindFromPrintedSign(printed: string): 'income' | 'expense' | null {
  const sign = PRINTED_SIGN.exec(printed)?.[1];
  if (!sign) return null;
  return sign === '+' ? 'income' : 'expense';
}

function normaliseTransaction(raw: RawStatementTransaction, labels: CategoryLabels): AiStatementTransaction | null {
  const { amountAsPrinted, category, ...tx } = raw;
  const signed = kindFromPrintedSign(amountAsPrinted);
  const kind = tx.kind !== 'transfer' && signed ? signed : tx.kind;
  const categoryId = resolveCategoryId(category, labels, kind === 'income' ? 'income' : 'expense');
  return categoryId ? { ...tx, kind, categoryId } : null;
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
  const labels = labelCategories(context.categories);
  const response = await client.responses.create({
    model,
    instructions: buildStatementPrompt(context, labels),
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
        schema: buildStatementSchema(labels),
        strict: true,
      },
    },
  });

  const raw = response.output_text;
  if (!raw) throw new Error('Model returned no output');
  const statement = JSON.parse(raw) as RawStatement;
  return {
    ...statement,
    transactions: statement.transactions
      .map((tx) => normaliseTransaction(tx, labels))
      .filter((tx): tx is AiStatementTransaction => tx !== null),
  };
}
