import { useState } from 'react';

export type NumberPadOperator = '+' | '−' | '×' | '÷';

type NumberPadState = {
  display: string;
  runningTotal: number | null;
  pendingOp: NumberPadOperator | null;
};

const EMPTY_STATE: NumberPadState = { display: '', runningTotal: null, pendingOp: null };

function applyOp(a: number, b: number, op: NumberPadOperator): number {
  switch (op) {
    case '+':
      return a + b;
    case '−':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return b === 0 ? a : a / b;
  }
}

function isOperator(key: string): key is NumberPadOperator {
  return key === '+' || key === '−' || key === '×' || key === '÷';
}

export function useNumberPad(initialDecimal = 0) {
  const [state, setState] = useState<NumberPadState>(() => ({
    ...EMPTY_STATE,
    display: initialDecimal ? String(initialDecimal) : '',
  }));

  const press = (key: string) => {
    setState((prev) => {
      if (key >= '0' && key <= '9') {
        if (prev.display.replace('.', '').length >= 9) return prev;
        return { ...prev, display: prev.display + key };
      }
      if (key === '.') {
        if (prev.display.includes('.')) return prev;
        return { ...prev, display: prev.display === '' ? '0.' : prev.display + '.' };
      }
      if (key === 'C') return EMPTY_STATE;
      if (key === '⌫') {
        if (prev.display.length > 0) return { ...prev, display: prev.display.slice(0, -1) };
        if (prev.pendingOp) return { ...prev, pendingOp: null };
        return prev;
      }
      if (isOperator(key)) {
        const current = prev.display === '' ? (prev.runningTotal ?? 0) : Number.parseFloat(prev.display);
        const total =
          prev.pendingOp && prev.display !== '' ? applyOp(prev.runningTotal ?? 0, current, prev.pendingOp) : current;
        return { display: '', runningTotal: total, pendingOp: key };
      }
      if (key === '=') {
        if (prev.pendingOp && prev.display !== '') {
          const total = applyOp(prev.runningTotal ?? 0, Number.parseFloat(prev.display), prev.pendingOp);
          return { display: String(total), runningTotal: total, pendingOp: null };
        }
        return prev;
      }
      return prev;
    });
  };

  const reset = (decimal = 0) => setState({ ...EMPTY_STATE, display: decimal ? String(decimal) : '' });

  const finalValue =
    state.pendingOp && state.display !== ''
      ? applyOp(state.runningTotal ?? 0, Number.parseFloat(state.display), state.pendingOp)
      : state.display !== ''
        ? Number.parseFloat(state.display)
        : (state.runningTotal ?? 0);

  const displayText =
    state.display !== '' ? state.display : state.runningTotal !== null ? String(state.runningTotal) : '0';

  return {
    displayText,
    minorUnits: Math.round(finalValue * 100),
    isComputing: state.pendingOp !== null,
    press,
    reset,
  };
}
