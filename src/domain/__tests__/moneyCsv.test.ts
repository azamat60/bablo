import { describe, expect, it } from 'vitest';
import { decimalFromMinor, formatMoney, parseMinorUnits } from '../money';
import { parseCsvTransactions } from '../csv';
import { calculateMinor, numberPadTransition } from '@/hooks/useNumberPad';
import { dailyTotals } from '../calendar';
import type { Transaction } from '@/db/types';
describe('money precision', () => {
  it('rounds exact cents and maximum safe boundary', () => {
    expect(parseMinorUnits('0.01')).toBe(1);
    expect(parseMinorUnits('-1.005')).toBe(-101);
    expect(parseMinorUnits('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseMinorUnits('90071992547409.92')).toBeUndefined();
    expect(decimalFromMinor(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');
    expect(formatMoney(Number.MAX_SAFE_INTEGER, 'KGS', 'en-US')).toContain('90,071,992,547,409.91');
    expect(formatMoney(-1, 'KGS', 'en-US')).toContain('-0.01');
  });
  it('calculates cents without floating drift or division by zero', () => {
    expect(calculateMinor(10, 20, '+')).toBe(30);
    expect(calculateMinor(101, 300, '×')).toBe(303);
    expect(calculateMinor(100, 300, '÷')).toBe(33);
    expect(calculateMinor(1, 0, '÷')).toBeUndefined();
    expect(calculateMinor(Number.MAX_SAFE_INTEGER, 1, '+')).toBeUndefined();
    expect(
      numberPadTransition({ display: '90071992547409.91', pendingOp: null, runningTotal: null }, '=').display,
    ).toBe('90071992547409.91');
  });
  it('converts calendar expenses by historic rate', () => {
    const tx: Transaction = {
      id: 'x',
      rev: 1,
      updatedAt: 1,
      deleted: false,
      accountId: 'usd',
      date: '2026-10-05',
      currency: 'USD',
      rate: 87,
      amount: -100,
      source: 'manual',
      cleared: true,
      tags: [],
      attachmentIds: [],
    };
    expect(dailyTotals([tx]).get(tx.date)?.expense).toBe(8700);
  });
});
describe('CSV', () => {
  it('supports quoted commas, multiline, escaped quotes and BOM', () => {
    const rows = parseCsvTransactions('\uFEFFdate,amount,memo,category\n2026-10-05,-10.01,"hello,\n""world""",Food\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(-1001);
    expect(rows[0]?.memo).toBe('hello,\n"world"');
  });
  it('supports decimal comma and rejects nonexistent dates', () => {
    const rows = parseCsvTransactions('date;amount;memo;category\n2026-10-05;0,01;a;Food\n2026-02-30;2;b;Food');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(1);
  });
});
