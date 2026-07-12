export interface BulkStudentRow {
  name: string;
  email: string;
  class: string;
  pin: string;
  balance?: string;
}

const EXPECTED_HEADERS = ['name', 'email', 'class', 'pin', 'balance'];

// Naive comma/tab splitter for pasted or uploaded roster text. Known
// limitation: it does not handle quoted fields with embedded commas (e.g. a
// name like "Doe, Jr."). Rows like that should go through manual entry
// instead — callers should surface this near the input.
export function parseCsvText(text: string): BulkStudentRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const splitLine = (line: string) => line.split(line.includes('\t') ? '\t' : ',').map((c) => c.trim());

  let dataLines = lines;
  const firstCells = splitLine(lines[0]).map((c) => c.toLowerCase());
  const looksLikeHeader = EXPECTED_HEADERS.some((h) => firstCells.includes(h));

  let columnOrder = ['name', 'email', 'class', 'pin', 'balance'];
  if (looksLikeHeader) {
    columnOrder = firstCells;
    dataLines = lines.slice(1);
  }

  return dataLines.map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    columnOrder.forEach((col, i) => {
      if (cells[i] !== undefined) row[col] = cells[i];
    });
    return {
      name: row.name || '',
      email: row.email || '',
      class: row.class || '',
      pin: row.pin || '',
      balance: row.balance,
    };
  });
}
