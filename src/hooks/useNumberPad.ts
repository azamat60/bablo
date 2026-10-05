import { useState } from 'react';
import { decimalFromMinor, parseMinorUnits } from '@/domain/money';
export type NumberPadOperator = '+' | '−' | '×' | '÷';
export type NumberPadState = { display: string; runningTotal: number | null; pendingOp: NumberPadOperator | null };
const EMPTY: NumberPadState = { display: '', runningTotal: null, pendingOp: null };
function rounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator,
    d = denominator < 0n ? -denominator : denominator;
  const result = n / d + ((n % d) * 2n >= d ? 1n : 0n);
  return negative ? -result : result;
}
export function calculateMinor(a: number, b: number, op: NumberPadOperator): number | undefined {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || (op === '÷' && b === 0)) return undefined;
  const x = BigInt(a),
    y = BigInt(b);
  const result = op === '+' ? x + y : op === '−' ? x - y : op === '×' ? rounded(x * y, 100n) : rounded(x * 100n, y);
  return result > BigInt(Number.MAX_SAFE_INTEGER) || result < -BigInt(Number.MAX_SAFE_INTEGER)
    ? undefined
    : Number(result);
}
function isOperator(key: string): key is NumberPadOperator {
  return ['+', '−', '×', '÷'].includes(key);
}
function value(state: NumberPadState): number | undefined {
  const current = state.display ? parseMinorUnits(state.display) : (state.runningTotal ?? 0);
  if (current === undefined) return undefined;
  return state.pendingOp && state.display ? calculateMinor(state.runningTotal ?? 0, current, state.pendingOp) : current;
}
export function numberPadTransition(prev: NumberPadState, key: string): NumberPadState {
  if (/^\d$/.test(key)) {
    const next = prev.display === '0' ? key : prev.display + key;
    if ((next.split('.')[1]?.length && next.split('.')[1]!.length > 2) || parseMinorUnits(next) === undefined)
      return prev;
    return { ...prev, display: next };
  }
  if (key === '.')
    return prev.display.includes('.') ? prev : { ...prev, display: prev.display ? prev.display + '.' : '0.' };
  if (key === 'C') return EMPTY;
  if (key === '⌫') return prev.display ? { ...prev, display: prev.display.slice(0, -1) } : { ...prev, pendingOp: null };
  if (isOperator(key)) {
    const total = value(prev);
    return total === undefined ? prev : { display: '', runningTotal: total, pendingOp: key };
  }
  if (key === '=' && prev.pendingOp && prev.display) {
    const total = value(prev);
    return total === undefined ? prev : { display: decimalFromMinor(total), runningTotal: total, pendingOp: null };
  }
  return prev;
}
export function useNumberPad(initialDecimal: string | number = '') {
  const [state, setState] = useState<NumberPadState>(() => ({
    ...EMPTY,
    display: initialDecimal ? String(initialDecimal) : '',
  }));
  const final = value(state);
  return {
    displayText: state.display || (state.runningTotal === null ? '0' : decimalFromMinor(state.runningTotal)),
    amountText: final === undefined ? '' : decimalFromMinor(final),
    minorUnits: final ?? 0,
    isComputing: state.pendingOp !== null,
    press: (key: string) => setState((prev) => numberPadTransition(prev, key)),
    reset: (decimal: string | number = '') => setState({ ...EMPTY, display: decimal ? String(decimal) : '' }),
  };
}
