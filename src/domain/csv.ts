import { parseMinorUnits } from './money';

export type CsvTransactionRow = {
  date: string;
  amount: number;
  memo: string;
  categoryName: string;
};

function parseCsvRecords(text: string, delimiter: string): string[][] | undefined {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;

  const finishCell = () => {
    record.push(cell);
    cell = '';
    closedQuote = false;
  };
  const finishRecord = () => {
    finishCell();
    if (record.some((value) => value.trim())) records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else cell += char;
      continue;
    }
    if (char === delimiter) finishCell();
    else if (char === '\r' || char === '\n') {
      finishRecord();
      if (char === '\r' && text[i + 1] === '\n') i += 1;
    } else if (char === '"') {
      if (cell.trim() || closedQuote) return undefined;
      cell = '';
      quoted = true;
    } else if (closedQuote) {
      if (char.trim()) return undefined;
    } else cell += char;
  }
  if (quoted) return undefined;
  finishRecord();
  return records;
}

function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** Expects a header row: date,amount,memo,category (extra columns ignored). */
export function parseCsvTransactions(csvText: string): CsvTransactionRow[] {
  const text = csvText.replace(/^\uFEFF/, '');
  for (const delimiter of [',', ';']) {
    const records = parseCsvRecords(text, delimiter);
    if (!records || records.length < 2) continue;
    const header = records[0]!.map((cell) => cell.trim().toLowerCase());
    const dateIdx = header.indexOf('date');
    const amountIdx = header.indexOf('amount');
    if (dateIdx === -1 || amountIdx === -1) continue;
    const memoIdx = header.indexOf('memo');
    const categoryIdx = header.indexOf('category');
    const rows: CsvTransactionRow[] = [];
    for (const cells of records.slice(1)) {
      if (cells.length !== header.length) continue;
      const date = cells[dateIdx]?.trim() ?? '';
      const amount = parseMinorUnits(cells[amountIdx] ?? '');
      if (!isValidDate(date) || amount === undefined) continue;
      rows.push({
        date,
        amount,
        memo: memoIdx >= 0 ? (cells[memoIdx]?.trim() ?? '') : '',
        categoryName: categoryIdx >= 0 ? (cells[categoryIdx]?.trim() ?? '') : '',
      });
    }
    return rows;
  }
  return [];
}
