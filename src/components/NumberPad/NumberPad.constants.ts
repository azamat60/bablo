export type NumberPadKeyVariant = 'operator' | 'action' | 'dismiss';

export type NumberPadKeyDef = {
  key: string;
  span?: 2;
  variant?: NumberPadKeyVariant;
  /** Rendered instead of `key`; `key` stays the value handed to onKey. */
  label?: string;
};

/**
 * Calculator-style layout: digits ascend, operators run down the right edge.
 * `Close` is not a calculator key — useNumberPad ignores it and the caller
 * hides the pad instead.
 */
export const NUMBER_PAD_ROWS: readonly NumberPadKeyDef[][] = [
  [
    { key: 'C', span: 2, variant: 'action' },
    { key: '⌫', variant: 'action' },
    { key: '÷', variant: 'operator' },
  ],
  [{ key: '1' }, { key: '2' }, { key: '3' }, { key: '×', variant: 'operator' }],
  [{ key: '4' }, { key: '5' }, { key: '6' }, { key: '−', variant: 'operator' }],
  [{ key: '7' }, { key: '8' }, { key: '9' }, { key: '+', variant: 'operator' }],
  [{ key: '.' }, { key: '0' }, { key: '=', variant: 'operator' }, { key: 'Close', variant: 'dismiss' }],
];

export const NUMBER_PAD_DISMISS_KEY = 'Close';
