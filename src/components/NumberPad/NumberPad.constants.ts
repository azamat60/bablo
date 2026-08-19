export type NumberPadKeyVariant = 'operator' | 'action';

export type NumberPadKeyDef = {
  key: string;
  span?: 2;
  variant?: NumberPadKeyVariant;
};

export const NUMBER_PAD_ROWS: readonly NumberPadKeyDef[][] = [
  [{ key: '7' }, { key: '8' }, { key: '9' }, { key: '÷', variant: 'operator' }],
  [{ key: '4' }, { key: '5' }, { key: '6' }, { key: '×', variant: 'operator' }],
  [{ key: '1' }, { key: '2' }, { key: '3' }, { key: '−', variant: 'operator' }],
  [{ key: 'C', variant: 'action' }, { key: '0' }, { key: '.' }, { key: '+', variant: 'operator' }],
  [
    { key: '⌫', span: 2, variant: 'action' },
    { key: '=', span: 2, variant: 'operator' },
  ],
];
