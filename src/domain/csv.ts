export type CsvTransactionRow = {
  date: string;
  amount: number;
  memo: string;
  categoryName: string;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/** Expects a header row: date,amount,memo,category (extra columns ignored). */
export function parseCsvTransactions(csvText: string): CsvTransactionRow[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]!).map((cell) => cell.trim().toLowerCase());
  const dateIdx = header.indexOf('date');
  const amountIdx = header.indexOf('amount');
  const memoIdx = header.indexOf('memo');
  const categoryIdx = header.indexOf('category');
  if (dateIdx === -1 || amountIdx === -1) return [];

  const rows: CsvTransactionRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const date = cells[dateIdx]?.trim();
    const amount = Number.parseFloat(cells[amountIdx] ?? '');
    if (!date || Number.isNaN(amount)) continue;
    rows.push({
      date,
      amount: Math.round(amount * 100),
      memo: memoIdx >= 0 ? (cells[memoIdx]?.trim() ?? '') : '',
      categoryName: categoryIdx >= 0 ? (cells[categoryIdx]?.trim() ?? '') : '',
    });
  }
  return rows;
}
