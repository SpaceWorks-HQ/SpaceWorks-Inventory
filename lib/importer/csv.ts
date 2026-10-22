/**
 * A small RFC 4180 CSV reader and writer (pure, client-safe).
 *
 * Reading: quoted fields may hold commas, line breaks and doubled quotes
 * (`""`); CRLF, LF and lone CR all end a record; a leading UTF-8 BOM is
 * dropped; unquoted cells are trimmed; lines with no content are skipped.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let wasQuoted = false;
  let index = 0;

  const endCell = () => {
    row.push(wasQuoted ? cell : cell.trim());
    cell = "";
    wasQuoted = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.trim() === "") {
      // An opening quote (whitespace before it is ignored).
      quoted = true;
      wasQuoted = true;
      cell = "";
    } else if (char === ",") {
      endCell();
    } else if (char === "\r" || char === "\n") {
      endRow();
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else if (!(wasQuoted && !quoted && (char === " " || char === "\t"))) {
      // Whitespace after a closing quote is ignored; anything else is kept.
      cell += char;
    }
    index += 1;
  }
  if (cell !== "" || wasQuoted || row.length > 0) endRow();
  return rows;
}

/** One CSV cell, quoted when needed. Cells starting with = + - @ are prefixed so spreadsheets never run them as formulas. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
